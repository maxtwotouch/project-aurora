import * as Notifications from 'expo-notifications';

import { getCurrentLanguage } from '../i18n';
import { getStoredItem, setStoredItem } from '../lib/storage';
import { composeAlertNotification, isAlertTier, parseAlertPushData, planTopicsForTier } from './alertsClient';
import type { AlertTier } from './alertsClient';
import {
  isAlertsAvailable,
  onAlertsMessage,
  registerAlertsBackgroundHandler,
  subscribeToAlertsTopic,
  unsubscribeFromAlertsTopic
} from './firebaseSeam';
import type { AlertsMessageListener } from './firebaseSeam';

/**
 * RN-bound orchestration for aurora push alerts. Thin wrapper around the
 * pure logic in ./alertsClient.ts (tier/topic decisions, notification text)
 * and the native seam in ./firebaseSeam.ts (subscribe/unsubscribe, message
 * listeners) -- same "core.ts does the deciding, this file does the I/O"
 * split as src/analytics/consent.ts around src/analytics/core.ts.
 *
 * IOS DISPLAY LIMITATION (read before changing anything here): the backend
 * (backend/src/alerts.ts / fcm.ts, see docs/design-aurora-alerts.md section
 * 2) sends a DATA-ONLY FCM message on purpose -- no `notification` block,
 * no `content-available`/`apns` flags -- so the client can render localized
 * text at receive time instead of a topic-per-language. That design choice
 * has a real, honest cost on iOS:
 *   - FOREGROUND (app open): reliable on both platforms. `onAlertsMessage`
 *     below fires and this file schedules an immediate local notification
 *     via expo-notifications, which iOS's system UI DOES display (per
 *     `Notifications.setNotificationHandler` below) even though the app is
 *     frontmost.
 *   - ANDROID, background/killed: reliable. FCM data messages wake a
 *     headless JS task on Android regardless of app state, which is what
 *     `registerBackgroundAlertsHandler` (calling
 *     `registerAlertsBackgroundHandler` in firebaseSeam.ts) exists for.
 *   - iOS, background/killed: NOT reliable. Apple only wakes an app for a
 *     background push when the APNs payload carries `content-available: 1`
 *     (a "background fetch" push) or an `alert`/`aps.alert` block, AND even
 *     then delivery is throttled/best-effort by the OS (frequency limits,
 *     Low Power Mode, force-quit state all suppress it) -- see Apple's
 *     "Pushing Background Updates to Your App" docs. This backend's
 *     payload is `{ message: { topic, data } }` with no `notification`/
 *     `apns` block at all (see backend/src/fcm.ts), so on iOS, a push that
 *     arrives while the app is backgrounded or force-quit will typically
 *     never invoke ANY JS in this app, this file's handler included -- the
 *     user gets nothing, silently, exactly the notification-fatigue-safe
 *     but honesty-costing failure mode docs/design-aurora-alerts.md doesn't
 *     discuss. Fixing this for real needs a backend change (an `apns:
 *     { payload: { aps: { 'content-available': 1 } } }` block added to the
 *     publish call in backend/src/fcm.ts) which is out of scope for this
 *     client-only PR (backend/ is untouched here) -- flagged in this PR's
 *     report for the owner rather than silently shipping an iOS experience
 *     that only ever notifies while the app happens to already be open.
 */

const STORAGE_KEY = 'aurora.alertsTier.v1';

export type AlertsPermissionOutcome = 'granted' | 'denied' | 'unavailable';

export type AlertsState = {
  tier: AlertTier;
  /** False until the persisted tier + availability probe have both resolved
   * at least once. */
  loaded: boolean;
  /** null = still probing (see ./firebaseSeam.ts's isAlertsAvailable). */
  available: boolean | null;
  /** Outcome of the most recent permission request, if any this session --
   * drives the Settings UI's "permission denied" helper text. Not
   * persisted; resets to null on app restart (system permission state is
   * itself the source of truth, this is just "what just happened"). */
  lastPermission: AlertsPermissionOutcome | null;
};

type Listener = (state: AlertsState) => void;

let state: AlertsState = { tier: 'off', loaded: false, available: null, lastPermission: null };
const listeners = new Set<Listener>();

function setState(patch: Partial<AlertsState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

let loadPromise: Promise<AlertsState> | null = null;

/**
 * Reads the persisted tier + probes Firebase availability. Safe to call
 * repeatedly -- callers share the same in-flight read, mirroring
 * src/analytics/consent.ts's loadConsent(). Kicked off eagerly at the
 * bottom of this file.
 */
export function loadAlertsState(): Promise<AlertsState> {
  if (state.loaded) return Promise.resolve(state);
  if (loadPromise) return loadPromise;

  loadPromise = Promise.all([getStoredItem(STORAGE_KEY), isAlertsAvailable()])
    .then(([stored, available]) => {
      const tier = isAlertTier(stored) ? stored : 'off';
      setState({ tier, available, loaded: true });
      return state;
    })
    .catch(() => {
      setState({ tier: 'off', available: false, loaded: true });
      return state;
    });

  return loadPromise;
}

export function getAlertsState(): AlertsState {
  return state;
}

export function subscribeAlertsState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribes/unsubscribes topics per ./alertsClient.ts's planTopicsForTier
 * -- best-effort and parallel: one topic call failing must not block the
 * others, and the plan is self-healing (recomputed fresh, never diffed
 * against a possibly-stale `from`), so a partial failure here just gets
 * corrected the next time the tier changes. */
async function applyTopicPlan(tier: AlertTier): Promise<void> {
  const plan = planTopicsForTier(tier);
  await Promise.all([
    ...plan.subscribe.map((topic) => subscribeToAlertsTopic(topic)),
    ...plan.unsubscribe.map((topic) => unsubscribeFromAlertsTopic(topic))
  ]);
}

async function requestNotificationPermission(): Promise<AlertsPermissionOutcome> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return 'granted';
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
      ? 'granted'
      : 'denied';
  } catch {
    return 'unavailable';
  }
}

/**
 * The only mutation entry point for the alerts preference (used by
 * useAlerts.ts's setTier). Behavior per tier transition, matching the task
 * brief:
 *   - -> 'off': unsubscribe from every known topic, persist 'off'. Never
 *     requests/touches the OS permission -- "abandon permission
 *     gracefully" means simply stop subscribing, not attempting to revoke a
 *     permission grant (there is no such API, and it would affect every
 *     other notification source, not just this feature).
 *   - 'off'/other -> 'ge45'|'ge70' (enabling or changing tier): requests
 *     the OS notification permission first. Only subscribes to the topic
 *     and persists the new tier if permission is granted -- subscribing
 *     without permission would mean the device receives messages it can
 *     never surface to the user, which is worse than just not subscribing.
 *     On denial/unavailability, the persisted tier is left unchanged and
 *     the outcome is returned for the UI to show a helper message.
 */
export async function setAlertsTier(tier: AlertTier): Promise<AlertsPermissionOutcome> {
  if (tier === 'off') {
    await applyTopicPlan('off');
    await setStoredItem(STORAGE_KEY, 'off');
    setState({ tier: 'off', lastPermission: null });
    return 'granted';
  }

  const available = state.available ?? (await isAlertsAvailable());
  if (!available) {
    setState({ available: false });
    return 'unavailable';
  }

  const permission = await requestNotificationPermission();
  setState({ lastPermission: permission });
  if (permission !== 'granted') {
    return permission;
  }

  await applyTopicPlan(tier);
  await setStoredItem(STORAGE_KEY, tier);
  setState({ tier });
  return permission;
}

// --- Notification display -------------------------------------------------

// Ensures a notification is actually shown while the app is in the
// foreground (expo-notifications suppresses the system alert by default
// otherwise) -- see this file's header for the iOS/Android background
// delivery discussion this does NOT change (this handler only affects
// foreground display).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

const showAlertNotification: AlertsMessageListener = (data) => {
  const parsed = parseAlertPushData(data);
  if (!parsed) return; // Malformed/foreign payload -- degrade to silence, never throw.

  const { title, body } = composeAlertNotification(parsed, getCurrentLanguage());
  void Notifications.scheduleNotificationAsync({
    content: { title, body, data: { spotId: parsed.spotId } },
    trigger: null // Immediate local display -- see expo-notifications docs on `trigger: null`.
  });
};

let foregroundUnsubscribe: (() => void) | null = null;

/**
 * Registers the foreground message listener exactly once (idempotent --
 * safe to call from every mount of the Settings alerts UI). Displays a
 * local notification immediately when a data message arrives while the app
 * is open. See registerBackgroundAlertsHandler for the background/killed
 * counterpart, and this file's header for why iOS background delivery is
 * NOT covered by either of these.
 */
export async function ensureForegroundAlertsHandlerRegistered(): Promise<void> {
  if (foregroundUnsubscribe) return;
  foregroundUnsubscribe = await onAlertsMessage(showAlertNotification);
}

/**
 * Registers the background/quit-state handler. MUST be called once, at
 * module scope, as early as possible (see index.ts) -- NOT from inside a
 * React component/hook, per @react-native-firebase/messaging's own
 * contract for `setBackgroundMessageHandler`. Reliable on Android; largely
 * inert on iOS without a backend change -- see this file's header comment.
 */
export function registerBackgroundAlertsHandler(): void {
  void registerAlertsBackgroundHandler(showAlertNotification);
}

// Kick off the persisted-tier + availability read as soon as this module is
// imported, mirroring src/analytics/consent.ts's `void loadConsent()`.
void loadAlertsState();
