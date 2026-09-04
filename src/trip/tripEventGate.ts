/**
 * Consent-layering decision for the tourism/location-derived event pipeline
 * -- pure, deterministic, no I/O, no react-native import (framework-free so
 * it is directly unit-testable, mirroring src/analytics/core.ts's own
 * extraction pattern).
 *
 * DECISION: spot_presence, spot_presence_long, spot_visit,
 * recommended_spot_visit, and zone_dwell are gated on TOURISM-INSIGHTS
 * CONSENT ALONE (src/analytics/tourismConsent.ts) -- and on nothing else:
 *
 * - Never additionally on the separate anonymous usage-events consent that
 *   src/analytics/events.ts's `track()` hard-couples to (see that file's
 *   `getConsent() !== 'accepted'` check, and src/analytics/core.ts's
 *   `mayFlush`, which bakes in exactly that one consent dimension).
 * - Never on personal-analytics (PostHog) consent -- location-derived
 *   events are never sent to PostHog under any circumstances (docs/
 *   analytics-pivot.md section 3's amendment), so that consent dimension is
 *   irrelevant to this gate entirely.
 * - Never on Trip Mode's own session state (src/trip/tripSession.ts). A
 *   Trip Mode session is a product feature, not a consent -- it can keep
 *   the presence engine SAMPLING locally for the feature's own sake (nearby
 *   spots, "visited this trip") while this gate stays shut, and this gate
 *   never opens just because a session happens to be active. There is
 *   deliberately no session field anywhere on `TripEventGateInput` below --
 *   the type itself cannot express "let a session through".
 *
 * Reasoning, from docs/analytics-pivot.md section 3's 2026-08-22 amendment
 * and docs/design-trip-tracking.md section 3: tourism/location analytics are
 * their OWN purpose (aggregate tourism statistics for the product and the
 * municipality), asked for through their OWN separate, default-off opt-in
 * (src/analytics/tourismConsent.ts, asked at first launch on native via
 * ConsentGate, changeable afterwards via TourismConsentToggle in Settings),
 * not a sub-case of "anonymous usage instrumentation" (spot_view/
 * navigate_pressed/spot_shared). Requiring usage-events consent as well
 * would mean a user who accepts tourism insights but declined (or was never
 * asked, or later withdraws) the unrelated usage-counter question gets
 * their tourism-consented data silently dropped -- an implicit coupling the
 * design doc never states, and one that cuts against "consent is never
 * inferred, in either direction" (docs/analytics-pivot.md section 2,
 * clarification). Conversely, a user who accepts usage-counter events but
 * never accepts tourism insights must never have location-derived events
 * sent on that basis alone -- tourism consent is REQUIRED, not merely
 * sufficient-if-present.
 *
 * This is why `track()` is never reused for trip events -- it hard-codes the
 * other consent dimension. src/trip/tripEventClient.ts implements the
 * parallel send path this decision requires; transport is otherwise shared
 * (same backend endpoint, same fire-and-forget/no-retry semantics) -- only
 * the consent gate and the event shapes differ.
 */

import type { TourismConsentState } from '../analytics/core';

export type TripEventGateInput = {
  /** Whether the persisted tourism-insights consent choice has been read at least once. */
  loaded: boolean;
  tourismConsent: TourismConsentState;
  /** Whether EXPO_PUBLIC_USE_BACKEND + EXPO_PUBLIC_API_BASE_URL are both set. */
  configured: boolean;
};

/**
 * May we currently queue/send a trip event at all? Fail-closed, same shape
 * as src/analytics/core.ts's `mayFlush`, but keyed on tourism-insights
 * consent instead of usage-events consent -- see the module header for why
 * these are deliberately two different predicates rather than one shared
 * one, and why an active Trip Mode session (there is no session input here
 * at all) can never substitute for this consent.
 */
export function mayEmitTripEvents(input: TripEventGateInput): boolean {
  return input.loaded && input.tourismConsent === 'accepted' && input.configured;
}

/**
 * Why useTripPresence.ts's `stop()` is called -- see that hook's own header
 * for where each reason originates. `'trip-ended'` covers a Trip Mode
 * session ending while the presence engine was running purely to support
 * that session (tourism consent may be off in that case).
 */
export type TripPresenceStopReason = 'consent-revoked' | 'trip-ended' | 'background' | 'permission-lost' | 'unmount';

/**
 * Whether the closing summary a stop produces (endPresenceSession's
 * `spot_visit` intent, if any) should be FLUSHED or DISCARDED -- extracted
 * as its own pure predicate (post-review fix) after an earlier version of
 * useTripPresence.ts routed every stop reason, including consent
 * revocation, through the bypass-the-gate `flushFinalTripEvents` -- which
 * meant withdrawing tourism consent could still fire one more POST after
 * revocation, contradicting docs/design-trip-tracking.md section 5 and
 * docs/analytics-pivot.md section 2 ("toggle off in Settings stops
 * collection immediately"). "Stops collection immediately" is read
 * literally here: a `consent-revoked` stop's summary is discarded outright,
 * never queued and never sent, even though the dwell it describes happened
 * while consent was still 'accepted' (the tension `flushFinalTripEvents`'s
 * own doc comment discusses does NOT apply to consent revocation
 * specifically -- withdrawal is the one signal that must win outright).
 *
 * This now also needs the LIVE consent value, not just the reason, because a
 * stop can happen while sampling ran purely to support a Trip Mode session
 * with tourism consent off (or never granted) -- in that case there is
 * nothing to flush regardless of reason, since the gate was already shut the
 * entire time. Every other combination -- a reason other than
 * `consent-revoked`, with consent currently 'accepted' -- keeps flushing the
 * closing summary, per presenceCore.ts's own "an explicit session end is a
 * confirming instant" design and `flushFinalTripEvents`'s documented
 * rationale.
 */
export function shouldFlushStopIntents(reason: TripPresenceStopReason, tourismConsent: TourismConsentState): boolean {
  return reason !== 'consent-revoked' && tourismConsent === 'accepted';
}
