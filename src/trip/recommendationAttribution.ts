/**
 * On-device recommendation-effectiveness attribution -- pure, deterministic,
 * no I/O.
 *
 * PRIVACY CONTRACT (docs/analytics-pivot.md's "Amendment (owner decision,
 * 2026-08-22...)" section, item 2 -- "Recommendation effectiveness (unlinked,
 * attributed on-device)"):
 *   - This is the ENTIRE attribution mechanism. Nothing server-side ever
 *     joins a "shown" event with a "visited" event -- there is no
 *     recommendation id transmitted at show-time, no join key, no per-user
 *     history stored anywhere off-device. The device is the only place that
 *     ever knows both "I showed recommendation X for spots [A,B,C]" and "I
 *     later visited spot B" at once; the ONLY thing that ever leaves the
 *     device is the single outcome event `{ spotId, recommendationId,
 *     timeBucket }` if and only if a visit is attributable, and that event
 *     carries no user/device identifier of its own (identical shape and
 *     identity-free pipeline to `spot_visit`/`spot_presence`).
 *   - `AttributionState` is ephemeral, in-memory-only: it holds at most the
 *     most-recently-shown recommendation plus which of its spots have
 *     already been attributed. It is NOT a history of past recommendations
 *     shown -- there is no array of past `AttributionState`s anywhere in
 *     this file, by construction. The wiring PR resets it with the
 *     session/day (same "no local history accumulates" rule as
 *     `resetPresence()` in presenceCore.ts) each time a new recommendation
 *     is shown, `recordRecommendationShown` fully replaces the prior state.
 *   - This module never sends, logs, or persists anything; the caller owns
 *     all I/O.
 *
 * This module is intentionally dead code until a later, owner-merged PR
 * wires it up to the Tonight screen (protected path) -- see CLAUDE.md's
 * privacy guardrails. Do not import any UI, analytics, or consent module
 * from here.
 */

import { utcHourOf } from './presenceCore';

/**
 * The recommendation most recently shown to the user, plus which of its
 * spots have already produced an attribution (dedupe -- see
 * `attributeVisit`). `null` (the initial/reset value) means "no
 * recommendation currently tracked".
 */
export type AttributionState = {
  recommendationId: string;
  /** The spot ids that were recommended when this was shown. */
  spotIds: string[];
  /** Epoch ms the recommendation was shown to the user. */
  shownAtMs: number;
  /**
   * Spot ids from `spotIds` that have already produced a
   * `recommended_spot_visit` intent for this shown recommendation -- so a
   * device that leaves and re-enters the same recommended spot within the
   * attribution window doesn't attribute twice.
   */
  attributedSpotIds: string[];
};

export const INITIAL_ATTRIBUTION_STATE: AttributionState | null = null;

export type AttributionConfig = {
  /**
   * How long after a recommendation is shown a visit to one of its spots
   * still counts as attributable. Boundary is inclusive (a visit beginning
   * EXACTLY `attributionWindowMs` after showing still attributes), matching
   * the "boundary counts as the more-inside case" convention used elsewhere
   * in this package (see presenceCore.ts's classifySpot/dwellBucketOf).
   */
  attributionWindowMs: number;
};

/** Default attribution window: 12 hours (docs/analytics-pivot.md, item 2). */
export const DEFAULT_ATTRIBUTION_CONFIG: AttributionConfig = {
  attributionWindowMs: 12 * 60 * 60 * 1000
};

/**
 * The outcome intent -- the only thing this module ever produces besides
 * the next state. See the module header for the privacy contract.
 */
export type RecommendedSpotVisitIntent = {
  type: 'recommended_spot_visit';
  spotId: string;
  recommendationId: string;
  /** UTC hour of day (0-23) of the visit (i.e. the arrival), not the show. */
  timeBucket: number;
};

/**
 * Records that a recommendation covering `spotIds` was shown at
 * `shownAtMs`. Fully replaces any prior `AttributionState` -- there is only
 * ever "the most recently shown recommendation" tracked, per the module
 * header's "not a history" contract. The wiring PR calls this from the
 * Tonight screen whenever it renders a recommendation.
 */
export function recordRecommendationShown(recommendationId: string, spotIds: string[], shownAtMs: number): AttributionState {
  return { recommendationId, spotIds: [...spotIds], shownAtMs, attributedSpotIds: [] };
}

/** The reset value -- same "no local history accumulates" rule as `resetPresence()`. */
export function resetAttribution(): AttributionState | null {
  return null;
}

/**
 * Pure evaluation: given the current `AttributionState` and a visit to
 * `spotId` beginning at `timestampMs`, returns the `recommended_spot_visit`
 * intent for it, or `null` intent if the visit is not attributable for any
 * of these reasons:
 *   - no recommendation is currently tracked (`state === null`);
 *   - `spotId` was not among the recommended spots;
 *   - `spotId` was already attributed once for this shown recommendation
 *     (dedupe);
 *   - the visit began before the recommendation was shown, or more than
 *     `config.attributionWindowMs` after it.
 *
 * On a successful attribution, the returned state records `spotId` in
 * `attributedSpotIds` so a later visit to the SAME spot for the SAME shown
 * recommendation does not attribute again; visits to OTHER recommended
 * spots remain independently attributable until each has fired once.
 */
export function attributeVisit(
  state: AttributionState | null,
  spotId: string,
  timestampMs: number,
  config: AttributionConfig = DEFAULT_ATTRIBUTION_CONFIG
): { state: AttributionState | null; intent: RecommendedSpotVisitIntent | null } {
  if (state === null) {
    return { state, intent: null };
  }

  if (!state.spotIds.includes(spotId)) {
    return { state, intent: null };
  }

  if (state.attributedSpotIds.includes(spotId)) {
    return { state, intent: null };
  }

  const elapsedMs = timestampMs - state.shownAtMs;
  if (elapsedMs < 0 || elapsedMs > config.attributionWindowMs) {
    return { state, intent: null };
  }

  const nextState: AttributionState = { ...state, attributedSpotIds: [...state.attributedSpotIds, spotId] };
  const intent: RecommendedSpotVisitIntent = {
    type: 'recommended_spot_visit',
    spotId,
    recommendationId: state.recommendationId,
    timeBucket: utcHourOf(timestampMs)
  };

  return { state: nextState, intent };
}
