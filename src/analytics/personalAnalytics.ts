import { getPersonalAnalyticsConsent } from './personalAnalyticsConsent';
import { getPostHogClient } from './posthog';
import { mayCapturePersonalAnalyticsEvent } from './core';
import type { PersonalAnalyticsEventName } from './core';

/**
 * The ONLY way any call site in this app is allowed to send a personal-
 * analytics event (docs/analytics-pivot.md section 3). Call sites never
 * import PostHog or ./posthog.ts's client directly -- they call
 * `captureAllowed(event, props)` here, which:
 *
 * 1. Type-restricts `event` to exactly the 8-name allowlist (compile-time),
 * 2. Type-restricts `props` per event to a small, hand-picked shape that
 *    structurally cannot contain coordinates or arbitrary free-form data,
 * 3. No-ops at runtime unless consent is exactly 'accepted' AND a client
 *    instance currently exists (see ./posthog.ts -- construction itself is
 *    consent-gated, so "client exists" already implies consent, but the
 *    explicit consent check here is defense in depth, not the only gate).
 *
 * The actual send/no-send decision is the pure `mayCapturePersonalAnalyticsEvent`
 * in ./core.ts, unit-tested there -- this module is a thin, RN-import-bearing
 * wrapper around it (same "core.ts owns the decision, the sibling owns the
 * side effect" pattern as consent.ts/events.ts elsewhere in this folder).
 */

export type PersonalAnalyticsEventProps = {
  app_open: undefined;
  /** Screen NAME only -- never what is displayed on it (docs/analytics-pivot.md section 3). */
  screen_view: { screen: string; previous_screen?: string };
  spot_view: { spot_id: string };
  navigate_pressed: { spot_id: string };
  spot_shared: { spot_id: string };
  /** Which alert tier the user opted into -- never fired for opting out. */
  alerts_opt_in: { tier: 'ge45' | 'ge70' };
  language_set: { language: string };
  /** The toggle state only -- Trip mode's own presence events are never sent here, ever. */
  trip_mode_toggled: { enabled: boolean };
};

type CaptureArgs<E extends PersonalAnalyticsEventName> = PersonalAnalyticsEventProps[E] extends undefined
  ? [props?: undefined]
  : [props: PersonalAnalyticsEventProps[E]];

export function captureAllowed<E extends PersonalAnalyticsEventName>(
  event: E,
  ...args: CaptureArgs<E>
): void {
  const client = getPostHogClient();
  const consent = getPersonalAnalyticsConsent();

  if (!mayCapturePersonalAnalyticsEvent({ consent, clientReady: client !== null, event })) {
    return;
  }

  const props = args[0];
  // `client` is non-null here (mayCapturePersonalAnalyticsEvent required
  // clientReady === true), and `props` is exactly the typed, hand-picked
  // shape for this event -- never anything the call site made up. The `any`
  // is only to satisfy posthog-react-native's own (unexported) property
  // type at this single boundary call -- every prop shape above is a plain
  // JSON-compatible object, so nothing is actually widened in practice.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client!.capture(event, props as any);
}
