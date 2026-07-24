// `expo-constants` is pure JS and safe to import statically anywhere,
// including Expo Go -- unlike `@react-native-firebase/*` below, it has no
// native-module-not-found failure mode. Used only for the Expo Go
// short-circuit in loadModules(); see expoGoDetection.ts for the "why".
import Constants from 'expo-constants';

import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

import { isExpoGoEnvironment } from './expoGoDetection';

/**
 * The ONE seam between src/notifications/ and the native
 * `@react-native-firebase/{app,messaging}` packages. Native platforms only
 * -- see firebaseSeam.web.ts, which Metro resolves instead for any
 * `--platform web` build/export (same unsuffixed-import pattern App.tsx /
 * App.web.tsx already use for the app root -- see App.tsx's header). That
 * keeps the web bundle from ever referencing these packages at all, not
 * just "importing but not calling" them.
 *
 * WHY EVERY CALL IS WRAPPED: `google-services.json` / `GoogleService-Info.plist`
 * are owner-held and do not exist in this repo as of this PR (see
 * docs/setup-firebase-alerts.md section 5) -- app.config.js only wires the
 * Firebase config plugins in once those files show up, so most builds right
 * now ship with the native module present but Firebase never configured.
 * Separately, even once configured, an Expo/EAS "OTA" JS update
 * (expo-updates, see app.json's `updates.url`) can land NEW JAVASCRIPT on a
 * binary that was BUILT BEFORE this PR's native packages existed --
 * OTA updates ship JS only, never new native code -- so the native module
 * may not be linked into the currently-running binary at all. Both cases
 * ("linked but unconfigured" and "not linked at all") must resolve to
 * "unavailable" here, never an unhandled crash. This is exactly the
 * `isAvailable()` gate the Settings UI uses to show a disabled state
 * instead of a broken toggle -- see useAlerts.ts / AuroraAlertsSection.tsx.
 *
 * `@react-native-firebase/{app,messaging}` are imported here with dynamic
 * `import()` only (never a top-level `import ... from`), so this file can
 * be statically imported by alertsService.ts without hard-requiring the
 * native module at parse time -- the actual native call only happens the
 * first time something awaits isAlertsAvailable() or one of the functions
 * below.
 */

type FirebaseAppModule = typeof import('@react-native-firebase/app');
type FirebaseMessagingModule = typeof import('@react-native-firebase/messaging');

type LoadedModules = {
  app: FirebaseAppModule;
  messaging: FirebaseMessagingModule;
};

let cachedModules: LoadedModules | null = null;
let cachedAvailable: boolean | null = null;

async function loadModules(): Promise<LoadedModules | null> {
  // Expo Go can NEVER have these native modules linked in (see
  // expoGoDetection.ts's header) -- short-circuit before the dynamic
  // import below even runs, so RNFB's own module-resolution code never gets
  // a chance to log its "Native module RNFBAppModule not found"
  // console.error. This is a pure availability short-circuit, not a
  // behavior change: loadModules() would already resolve to null/caught
  // here anyway, just noisily.
  if (isExpoGoEnvironment(Constants)) return null;

  if (cachedModules) return cachedModules;

  try {
    const [app, messaging] = await Promise.all([
      import('@react-native-firebase/app'),
      import('@react-native-firebase/messaging')
    ]);

    // The actual availability probe: app.getApp() throws both when the
    // native module isn't linked into this binary at all, AND when it IS
    // linked but no config file was ever bundled in (no default Firebase
    // app was created at native launch) -- see this file's header. Either
    // way, that's "unavailable", caught below.
    app.getApp();

    cachedModules = { app, messaging };
    return cachedModules;
  } catch {
    return null;
  }
}

async function getMessagingInstance(modules: LoadedModules): Promise<FirebaseMessagingTypes.Module | null> {
  try {
    return modules.messaging.getMessaging(modules.app.getApp());
  } catch {
    return null;
  }
}

/** Whether aurora alerts can actually be used on this running binary right
 * now. Cached after the first successful/failed probe (mirrors the intent
 * of fcm.ts's `loggedInert` -- probe once, not on every render). */
export async function isAlertsAvailable(): Promise<boolean> {
  if (cachedAvailable !== null) return cachedAvailable;
  const modules = await loadModules();
  cachedAvailable = modules !== null;
  return cachedAvailable;
}

/** Test-only / defensive hook: clears the availability cache. Not currently
 * called from app code (there is no supported way to add native code to a
 * running binary), kept narrow and exported only for completeness/testing
 * symmetry with backend/src/fcm.ts's resetFcmStateForTests. */
export function resetAlertsAvailabilityCacheForTests(): void {
  cachedModules = null;
  cachedAvailable = null;
}

/**
 * NOTE on permission requests: this module deliberately does NOT expose a
 * `requestPermission` wrapper around `@react-native-firebase/messaging`'s
 * `requestPermission()` -- that API is explicitly deprecated upstream (see
 * its own JSDoc: "Use ... expo-notifications ... instead. These APIs will
 * be removed in a future major release") in favor of
 * `expo-notifications`' `requestPermissionsAsync()`, which also already
 * covers Android 13+'s POST_NOTIFICATIONS runtime prompt uniformly with
 * iOS. alertsService.ts calls that instead, gated on isAlertsAvailable()
 * from this module so we never prompt when Firebase isn't configured.
 */

/**
 * Subscribes/unsubscribes this device to/from a topic by name only --
 * `messaging().subscribeToTopic()` handles any device token internally
 * inside Google's SDK; this app's code never sees, requests, or logs it
 * (docs/privacy-push-alerts.md's "What Google/Firebase processes" section).
 * Returns whether the call succeeded; never throws.
 */
export async function subscribeToAlertsTopic(topic: string): Promise<boolean> {
  const modules = await loadModules();
  if (!modules) return false;
  const instance = await getMessagingInstance(modules);
  if (!instance) return false;

  try {
    await modules.messaging.subscribeToTopic(instance, topic);
    return true;
  } catch {
    return false;
  }
}

export async function unsubscribeFromAlertsTopic(topic: string): Promise<boolean> {
  const modules = await loadModules();
  if (!modules) return false;
  const instance = await getMessagingInstance(modules);
  if (!instance) return false;

  try {
    await modules.messaging.unsubscribeFromTopic(instance, topic);
    return true;
  } catch {
    return false;
  }
}

export type AlertsMessageListener = (data: Record<string, string | undefined>) => void;

/**
 * Foreground listener: fires while the app is open/in the foreground.
 * Returns an unsubscribe function, or null when unavailable (nothing to
 * unsubscribe).
 */
export async function onAlertsMessage(listener: AlertsMessageListener): Promise<(() => void) | null> {
  const modules = await loadModules();
  if (!modules) return null;
  const instance = await getMessagingInstance(modules);
  if (!instance) return null;

  return modules.messaging.onMessage(instance, (remoteMessage) => {
    listener((remoteMessage.data ?? {}) as Record<string, string | undefined>);
  });
}

/**
 * Registers the background/quit-state data-message handler. Per
 * @react-native-firebase/messaging's own contract this must be called once,
 * as early as possible, OUTSIDE any React component (see index.ts, not a
 * screen/hook) -- it is what lets Android show a notification for a
 * data-only message received while the app is backgrounded or killed (see
 * alertsService.ts's header comment for the fuller iOS-vs-Android
 * discussion). No-ops without throwing when unavailable.
 */
export async function registerAlertsBackgroundHandler(listener: AlertsMessageListener): Promise<void> {
  const modules = await loadModules();
  if (!modules) return;
  const instance = await getMessagingInstance(modules);
  if (!instance) return;

  modules.messaging.setBackgroundMessageHandler(instance, async (remoteMessage) => {
    listener((remoteMessage.data ?? {}) as Record<string, string | undefined>);
  });
}
