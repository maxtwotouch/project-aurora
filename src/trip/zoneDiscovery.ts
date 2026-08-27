/**
 * Zone-discovery ("new hotspot") classification -- pure, deterministic, no
 * I/O.
 *
 * PRIVACY CONTRACT (docs/analytics-pivot.md's "Amendment (owner decision,
 * 2026-08-22...)" section, item 3 -- "Spot discovery (unlinked, coarse
 * zones)"):
 *   - This module never sends, logs, or persists anything. It is pure
 *     functions over plain data; the caller owns all I/O.
 *   - `ZoneDwellState` is ephemeral, current-cell-only state (mirrors
 *     `PresenceState` in presenceCore.ts): at most one H3 cell id and two
 *     timestamps. It is NOT a location history and NOT a trajectory -- same
 *     "no field to put one in" construction as presenceCore.ts.
 *   - The emitted `ZoneDwellIntent` carries `{ h3Cell, timeBucket,
 *     dwellBucket }` only -- a resolution-7 H3 cell id (~5 km^2,
 *     deliberately too coarse to identify a cabin or address), an hour
 *     number, and a coarse dwell bucket. No coordinates, no device/user
 *     identifiers.
 *   - `NightDedupeState` (`{ nightKey, emittedCellIds }`) enforces "at most
 *     one zone_dwell per cell per night per device" ON DEVICE. Unlike
 *     `ZoneDwellState`/`PresenceState`, this one DOES intentionally persist
 *     across sessions within the same night (see its own doc comment below
 *     for why, and how the wiring layer is expected to handle it) -- but it
 *     is still not a trajectory: it is an unordered set of cell ids already
 *     reported tonight, with no ordering, timestamps, or visit-count
 *     information retained per cell.
 *
 * H3 vs grid fallback: this module uses the real `h3-js` library
 * (resolution 7, exactly as docs/analytics-pivot.md names it), not a
 * rounded-lat/lon grid fallback. Checked before adding it: `h3-js` is pure
 * JavaScript (Emscripten-compiled asm.js, NOT WebAssembly -- confirmed no
 * `WebAssembly` references in its bundled output -- so it runs fine under
 * Hermes, which cannot execute Wasm), has zero runtime dependencies, and is
 * pinned to an exact version (`"h3-js": "4.5.0"`, no caret) in package.json.
 * Real H3 avoids re-deriving cell geometry by hand and having it silently
 * diverge from the spec's actual coarseness/area guarantees.
 *
 * This module is intentionally dead code until a later, owner-merged PR
 * wires it up to `expo-location`, the urban-exclusion cell computation, and
 * the darkness/night-key predicates (protected paths) -- see CLAUDE.md's
 * privacy guardrails. Do not import `expo-location` or any analytics/consent
 * module from here.
 */

import { latLngToCell } from 'h3-js';

import { classifySpot, dwellBucketOf, utcHourOf } from './presenceCore';
import type { DwellBucket, PresenceSample, SpotGeofence } from './presenceCore';

/** H3 resolution used for discovery cells -- ~5 km^2 hexes, per the decision doc. */
export const ZONE_H3_RESOLUTION = 7;

/** Deterministic H3 resolution-7 cell id for a coordinate. */
export function cellIdFor(lat: number, lon: number): string {
  return latLngToCell(lat, lon, ZONE_H3_RESOLUTION);
}

/**
 * Ephemeral, current-cell-only state. `null` means "not currently
 * accumulating dwell in any cell" (outside every spot's exclusion doesn't
 * apply here -- this is the zone-tracking equivalent of `currentSpotId ===
 * null` in `PresenceState`, but for "which cell, if any, are we dwelling
 * in").
 */
export type ZoneDwellState = {
  currentCellId: string | null;
  /** Epoch ms of the sample that started the current cell dwell. */
  enteredAtMs: number | null;
  /** Epoch ms of the last sample processed while dwelling in `currentCellId`. */
  lastSampleMs: number | null;
};

export const INITIAL_ZONE_DWELL_STATE: ZoneDwellState = {
  currentCellId: null,
  enteredAtMs: null,
  lastSampleMs: null
};

/**
 * The per-night "already reported" set. UNLIKE `ZoneDwellState`, this is
 * deliberately persisted by the wiring layer ACROSS sessions within the
 * same night (device-local storage, e.g. AsyncStorage) -- the product
 * requirement is "at most one zone_dwell per cell per night per device", not
 * "per session", so the dedupe has to outlive a single app session. This
 * module stays pure by treating that persistence as the caller's problem:
 * `classifyZoneDwell` takes the current `NightDedupeState` in and returns
 * the (possibly rolled-over) next one out; it never reads or writes
 * storage itself. `nightKey` is produced by the caller-injected
 * `config.nightKeyOf` predicate (see `ZoneDiscoveryConfig`) -- this module
 * validates the key and clears `emittedCellIds` when it changes, but never
 * computes a night key itself, keeping this file timezone-free.
 */
export type NightDedupeState = {
  nightKey: string;
  emittedCellIds: string[];
};

/** No night established yet -- the first sample processed will roll it over. */
export const INITIAL_NIGHT_DEDUPE_STATE: NightDedupeState = { nightKey: '', emittedCellIds: [] };

export type ZoneDiscoveryConfig = {
  /** Continuous-inside duration required for a cell dwell to qualify (ZONE_DWELL_MS: 15 min per the decision doc). */
  dwellMs: number;
  /** A gap between samples larger than this breaks "continuously inside" -- same semantics as PresenceConfig.maxGapMs. */
  maxGapMs: number;
  /**
   * Cell ids to always exclude (Tromsø's urban cells) -- computed by the
   * wiring layer; this module just takes the set and checks membership.
   */
  urbanExclusion: ReadonlySet<string>;
  /**
   * Injected darkness predicate (wiring layer supplies the real solar-
   * elevation math, e.g. via src/scoring/solar.ts's darknessFactor) --
   * keeps this module free of solar/astronomy code.
   */
  isDark: (timestampMs: number) => boolean;
  /**
   * Injected night-key predicate. The wiring layer is expected to reuse the
   * app's existing Oslo-local "which night is this" convention (hour<6
   * rolls back to the previous local day -- see src/scoring/season.ts's
   * getOsloDayKey/getOsloParts, already duplicated similarly in
   * src/api/kp.ts) so a 02:00 zone_dwell counts toward the night that
   * started the evening before, exactly like the darkness-season and KP
   * "tonight" windows already do. Injected (not implemented here) to keep
   * this module timezone-pure, per the task's explicit instruction.
   */
  nightKeyOf: (timestampMs: number) => string;
};

/** ZONE_DWELL_MS: the decision doc's "dwells >= 15 min" threshold. */
export const ZONE_DWELL_MS = 15 * 60 * 1000;

/** Matches presenceCore.ts's DEFAULT_PRESENCE_CONFIG.maxGapMs -- same foreground-only-honesty gap semantics. */
export const DEFAULT_ZONE_MAX_GAP_MS = 10 * 60 * 1000;

export type ZoneDwellIntent = {
  type: 'zone_dwell';
  h3Cell: string;
  /** UTC hour of day (0-23) of the dwell's ENTRY sample -- same convention as spot_visit's timeBucket. */
  timeBucket: number;
  dwellBucket: DwellBucket;
};

function freshCellState(cellId: string, timestampMs: number): ZoneDwellState {
  return { currentCellId: cellId, enteredAtMs: timestampMs, lastSampleMs: timestampMs };
}

function abandonedState(timestampMs: number): ZoneDwellState {
  return { ...INITIAL_ZONE_DWELL_STATE, lastSampleMs: timestampMs };
}

function rollNightIfNeeded(dedupe: NightDedupeState, nightKey: string): NightDedupeState {
  return nightKey === dedupe.nightKey ? dedupe : { nightKey, emittedCellIds: [] };
}

/**
 * Pure transition function, integrated with the presence machine's flow
 * (see the module header): evaluates a single sample against the known-spot
 * geofences, the darkness gate, and the urban exclusion set, in that order,
 * before ever accumulating zone dwell.
 *
 * Order of precedence for a given sample (documented since several
 * conditions can be true at once):
 *   1. Night-key rollover check ALWAYS runs first, regardless of anything
 *      else below -- so `emittedCellIds` is cleared promptly at the start
 *      of a new night even if the current sample is inside a spot or in
 *      daylight.
 *   2. Stale/duplicate samples (timestampMs <= state.lastSampleMs) are
 *      dropped entirely, exactly like `advancePresence`.
 *   3. Known-spot classification wins: if `classifySpot` resolves the
 *      sample to a spot, any in-progress zone dwell is abandoned (no
 *      partial-dwell emission -- "spot entry cancels zone dwell"). This is
 *      the "sample-level exclusion via classifySpot null" mentioned in the
 *      task: a zone dwell can never straddle a spot geofence because the
 *      moment a sample lands inside one, tracking resets.
 *   4. Darkness gate: outside dark hours, zone dwell never accrues, and any
 *      in-progress dwell is abandoned (daylight breaks continuity the same
 *      way leaving the cell would).
 *   5. Urban exclusion: a sample landing in an excluded cell behaves like
 *      leaving -- dwell is abandoned, nothing accrues.
 *   6. Otherwise: normal cell entry/continue/switch/gap-break bookkeeping,
 *      mirroring `advancePresence`'s same-named branches exactly. Reaching
 *      `config.dwellMs` of continuous dwell in one cell emits `zone_dwell`
 *      ONCE (measured "inside, not at exit", same rationale as
 *      `spot_presence_long`) -- unless that cell id is already in
 *      `dedupe.emittedCellIds` for the current night, in which case
 *      tracking continues silently (no re-emission, no state corruption).
 */
export function classifyZoneDwell(
  state: ZoneDwellState,
  dedupe: NightDedupeState,
  sample: PresenceSample,
  spots: SpotGeofence[],
  config: ZoneDiscoveryConfig
): { state: ZoneDwellState; dedupe: NightDedupeState; intents: ZoneDwellIntent[] } {
  const rolledDedupe = rollNightIfNeeded(dedupe, config.nightKeyOf(sample.timestampMs));

  if (state.lastSampleMs !== null && sample.timestampMs <= state.lastSampleMs) {
    return { state, dedupe: rolledDedupe, intents: [] };
  }

  const classifiedSpotId = classifySpot(sample.lat, sample.lon, spots);
  if (classifiedSpotId !== null) {
    return { state: abandonedState(sample.timestampMs), dedupe: rolledDedupe, intents: [] };
  }

  if (!config.isDark(sample.timestampMs)) {
    return { state: abandonedState(sample.timestampMs), dedupe: rolledDedupe, intents: [] };
  }

  const cellId = cellIdFor(sample.lat, sample.lon);
  if (config.urbanExclusion.has(cellId)) {
    return { state: abandonedState(sample.timestampMs), dedupe: rolledDedupe, intents: [] };
  }

  if (state.currentCellId === null) {
    return { state: freshCellState(cellId, sample.timestampMs), dedupe: rolledDedupe, intents: [] };
  }

  if (cellId !== state.currentCellId) {
    // Moved to a different qualifying cell: no partial-dwell emission for
    // the abandoned one -- only a single cell's OWN continuous dwell counts.
    return { state: freshCellState(cellId, sample.timestampMs), dedupe: rolledDedupe, intents: [] };
  }

  const gapMs = state.lastSampleMs === null ? 0 : sample.timestampMs - state.lastSampleMs;
  if (gapMs > config.maxGapMs) {
    return { state: freshCellState(cellId, sample.timestampMs), dedupe: rolledDedupe, intents: [] };
  }

  const nextState: ZoneDwellState = { ...state, lastSampleMs: sample.timestampMs };
  const dwellMs = sample.timestampMs - (state.enteredAtMs as number);

  if (dwellMs < config.dwellMs) {
    return { state: nextState, dedupe: rolledDedupe, intents: [] };
  }

  if (rolledDedupe.emittedCellIds.includes(cellId)) {
    return { state: nextState, dedupe: rolledDedupe, intents: [] };
  }

  const intent: ZoneDwellIntent = {
    type: 'zone_dwell',
    h3Cell: cellId,
    timeBucket: utcHourOf(state.enteredAtMs as number),
    dwellBucket: dwellBucketOf(dwellMs)
  };
  const nextDedupe: NightDedupeState = {
    nightKey: rolledDedupe.nightKey,
    emittedCellIds: [...rolledDedupe.emittedCellIds, cellId]
  };

  return { state: nextState, dedupe: nextDedupe, intents: [intent] };
}
