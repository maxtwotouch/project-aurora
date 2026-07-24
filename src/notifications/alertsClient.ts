/**
 * Pure, framework-free decision logic for aurora push alerts (topic-based
 * FCM, Option B -- see docs/design-aurora-alerts.md and
 * docs/privacy-push-alerts.md). Deliberately has NO react-native,
 * @react-native-firebase, or i18next imports -- mirrors the split
 * src/analytics/core.ts already establishes for consent (core.ts is the
 * pure logic, consent.ts is the RN-bound wrapper): this file can be loaded
 * and unit-tested directly under plain Node (see test/alertsClient.test.ts
 * at the repo root), and is also safe to call from a headless background
 * context (FCM's background message handler runs outside the normal React
 * tree/lifecycle -- see alertsService.ts) since it never touches any
 * platform API.
 *
 * alertsService.ts is the thin RN-bound wrapper: it owns AsyncStorage
 * persistence, the @react-native-firebase seam (./firebaseSeam), and
 * expo-notifications display, and calls into these pure functions for
 * every decision.
 *
 * CONTRACT WITH THE BACKEND (backend/src/alerts.ts / backend/src/fcm.ts,
 * read but not modified by this PR -- backend/ is out of scope here):
 *   - Exactly two topics exist, matching backend/src/alerts.ts's
 *     ALERT_TIERS: `alerts-ge70` ("Only great nights") and `alerts-ge45`
 *     ("Any decent chance"). Topic names here MUST stay byte-identical to
 *     the backend's -- see ALERT_TOPICS below.
 *   - Every message the backend publishes is data-only (never a
 *     `notification` block) with exactly the fields in
 *     `backend/src/alerts.ts`'s `AlertFireEvent.data` (threshold, score,
 *     spotId, spotName, bestWindowStart, bestWindowEnd), every value a
 *     string. See `AlertPushData` below and `parseAlertPushData`, which is
 *     deliberately defensive about a payload that doesn't match (missing
 *     field, wrong type) -- FCM's `data` payload is not compiler-checked
 *     between backend and client, so a bad/partial payload must degrade to
 *     "don't show a notification", never throw.
 */

export type AlertTier = 'off' | 'ge45' | 'ge70';

export const ALERT_TIERS: readonly Exclude<AlertTier, 'off'>[] = ['ge45', 'ge70'];

/** Byte-identical to backend/src/alerts.ts's ALERT_TIERS[].topic. */
export const ALERT_TOPICS: Record<Exclude<AlertTier, 'off'>, string> = {
  ge45: 'alerts-ge45',
  ge70: 'alerts-ge70'
};

export function isAlertTier(value: unknown): value is AlertTier {
  return value === 'off' || value === 'ge45' || value === 'ge70';
}

/** Per docs/design-aurora-alerts.md section 1: "Default on first opt-in:
 * 'Only great nights' (>=70) -- a higher bar minimizes false-alarm fatigue
 * for a brand-new feature." This is only the default offered the first time
 * a user turns the feature on (i.e. moving off 'off') -- never applied
 * silently to an existing choice. */
export const DEFAULT_ENABLED_TIER: Exclude<AlertTier, 'off'> = 'ge70';

export function topicForTier(tier: AlertTier): string | null {
  return tier === 'off' ? null : ALERT_TOPICS[tier];
}

export function allTopics(): readonly string[] {
  return ALERT_TIERS.map((tier) => ALERT_TOPICS[tier]);
}

export type TopicPlan = {
  /** Topic to subscribe to for the new tier (empty when `to` is 'off'). */
  subscribe: readonly string[];
  /** Every OTHER known topic, always -- not just whatever `from` was. This
   * makes the plan self-healing: even if the persisted "current tier" is
   * stale/corrupt/unknown, applying this plan can never leave a stray
   * subscription (e.g. from an interrupted previous change) behind. Safe to
   * run unconditionally, including a no-op `to === from` change. */
  unsubscribe: readonly string[];
};

/**
 * Computes the subscribe/unsubscribe topic set for moving to `tier`. Does
 * NOT depend on the previous tier at all -- see the `unsubscribe` field
 * comment above for why that's deliberate, not an oversight.
 */
export function planTopicsForTier(tier: AlertTier): TopicPlan {
  const target = topicForTier(tier);
  return {
    subscribe: target ? [target] : [],
    unsubscribe: allTopics().filter((topic) => topic !== target)
  };
}

// --- Data-only push payload parsing -------------------------------------

/** Mirrors backend/src/alerts.ts's AlertFireEvent.data exactly. */
export type AlertPushData = {
  threshold: string;
  score: string;
  spotId: string;
  spotName: string;
  bestWindowStart: string;
  bestWindowEnd: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Defensively parses an FCM `data` payload (all values arrive as strings,
 * or are simply absent if malformed) into an `AlertPushData`, or `null` if
 * any required field is missing/empty. Never throws.
 */
export function parseAlertPushData(data: Record<string, unknown> | null | undefined): AlertPushData | null {
  if (!data) return null;
  const { threshold, score, spotId, spotName, bestWindowStart, bestWindowEnd } = data;
  if (
    !isNonEmptyString(threshold) ||
    !isNonEmptyString(score) ||
    !isNonEmptyString(spotId) ||
    !isNonEmptyString(spotName) ||
    !isNonEmptyString(bestWindowStart) ||
    !isNonEmptyString(bestWindowEnd)
  ) {
    return null;
  }
  return { threshold, score, spotId, spotName, bestWindowStart, bestWindowEnd };
}

/** Which tier a received payload corresponds to, from its `threshold`
 * field -- used only to pick the right notification title template (see
 * composeAlertNotification). Falls back to 'ge45' for any unrecognized
 * threshold value (the more common/lower tier) rather than throwing. */
export function tierForPushData(data: AlertPushData): Exclude<AlertTier, 'off'> {
  return data.threshold === '70' ? 'ge70' : 'ge45';
}

// --- Localized notification text (client-side render of a data-only push) -

// Reads the five shipped locale catalogs directly (plain JSON, no
// react-i18next/i18next import) rather than the live i18next singleton, so
// this works correctly even before app startup has finished initializing
// i18next, or from a headless background context -- see this file's header
// and alertsService.ts's background message handler.
import type { SupportedLanguage } from '../i18n/languages';
import en from '../i18n/locales/en.json';
import de from '../i18n/locales/de.json';
import fr from '../i18n/locales/fr.json';
import es from '../i18n/locales/es.json';
import zh from '../i18n/locales/zh.json';

const NOTIFICATION_CATALOGS: Record<SupportedLanguage, typeof en> = { en, de, fr, es, zh };

/** Mirrors the `{{var}}` interpolation syntax scripts/check-i18n.mjs
 * validates across all five catalogs (see that script's `interpolationVars`).
 * Deliberately does not throw or drop text on a missing var -- leaves the
 * literal `{{var}}` token in place, which is a visible-but-harmless failure
 * mode, consistent with this module's "never throw from a payload we don't
 * fully control" stance (see parseAlertPushData above). */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

/** Device-local "HH:MM" (24h) formatting -- same options as
 * src/components/tonight/BestWindowSection.tsx's formatLocalTime, kept
 * consistent with how the rest of the app already renders best-window
 * times. Falls back to the raw ISO string on an unparseable date rather
 * than throwing or showing "Invalid Date". */
function formatWindowTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23' });
}

export type ComposedAlertNotification = { title: string; body: string };

/**
 * Renders a localized notification title/body from a data-only push
 * payload -- the client-side half of the "data-only, client renders text"
 * split docs/design-aurora-alerts.md section 2 specifies. `language` is
 * whatever the app's current UI language is (see src/i18n/index.ts's
 * getCurrentLanguage()) -- alerts are not a separate language preference.
 */
export function composeAlertNotification(data: AlertPushData, language: SupportedLanguage): ComposedAlertNotification {
  const catalog = NOTIFICATION_CATALOGS[language] ?? NOTIFICATION_CATALOGS.en;
  const tier = tierForPushData(data);
  const title = tier === 'ge70' ? catalog.alerts.notification.titleGe70 : catalog.alerts.notification.titleGe45;
  const body = interpolate(catalog.alerts.notification.body, {
    spotName: data.spotName,
    score: data.score,
    start: formatWindowTime(data.bestWindowStart),
    end: formatWindowTime(data.bestWindowEnd)
  });
  return { title, body };
}
