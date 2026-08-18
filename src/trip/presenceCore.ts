/**
 * Trip mode presence state machine -- pure, deterministic, no I/O.
 *
 * PRIVACY CONTRACT (see docs/design-trip-tracking.md, sections 2 and 3 --
 * this file implements the "coarsen on device" boundary described there):
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
 *     besides the next state -- carry `{ type, spotId, utcHour }` only. No
 *     coordinates, no device/user identifiers, no timestamps finer than the
 *     hour. It is the caller's job to decide whether/how to transmit an
 *     intent (this module never does so itself).
 *   - The caller MUST hold `PresenceState` in memory only (never persist it
 *     to disk/AsyncStorage/etc) and MUST call `resetPresence()` when Trip
 *     mode is toggled off, per the design doc's "no local visit history
 *     accumulates" requirement.
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

export type PresenceIntentType = 'spot_presence' | 'spot_presence_long';

/**
 * An instruction to the caller to emit a presence event. This module never
 * sends it anywhere -- see the header's privacy contract.
 */
export type PresenceIntent = {
  type: PresenceIntentType;
  spotId: string;
  /** UTC hour of day (0-23), derived from the triggering sample's timestamp. */
  utcHour: number;
};

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

function utcHourOf(timestampMs: number): number {
  return new Date(timestampMs).getUTCHours();
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
 *   in A                  | null                 | forget (-> null); no intent
 *   in A                  | B (different spot)   | forget A, enter B in the
 *                          |                      | same step; emit
 *                          |                      | spot_presence for B
 *   in A                  | A, but gap >          | treated as forget + fresh
 *                          | maxGapMs since last  | re-entry into A; may
 *                          | sample               | re-emit spot_presence
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
 * back" case -- documented here rather than silently guessed at.
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
    // Left the geofence entirely -- forget, per the design doc.
    return { state: { ...INITIAL_PRESENCE_STATE, lastSampleMs: sample.timestampMs }, intents: [] };
  }

  if (classified !== state.currentSpotId) {
    // Moved directly into a different spot: exit + enter in one step.
    return freshEntryState(classified, sample.timestampMs);
  }

  // Still classified into the same spot. Check whether the gap since the
  // last sample is large enough to break "continuously inside".
  const gapMs = state.lastSampleMs === null ? 0 : sample.timestampMs - state.lastSampleMs;
  if (gapMs > config.maxGapMs) {
    return freshEntryState(classified, sample.timestampMs);
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
