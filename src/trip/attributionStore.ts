/**
 * In-memory singleton wrapping recommendationAttribution.ts's pure state
 * machine -- no react-native import, so it is safe to import from both the
 * Tonight screen (records "shown") and the presence hook (records
 * "arrived"), the two independent call sites that never otherwise share a
 * module. Same "module owns the one mutable `let`" pattern already used by
 * src/analytics/consent.ts / tripModeConsent.ts for their own single-value
 * state, applied here to `AttributionState | null` instead of a consent
 * enum.
 *
 * PRIVACY: still exactly the contract documented in
 * recommendationAttribution.ts's header -- this store lives in memory only,
 * is never persisted to disk, and is never read by anything other than
 * `attributeArrival`'s pure evaluation below. Nothing here performs I/O.
 */

import { attributeVisit, recordRecommendationShown, resetAttribution } from './recommendationAttribution';
import type { AttributionState, RecommendedSpotVisitIntent } from './recommendationAttribution';

/**
 * Stable id for the Tonight screen's top-recommendation surface (docs/
 * analytics-pivot.md's amendment item 2: "recommendationId"). Exported so
 * the one call site (TonightScreen.tsx) never hand-types the literal, and so
 * it stays trivially within the backend's `^[a-z0-9_-]{1,64}$` validator
 * (see tripEventClient.ts's `toWirePayload`).
 */
export const TONIGHT_BEST_SPOT_RECOMMENDATION_ID = 'tonight_best_spot_v1';

let state: AttributionState | null = resetAttribution();

/**
 * Records that a recommendation covering `spotIds` was shown at `shownAtMs`
 * (defaults to now). Called from TonightScreen whenever it presents its top
 * recommendation -- see that screen's own effect for the call site. Fully
 * replaces any prior recommendation being tracked, per
 * recommendationAttribution.ts's "not a history" contract.
 */
export function recordShownRecommendation(recommendationId: string, spotIds: readonly string[], shownAtMs: number = Date.now()): void {
  state = recordRecommendationShown(recommendationId, [...spotIds], shownAtMs);
}

/**
 * Evaluates whether an arrival at `spotId` (a fresh `spot_presence` from
 * presenceCore.ts's `advancePresence`) attributes to the currently tracked
 * recommendation, updating the store's dedupe bookkeeping on a match. Called
 * only from useTripPresence.ts's location-sample handler.
 */
export function attributeArrival(spotId: string, timestampMs: number): RecommendedSpotVisitIntent | null {
  const result = attributeVisit(state, spotId, timestampMs);
  state = result.state;
  return result.intent;
}

/**
 * Trip-mode-off reset (docs/analytics-pivot.md wiring task, item 5): drops
 * whatever recommendation is currently tracked so no residual join target
 * survives past an explicit opt-out. Harmless to call at any other time too
 * (e.g. hook teardown) since it is the same "no local history accumulates"
 * reset recommendationAttribution.ts's own `resetAttribution()` already is.
 */
export function resetAttributionStore(): void {
  state = resetAttribution();
}
