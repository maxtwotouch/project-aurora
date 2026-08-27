/**
 * Consent-layering decision for the tourism/location-derived event pipeline
 * -- pure, deterministic, no I/O, no react-native import (framework-free so
 * it is directly unit-testable, mirroring src/analytics/core.ts's own
 * extraction pattern).
 *
 * DECISION (recorded here per the wiring task's explicit instruction):
 * spot_presence, spot_presence_long, spot_visit, recommended_spot_visit, and
 * zone_dwell are gated on Trip-mode consent ALONE -- never additionally on
 * the separate anonymous usage-events consent that src/analytics/events.ts's
 * `track()` hard-couples to (see that file's `getConsent() !== 'accepted'`
 * check, and src/analytics/core.ts's `mayFlush`, which bakes in exactly that
 * one consent dimension).
 *
 * Reasoning, from docs/analytics-pivot.md section 3's 2026-08-22 amendment
 * and docs/design-trip-tracking.md section 3: tourism/location analytics are
 * their OWN purpose (aggregate tourism statistics for the product and the
 * municipality), asked for through their OWN separate, default-off opt-in
 * (Trip mode, in Settings -- src/analytics/tripModeConsent.ts), not a
 * sub-case of "anonymous usage instrumentation" (spot_view/navigate_pressed/
 * spot_shared). Requiring BOTH consents would mean a user who accepts Trip
 * mode but declined (or was never asked, or later withdraws) the unrelated
 * usage-counter question gets their Trip-mode-consented data silently
 * dropped -- an implicit coupling the design doc never states, and one that
 * cuts against "consent is never inferred, in either direction"
 * (docs/analytics-pivot.md section 2, clarification). Conversely, a user who
 * accepts usage-counter events but never turns Trip mode on must never have
 * location-derived events sent on that basis alone -- Trip-mode consent is
 * REQUIRED, not merely sufficient-if-present.
 *
 * This is why `track()` is never reused for trip events -- it hard-codes the
 * other consent dimension. src/trip/tripEventClient.ts implements the
 * parallel send path this decision requires; transport is otherwise shared
 * (same backend endpoint, same fire-and-forget/no-retry semantics) -- only
 * the consent gate and the event shapes differ.
 */

import type { TripModeConsentState } from '../analytics/core';

export type TripEventGateInput = {
  /** Whether the persisted Trip-mode consent choice has been read at least once. */
  loaded: boolean;
  tripModeConsent: TripModeConsentState;
  /** Whether EXPO_PUBLIC_USE_BACKEND + EXPO_PUBLIC_API_BASE_URL are both set. */
  configured: boolean;
};

/**
 * May we currently queue/send a trip event at all? Fail-closed, same shape
 * as src/analytics/core.ts's `mayFlush`, but keyed on Trip-mode consent
 * instead of usage-events consent -- see the module header for why these
 * are deliberately two different predicates rather than one shared one.
 */
export function mayEmitTripEvents(input: TripEventGateInput): boolean {
  return input.loaded && input.tripModeConsent === 'accepted' && input.configured;
}

/**
 * Why useTripPresence.ts's `stop()` is called -- see that hook's own header
 * for where each reason originates.
 */
export type TripPresenceStopReason = 'consent-revoked' | 'background' | 'permission-lost' | 'unmount';

/**
 * Whether the closing summary a stop produces (endPresenceSession's
 * `spot_visit` intent, if any) should be FLUSHED or DISCARDED -- extracted
 * as its own pure predicate (post-review fix) after an earlier version of
 * useTripPresence.ts routed every stop reason, including consent
 * revocation, through the bypass-the-gate `flushFinalTripEvents` -- which
 * meant toggling Trip mode off could still fire one more POST after
 * revocation, contradicting docs/design-trip-tracking.md section 5 and
 * docs/analytics-pivot.md section 2 ("toggle off in Settings stops
 * collection immediately"). "Stops collection immediately" is read
 * literally here: a `consent-revoked` stop's summary is discarded outright,
 * never queued and never sent, even though the dwell it describes happened
 * while consent was still 'accepted' (the tension `flushFinalTripEvents`'s
 * own doc comment discusses does NOT apply to consent revocation
 * specifically -- withdrawal is the one signal that must win outright).
 *
 * Every OTHER stop reason (`background`, `permission-lost`, `unmount`)
 * happens while Trip-mode consent is STILL 'accepted' -- only the watcher
 * itself is stopping, not the user's underlying consent -- so those keep
 * flushing the closing summary, per presenceCore.ts's own "an explicit
 * session end is a confirming instant" design and `flushFinalTripEvents`'s
 * documented rationale.
 */
export function shouldFlushStopIntents(reason: TripPresenceStopReason): boolean {
  return reason !== 'consent-revoked';
}
