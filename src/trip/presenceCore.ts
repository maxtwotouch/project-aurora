/**
 * Trip mode presence state machine -- pure, deterministic, no I/O.
 *
 * PRIVACY CONTRACT (see docs/design-trip-tracking.md, sections 2 and 3, and
 * its "Amendment" pointing at docs/analytics-pivot.md's unlinked-tourism
 * amendment -- this file implements the "coarsen on device" boundary
 * described there):
 *   - This module never sends, logs, or persists anything. It is pure
 *     functions over plain data; the caller owns all I/O.
 *   - `PresenceState` is ephemeral, in-memory-only, current-visit state: it
 *     holds at most one spotId, the timestamps of that single visit, and two
 *     dedupe booleans. It is NOT a location history and NOT a trajectory --
 *     there is no array of past positions or past spots anywhere in this
 *     file, by construction (the type simply has no field to put one in).
 *   - Precise coordinates passed into `classifySpot`/`advancePresence` are
 *     used only to compute a spot id (or null) and are not retained by the
 *     returned state -- the state after a call contains a spotId, not a
 *     lat/lon.
 *   - `PresenceIntent` values -- the only output this module produces
 *     besides the next state -- carry either `{ type, spotId, utcHour }`
 *     (spot_presence / spot_presence_long) or `{ type, spotId, timeBucket,
 *     dwellBucket }` (spot_visit -- see below). No coordinates, no
 *     device/user identifiers, no timestamps finer than the hour, no exact
 *     dwell durations (only a coarse bucket). It is the caller's job to
 *     decide whether/how to transmit an intent (this module never does so
 *     itself).
 *   - The caller MUST hold `PresenceState` in memory only (never persist it
 *     to disk/AsyncStorage/etc) and MUST call `resetPresence()` when Trip
 *     mode is toggled off, per the design doc's "no local visit history
 *     accumulates" requirement.
 *
 * spot_visit (docs/analytics-pivot.md's amendment, item 1): a per-visit
 * summary emitted once the visit ends, either because the device left the
 * geofence, moved directly into a different spot, a sampling gap broke
 * continuity, or the trip session itself ended while still inside (see
 * `endPresenceSession`). It is additive -- spot_presence/spot_presence_long
 * are unchanged (the backend counters already key on them) and continue to
 * fire exactly as before; spot_visit is a second, independent intent
 * computed from the same visit.
 *   - `timeBucket` is the UTC hour (0-23) of the visit's ENTRY sample --
 *     deliberately the same "hour number" shape as `utcHour` above (and the
 *     backend counter key `type|spotId|utcHour`), not a "18-19" string, so a
 *     future backend counter for spot_visit can reuse the exact same
 *     dimension. Documented here as the one place this choice is made.
 *   - `dwellBucket` is computed from the CONTINUOUS-INSIDE duration of that
 *     visit only (`dwellBucketOf`, see below for the exact boundaries).
 *     Ending a visit at a genuine exit sample uses the last CONFIRMED
 *     continuous-inside sample as the end instant (`state.lastSampleMs`),
 *     not the first outside/gap-breaking sample -- we only credit dwell time
 *     the machine actually observed the device being inside for, the same
 *     honesty principle as the large-gap handling below. `endPresenceSession`
 *     is the one exception: an explicit session end IS itself a confirming
 *     instant (the app is telling us collection is stopping now, not that
 *     the device silently vanished), so its duration runs through the given
 *     `timestampMs`, not `lastSampleMs`.
 *
 * This module is intentionally dead code until a later, owner-merged PR
 * wires it up to `expo-location` and the Trip mode UI (both protected paths
 * -- see CLAUDE.md's privacy guardrails). Do not import `expo-location` or
 * any analytics/consent module from here.
 */

/** A spot's geofence: centre coordinates plus a per-spot radius in metres. */
export type SpotGeofence = {
  spotId: string;
  lat: number;
  lon: number;
  radiusM: number;
};

/**
 * Ephemeral, current-visit-only state. `null` (the initial/reset value)
 * means "not currently inside any spot's geofence".
 */
export type PresenceState = {
  /** The spot the device is currently classified as inside, or null. */
  currentSpotId: string | null;
  /** Epoch ms of the sample that started the current visit. */
  enteredAtMs: number | null;
  /** Whether `spot_presence` has already been emitted for this visit. */
  presenceEmitted: boolean;
  /** Whether `spot_presence_long` has already been emitted for this visit. */
  longPresenceEmitted: boolean;
  /**
   * Epoch ms of the last sample processed (regardless of classification),
   * used only to reject out-of-order/duplicate samples and to detect large
   * gaps between samples. Not a history -- a single scalar, overwritten on
   * every call.
   */
  lastSampleMs: number | null;
};

/** The reset/initial state: no current visit, no last-sample bookkeeping. */
export const INITIAL_PRESENCE_STATE: PresenceState = {
  currentSpotId: null,
  enteredAtMs: null,
  presenceEmitted: false,
  longPresenceEmitted: false,
  lastSampleMs: null
};

export type PresenceIntentType = 'spot_presence' | 'spot_presence_long' | 'spot_visit';

/** Continuous-inside dwell, bucketed coarsely -- see `dwellBucketOf`. */
export type DwellBucket = '<5m' | '5-15m' | '15-30m' | '30-60m' | '60m+';

/**
 * The occurrence intents (unchanged from before spot_visit existed): fired
 * on entry and on crossing the long-dwell threshold, respectively.
 */
export type PresenceOccurrenceIntent = {
  type: 'spot_presence' | 'spot_presence_long';
  spotId: string;
  /** UTC hour of day (0-23), derived from the triggering sample's timestamp. */
  utcHour: number;
};

/**
 * The visit-summary intent (docs/analytics-pivot.md amendment, item 1) --
 * fired once per visit, when the visit ends. See the module header for the
 * field-shape rationale.
 */
export type SpotVisitIntent = {
  type: 'spot_visit';
  spotId: string;
  /** UTC hour of day (0-23) of the visit's ENTRY sample. */
  timeBucket: number;
  dwellBucket: DwellBucket;
};

/**
 * An instruction to the caller to emit a presence event. This module never
 * sends it anywhere -- see the header's privacy contract.
 */
export type PresenceIntent = PresenceOccurrenceIntent | SpotVisitIntent;

export type PresenceSample = {
  lat: number;
  lon: number;
  timestampMs: number;
};

export type PresenceConfig = {
  /** Continuous-inside duration required to emit spot_presence_long. */
  dwellMs: number;
  /** A gap between samples larger than this breaks "continuously inside". */
  maxGapMs: number;
};

export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  dwellMs: 20 * 60 * 1000,
  maxGapMs: 10 * 60 * 1000
};

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lon points in metres, via the
 * haversine formula:
 *
 *   a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)
 *   c = 2·atan2(√a, √(1-a))
 *   d = R·c
 *
 * Accurate enough at spot-geofence scale (hundreds of metres to a few km);
 * ellipsoidal correction is not warranted here.
 */
export function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Deterministic classification rule (docs/design-trip-tracking.md section 3,
 * point 2):
 *   - inside exactly one spot's radius -> that spot;
 *   - inside several -> the nearest of those;
 *   - nearest spot overall is farther than its own radius -> null.
 *
 * "Inside" means distance <= radiusM (boundary counts as inside).
 * Ties (two spots exactly equidistant and both inside) resolve to the first
 * one encountered in `spots` order -- deterministic given a deterministic
 * input array, and not expected to occur with real spot geometry.
 */
export function classifySpot(lat: number, lon: number, spots: SpotGeofence[]): string | null {
  let nearest: { spotId: string; distanceM: number; radiusM: number } | null = null;

  for (const spot of spots) {
    const distanceM = haversineDistanceM(lat, lon, spot.lat, spot.lon);
    if (nearest === null || distanceM < nearest.distanceM) {
      nearest = { spotId: spot.spotId, distanceM, radiusM: spot.radiusM };
    }
  }

  if (nearest === null) return null;
  if (nearest.distanceM > nearest.radiusM) return null;

  return nearest.spotId;
}

/**
 * UTC hour of day (0-23) for a timestamp. Exported so sibling pure modules
 * (recommendationAttribution.ts, zoneDiscovery.ts) derive `timeBucket` the
 * same way instead of re-implementing it.
 */
export function utcHourOf(timestampMs: number): number {
  return new Date(timestampMs).getUTCHours();
}

/**
 * Buckets a continuous-inside dwell duration coarsely for `spot_visit` /
 * `zone_dwell` intents. Boundaries are inclusive on the lower bound (a
 * dwell of exactly 5 minutes falls in `'5-15m'`, not `'<5m'`) -- the same
 * "boundary counts as the more-inside bucket" convention `classifySpot`
 * already uses for radius boundaries.
 */
export function dwellBucketOf(dwellMs: number): DwellBucket {
  const minutes = dwellMs / 60_000;
  if (minutes < 5) return '<5m';
  if (minutes < 15) return '5-15m';
  if (minutes < 30) return '15-30m';
  if (minutes < 60) return '30-60m';
  return '60m+';
}

function freshEntryState(spotId: string, timestampMs: number): { state: PresenceState; intents: PresenceIntent[] } {
  return {
    state: {
      currentSpotId: spotId,
      enteredAtMs: timestampMs,
      presenceEmitted: true,
      longPresenceEmitted: false,
      lastSampleMs: timestampMs
    },
    intents: [{ type: 'spot_presence', spotId, utcHour: utcHourOf(timestampMs) }]
  };
}

/**
 * Builds the `spot_visit` summary for a visit that started at `enteredAtMs`
 * and is being closed off at `endMs` (which -- caller's choice -- may be the
 * last confirmed continuous-inside sample, or an explicit session-end
 * instant; see `endPresenceSession`). `Math.max(0, ...)` guards against a
 * caller passing an `endMs` earlier than `enteredAtMs`; this should not
 * happen given the call sites below, but the function stays defensively
 * pure rather than assuming it.
 */
function buildVisitIntent(spotId: string, enteredAtMs: number, endMs: number): SpotVisitIntent {
  const dwellMs = Math.max(0, endMs - enteredAtMs);
  return {
    type: 'spot_visit',
    spotId,
    timeBucket: utcHourOf(enteredAtMs),
    dwellBucket: dwellBucketOf(dwellMs)
  };
}

/**
 * If `state` represents an in-progress visit, returns the `spot_visit`
 * intent for it (using `state.lastSampleMs` -- the last CONFIRMED
 * continuous-inside sample -- as the end instant); otherwise returns an
 * empty array. A small helper shared by every "this visit just ended"
 * branch of `advancePresence` below.
 */
function flushOngoingVisit(state: PresenceState): PresenceIntent[] {
  if (state.currentSpotId === null || state.enteredAtMs === null || state.lastSampleMs === null) {
    return [];
  }
  return [buildVisitIntent(state.currentSpotId, state.enteredAtMs, state.lastSampleMs)];
}

/**
 * Pure transition function. See the module header for the privacy contract
 * and docs/design-trip-tracking.md section 3 for the product-level spec.
 *
 * Transition table (classifiedSpot = classifySpot(sample) given `spots`):
 *
 *   prior state          | classifiedSpot      | result
 *   ----------------------|---------------------|-----------------------------
 *   null                  | null                | stays null, no intents
 *   null                  | spot A               | enter A; emit spot_presence
 *   in A (dwell < DWELL)  | A (no gap, in order) | stays in A; dwell accrues;
 *                          |                      | no intent yet
 *   in A (dwell >= DWELL) | A                    | stays in A; emit
 *                          |                      | spot_presence_long once
 *   in A                  | null                 | forget (-> null); flush
 *                          |                      | spot_visit for A
 *   in A                  | B (different spot)   | flush spot_visit for A,
 *                          |                      | forget A, enter B in the
 *                          |                      | same step; emit
 *                          |                      | spot_presence for B
 *   in A                  | A, but gap >          | flush spot_visit for the
 *                          | maxGapMs since last  | ending visit, then treated
 *                          | sample               | as forget + fresh re-entry
 *                          |                      | into A; may re-emit
 *                          |                      | spot_presence
 *   any                    | (sample older than   | ignored entirely: state
 *                          | lastSampleMs)         | and intents unchanged
 *
 * Out-of-order/duplicate samples: a sample whose timestampMs is not strictly
 * newer than `state.lastSampleMs` is ignored outright (state and intents
 * both pass through unchanged) -- this also naturally rejects duplicate
 * samples at the same instant.
 *
 * Large gaps (foreground-only honesty): if the device was inside a spot,
 * goes to the background (no samples arrive), and comes back inside the
 * *same* spot after more than `config.maxGapMs`, we cannot know whether the
 * user ever left -- the app simply wasn't watching. Per the design doc this
 * app is foreground-only in v1, so the honest interpretation is to treat the
 * gap as breaking continuity: forget the old visit and re-evaluate as a
 * fresh entry. This can re-emit `spot_presence` for what is, from the
 * device's-eye view, an indistinguishable "still there" vs "left and came
 * back" case -- documented here rather than silently guessed at. The same
 * honesty principle applies to the `spot_visit` flushed for the ending
 * visit: its dwell is measured only up to the last CONFIRMED continuous
 * sample (`state.lastSampleMs`), not up to the gap-breaking sample.
 */
export function advancePresence(
  state: PresenceState,
  sample: PresenceSample,
  spots: SpotGeofence[],
  config: PresenceConfig = DEFAULT_PRESENCE_CONFIG
): { state: PresenceState; intents: PresenceIntent[] } {
  // Reject stale/duplicate samples: only strictly-newer timestamps advance
  // the machine.
  if (state.lastSampleMs !== null && sample.timestampMs <= state.lastSampleMs) {
    return { state, intents: [] };
  }

  const classified = classifySpot(sample.lat, sample.lon, spots);

  // Not currently inside any spot.
  if (state.currentSpotId === null) {
    if (classified === null) {
      return { state: { ...state, lastSampleMs: sample.timestampMs }, intents: [] };
    }
    return freshEntryState(classified, sample.timestampMs);
  }

  // Currently inside state.currentSpotId.
  if (classified === null) {
    // Left the geofence entirely -- forget, per the design doc, but first
    // flush the spot_visit summary for the visit that just ended.
    return {
      state: { ...INITIAL_PRESENCE_STATE, lastSampleMs: sample.timestampMs },
      intents: flushOngoingVisit(state)
    };
  }

  if (classified !== state.currentSpotId) {
    // Moved directly into a different spot: flush A's visit, then exit + enter B in one step.
    const entry = freshEntryState(classified, sample.timestampMs);
    return { state: entry.state, intents: [...flushOngoingVisit(state), ...entry.intents] };
  }

  // Still classified into the same spot. Check whether the gap since the
  // last sample is large enough to break "continuously inside".
  const gapMs = state.lastSampleMs === null ? 0 : sample.timestampMs - state.lastSampleMs;
  if (gapMs > config.maxGapMs) {
    // Flush the ending visit before treating this as a fresh re-entry.
    const entry = freshEntryState(classified, sample.timestampMs);
    return { state: entry.state, intents: [...flushOngoingVisit(state), ...entry.intents] };
  }

  // Genuinely continuous presence in the same spot.
  const nextState: PresenceState = { ...state, lastSampleMs: sample.timestampMs };
  const intents: PresenceIntent[] = [];

  if (!nextState.longPresenceEmitted && nextState.enteredAtMs !== null) {
    const dwellMs = sample.timestampMs - nextState.enteredAtMs;
    if (dwellMs >= config.dwellMs) {
      nextState.longPresenceEmitted = true;
      intents.push({ type: 'spot_presence_long', spotId: classified, utcHour: utcHourOf(sample.timestampMs) });
    }
  }

  return { state: nextState, intents };
}

/**
 * The trip-end/toggle-off reset (docs/design-trip-tracking.md section 3:
 * "reset when Trip mode ends -- so no local visit history accumulates").
 */
export function resetPresence(): PresenceState {
  return { ...INITIAL_PRESENCE_STATE };
}

/**
 * Ends a trip session/Trip-mode-off, flushing a final `spot_visit` if the
 * device was still inside a spot when the session ended (docs/analytics-
 * pivot.md amendment, item 1: "Session end must flush an in-progress
 * visit"). Always returns `resetPresence()` as the next state -- a session
 * end is a hard boundary, same as `resetPresence()` on its own.
 *
 * Unlike the in-`advancePresence` flushes above, this uses the given
 * `timestampMs` (not `state.lastSampleMs`) as the dwell's end instant: an
 * explicit session end is itself a confirming signal that the device was
 * present up to that moment (the caller -- app backgrounded, Trip mode
 * toggled off, etc -- is telling us collection stops NOW), unlike a silent
 * gap where we only trust the last sample we actually saw.
 */
export function endPresenceSession(state: PresenceState, timestampMs: number): { state: PresenceState; intents: PresenceIntent[] } {
  if (state.currentSpotId === null || state.enteredAtMs === null) {
    return { state: resetPresence(), intents: [] };
  }

  return {
    state: resetPresence(),
    intents: [buildVisitIntent(state.currentSpotId, state.enteredAtMs, timestampMs)]
  };
}

/**
 * Adapter from `src/data/spots.json`'s shape to `SpotGeofence[]`.
 *
 * `radiusOverrides` is a per-spot-id radius table (metres) -- the expected
 * end state per the design doc once the geographic validation pass of the
 * 28 spots lands (see docs/design-trip-tracking.md section 3, point 2, and
 * section 6 gate 3; that validation currently lives on an unmerged branch
 * and isn't available here). Spots without an override fall back to
 * `defaultRadiusM`.
 */
export function spotsToGeofences(
  spots: Array<{ id: string; lat: number; lon: number }>,
  radiusOverrides: Record<string, number> = {},
  defaultRadiusM = 500
): SpotGeofence[] {
  return spots.map((spot) => ({
    spotId: spot.id,
    lat: spot.lat,
    lon: spot.lon,
    radiusM: radiusOverrides[spot.id] ?? defaultRadiusM
  }));
}
