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
    disableGeoip: true,
    // WITHDRAWAL-LINKAGE / footprint reduction: this app has no PostHog
    // feature flags to evaluate, so the only effect of the SDK's default
    // "fetch flags on every construction" behavior is an unnecessary,
    // identifier-bearing request. Verified against the installed
    // posthog-react-native/@posthog/core source
    // (node_modules/@posthog/core/dist/posthog-core.js's `_remoteConfigAsync`):
    // on every `new PostHog(...)`, the SDK unconditionally GETs
    // `{host}/array/{apiKey}/config` (no distinct_id/device_id -- keyed only
    // by the public project token; this request cannot be suppressed via any
    // current option, since the SDK's own `disableRemoteConfig` option is
    // documented as a no-op/deprecated -- "Remote config is now always
    // loaded"), and THEN, unless `disableRemoteFeatureFlags` is set, POSTs
    // distinct_id + $device_id to `{host}/flags/?v=2` to evaluate flags.
    // Setting this to true skips that second, identity-bearing request
    // entirely (it also makes reset()/identify()/group() flag-reload calls
    // no-ops, which is irrelevant here since we never read flags). This is
    // NOT what closes the withdrawal-linkage gap (see teardown()'s
    // reset([]) below for that) -- it's an independent reduction of the
    // pre-first-event network footprint, requested because this app has no
    // use for remote flags at all.
    disableRemoteFeatureFlags: true
  });
}

function teardown(instance: PostHog): void {
  // Withdrawal (docs/analytics-pivot.md section 2.3): stop sending
  // immediately and ask PostHog to delete data tied to the pseudonymous
  // identifier. optOut() first (belt-and-braces against any in-flight
  // capture racing the reset), then reset([]) to drop the local identity/
  // queued state so a future re-acceptance starts from a clean slate.
  //
  // WITHDRAWAL-LINKAGE: this MUST be reset([]), not reset() with no
  // arguments. Verified from posthog-react-native's own reset() override
  // (node_modules/posthog-react-native/dist/posthog-rn.js): called with no
  // arguments, it defaults `propertiesToKeep` to
  // [InstalledAppBuild, InstalledAppVersion, DeviceId] ("device bucketing
  // properties are automatically preserved" per the SDK's own reset() doc
  // comment) -- i.e. PostHogPersistedProperty.DeviceId survives a bare
  // reset(). Passing [] explicitly overrides that default with "keep
  // nothing" (RN's own `propertiesToKeep !== null && !== undefined ?
  // propertiesToKeep : <default list>` check treats [] as a real, empty
  // list, not "unset"), so DeviceId is cleared along with everything else.
  //
  // Why this matters even with disableRemoteFeatureFlags set above (which
  // stops the *current* SDK version's only outgoing use of DeviceId, the
  // flags-evaluation POST's $device_id field): DeviceId is meant by the SDK
  // as a stable per-device bucketing id that deliberately SURVIVES a bare
  // reset() (see its own "logout/login on the same device" example). That
  // is the opposite of what withdrawal needs -- a clean break, not device
  // continuity. Leaving it in place across withdraw -> re-accept would mean
  // the "new" anonymous install and the withdrawn one still share the same
  // on-device identifier, available to any future/other code path that
  // reads getDeviceId() (native session replay, a later flags/experiments
  // feature, an SDK upgrade), which is exactly the correlation risk "clean
  // break on withdrawal" (docs/analytics-pivot.md section 2.3) promises
  // does NOT happen. Defense in depth: clear it now rather than relying
  // solely on disableRemoteFeatureFlags never being reverted later.
  instance.optOut();
  instance.reset([]);
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
