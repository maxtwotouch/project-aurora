import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

import { getPersonalAnalyticsConsent, subscribePersonalAnalyticsConsent } from './personalAnalyticsConsent';
import { resolvePersonalAnalyticsClientAction } from './core';
import type { PersonalAnalyticsConsentState } from './core';

/**
 * Consent-gated PostHog singleton (docs/analytics-pivot.md section 3;
 * CLAUDE.md's "Privacy & legal guardrails"). This module owns the ONLY
 * `new PostHog(...)` call site in the app, and that call is only ever
 * reached from `applyConsentState` below, which in turn only takes the
 * 'construct' action once `getPersonalAnalyticsConsent()` has resolved to
 * exactly 'accepted' -- see core.ts's `resolvePersonalAnalyticsClientAction`
 * for the pure decision logic this wraps (unit-tested there because this
 * file itself imports react-native/expo-constants and can't load under
 * plain node:test).
 *
 * PRIVACY INVARIANT: construction itself is the thing being gated, not just
 * event sending -- PostHog fetches remote config/flags as part of its own
 * constructor, so even an inert `new PostHog(...)` call before consent
 * would put bytes on the wire. Nothing in this module ever constructs a
 * client before `getPersonalAnalyticsConsent() === 'accepted'`.
 *
 * Call sites never import PostHog directly -- they go through
 * ./personalAnalytics.ts's `captureAllowed`, which reads `getClient()` here
 * and additionally enforces the fixed 8-event allowlist per call.
 */

type PostHogExtra = {
  posthogProjectToken?: string;
  posthogHost?: string;
};

type PostHogConfig = {
  projectToken: string;
  host: string;
};

function readConfig(): PostHogConfig | null {
  const extra = Constants.expoConfig?.extra as PostHogExtra | undefined;
  const projectToken = extra?.posthogProjectToken;
  const host = extra?.posthogHost;
  if (!projectToken || !host) return null;
  return { projectToken, host };
}

let client: PostHog | null = null;
let warnedMissingConfig = false;

function warnOnceIfUnconfigured(): void {
  // Missing config must never throw -- an owner-less dev/CI checkout (no
  // POSTHOG_PROJECT_TOKEN/POSTHOG_HOST in the environment) has to build and
  // run exactly like it did before this feature existed. A single dev-only
  // console.warn is enough signal without being disruptive.
  if (warnedMissingConfig || !__DEV__) return;
  warnedMissingConfig = true;
  // eslint-disable-next-line no-console
  console.warn(
    '[analytics] POSTHOG_PROJECT_TOKEN / POSTHOG_HOST are not configured -- ' +
      'personal analytics stays disabled (this is expected in dev/CI without a token).'
  );
}

function construct(): PostHog | null {
  const config = readConfig();
  if (!config) {
    warnOnceIfUnconfigured();
    return null;
  }

  return new PostHog(config.projectToken, {
    host: config.host,
    // EU hosting + this exact config block is the whole of
    // docs/analytics-pivot.md section 3's implementation constraints:
    // - captureAppLifecycleEvents: false -- app_open/app_backgrounded etc.
    //   are NOT auto-sent; the wrapper emits `app_open` itself, once, on
    //   cold start, and nothing else from this category.
    // - disableGeoip: true -- no IP-based geolocation enrichment, ever.
    // - no autocapture option is set below (autocapture is opt-in in
    //   posthog-react-native, so omitting it IS "no autocapture").
    // - no session-replay option is set below (session replay is a
    //   separate opt-in package/option this app never enables).
    // - flushAt/flushInterval are left at SDK defaults.
    captureAppLifecycleEvents: false,
    disableGeoip: true
  });
}

function teardown(instance: PostHog): void {
  // Withdrawal (docs/analytics-pivot.md section 2.3): stop sending
  // immediately and ask PostHog to delete data tied to the pseudonymous
  // identifier. optOut() first (belt-and-braces against any in-flight
  // capture racing the reset), then reset() to drop the local identity/
  // queued state so a future re-acceptance starts from a clean slate.
  instance.optOut();
  instance.reset();
}

function applyConsentState(consent: PersonalAnalyticsConsentState): void {
  const configured = readConfig() !== null;
  const action = resolvePersonalAnalyticsClientAction({ consent, configured }, client !== null);

  if (action === 'construct') {
    client = construct();
    return;
  }

  if (action === 'teardown' && client) {
    teardown(client);
    client = null;
  }
}

// React to every future consent change (Settings toggle) ...
subscribePersonalAnalyticsConsent(applyConsentState);
// ... and to whatever the consent state already is right now. Safe to call
// eagerly at module load: if the persisted choice hasn't loaded yet this
// resolves to 'unset' (a no-op, per resolvePersonalAnalyticsClientAction),
// and the subscription above picks up the real value the moment
// personalAnalyticsConsent.ts's load resolves and calls notify().
applyConsentState(getPersonalAnalyticsConsent());

/** The current client instance, or null while unconstructed (unconsented, declined, or unconfigured). */
export function getPostHogClient(): PostHog | null {
  return client;
}
