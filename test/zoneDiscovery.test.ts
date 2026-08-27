// Tests for the pure zone-discovery classifier in
// src/trip/zoneDiscovery.ts -- no `expo-location`, no analytics module, no
// react-native import anywhere in this file's dependency graph, same
// convention as presenceCore.test.ts. See that module's own header for the
// privacy contract and docs/analytics-pivot.md's amendment, item 3, for the
// product spec.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ZONE_MAX_GAP_MS,
  INITIAL_NIGHT_DEDUPE_STATE,
  INITIAL_ZONE_DWELL_STATE,
  ZONE_DWELL_MS,
  ZONE_H3_RESOLUTION,
  cellIdFor,
  classifyZoneDwell
} from '../src/trip/zoneDiscovery.js';
import type { NightDedupeState, ZoneDiscoveryConfig, ZoneDwellState } from '../src/trip/zoneDiscovery.js';
import type { SpotGeofence } from '../src/trip/presenceCore.js';

// A single known spot -- reused across tests that need to exercise the
// "known-spot classification wins" precedence rule.
const SPOT_A: SpotGeofence = { spotId: 'a', lat: 69.65, lon: 18.95, radiusM: 500 };
const SPOTS: SpotGeofence[] = [SPOT_A];

// Two points, far from SPOT_A, that resolve to two DIFFERENT res-7 H3 cells
// (verified via cellIdFor -- see the "H3 cell determinism" suite below for
// the exact ids). ~1.7km apart in latitude, comfortably outside a single
// resolution-7 hex (~1.2km edge length).
const ZONE_POINT_1 = { lat: 69.6936, lon: 18.617 };
const ZONE_POINT_2 = { lat: 69.7086, lon: 18.617 };

const CELL_1 = cellIdFor(ZONE_POINT_1.lat, ZONE_POINT_1.lon);
const CELL_2 = cellIdFor(ZONE_POINT_2.lat, ZONE_POINT_2.lon);

const T0 = Date.UTC(2026, 7, 18, 22, 0, 0); // 2026-08-18T22:00:00Z, well within a "dark" night

function minutes(n: number): number {
  return n * 60 * 1000;
}

// Simple, timezone-free test doubles for the injected predicates -- the
// real ones (solar elevation, Oslo night-key rollback) are the wiring
// layer's job, not this module's.
const ALWAYS_DARK = () => true;
const NEVER_DARK = () => false;
/** UTC calendar-day key with an hour<6 rollback, mirroring the shape (not
 * the timezone) of the app's existing Oslo night-key convention -- good
 * enough to exercise rollover behaviour without pulling in Intl/timezone
 * machinery into this pure-core test. */
const UTC_NIGHT_KEY = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  const rollback = date.getUTCHours() < 6 ? 1 : 0;
  const key = new Date(timestampMs - rollback * 24 * 60 * 60 * 1000);
  return key.toISOString().slice(0, 10);
};

function baseConfig(overrides: Partial<ZoneDiscoveryConfig> = {}): ZoneDiscoveryConfig {
  return {
    dwellMs: ZONE_DWELL_MS,
    maxGapMs: DEFAULT_ZONE_MAX_GAP_MS,
    urbanExclusion: new Set<string>(),
    isDark: ALWAYS_DARK,
    nightKeyOf: UTC_NIGHT_KEY,
    ...overrides
  };
}

describe('cellIdFor / H3 cell determinism', () => {
  test('the same coordinates always produce the same cell id', () => {
    const first = cellIdFor(69.6936, 18.617);
    const second = cellIdFor(69.6936, 18.617);
    assert.equal(first, second);
    assert.equal(typeof first, 'string');
    assert.ok(first.length > 0);
  });

  test('two well-separated points resolve to different cells', () => {
    assert.notEqual(CELL_1, CELL_2);
  });

  test('ZONE_H3_RESOLUTION is 7, per the decision doc', () => {
    assert.equal(ZONE_H3_RESOLUTION, 7);
  });
});

// Advances through the same cell with samples spaced `intervalMs` apart
// (well under maxGapMs), stopping at the first sample whose timestamp is >=
// `startMs + targetElapsedMs`. Mirrors presenceCore.test.ts's
// stepUntilElapsed helper.
function stepZoneUntilElapsed(
  entered: { state: ZoneDwellState; dedupe: NightDedupeState },
  point: { lat: number; lon: number },
  targetElapsedMs: number,
  config: ZoneDiscoveryConfig,
  intervalMs: number = minutes(5)
): { state: ZoneDwellState; dedupe: NightDedupeState; intents: ReturnType<typeof classifyZoneDwell>['intents'] } {
  const startMs = entered.state.enteredAtMs as number;
  let current = { state: entered.state, dedupe: entered.dedupe, intents: [] as ReturnType<typeof classifyZoneDwell>['intents'] };
  let elapsed = 0;

  while (elapsed < targetElapsedMs) {
    const step = Math.min(intervalMs, targetElapsedMs - elapsed);
    elapsed += step;
    current = classifyZoneDwell(
      current.state,
      current.dedupe,
      { lat: point.lat, lon: point.lon, timestampMs: startMs + elapsed },
      SPOTS,
      config
    );
  }

  return current;
}

describe('classifyZoneDwell: dwell accumulates only while unclassified', () => {
  test('entering an unclassified, dark, non-excluded cell starts tracking with no intent yet', () => {
    const config = baseConfig();
    const result = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );

    assert.deepEqual(result.intents, []);
    assert.equal(result.state.currentCellId, CELL_1);
    assert.equal(result.state.enteredAtMs, T0);
  });

  test('reaching ZONE_DWELL_MS of continuous dwell in one cell emits zone_dwell exactly once', () => {
    const config = baseConfig();
    const entered = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );

    const justUnder = stepZoneUntilElapsed(entered, ZONE_POINT_1, ZONE_DWELL_MS - 1, config);
    assert.deepEqual(justUnder.intents, []);

    const atThreshold = stepZoneUntilElapsed(entered, ZONE_POINT_1, ZONE_DWELL_MS, config);
    assert.deepEqual(atThreshold.intents, [
      { type: 'zone_dwell', h3Cell: CELL_1, timeBucket: new Date(T0).getUTCHours(), dwellBucket: '15-30m' }
    ]);
    assert.deepEqual(atThreshold.dedupe.emittedCellIds, [CELL_1]);

    // A further sample past the threshold must not re-emit.
    const after = classifyZoneDwell(
      atThreshold.state,
      atThreshold.dedupe,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 + ZONE_DWELL_MS + minutes(1) },
      SPOTS,
      config
    );
    assert.deepEqual(after.intents, []);
  });
});

describe('classifyZoneDwell: spot entry cancels zone dwell', () => {
  test('a sample landing inside a known spot abandons any in-progress zone dwell, with no intent', () => {
    const config = baseConfig();
    const entered = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );
    assert.equal(entered.state.currentCellId, CELL_1);

    const intoSpot = classifyZoneDwell(
      entered.state,
      entered.dedupe,
      { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 + minutes(5) },
      SPOTS,
      config
    );

    assert.deepEqual(intoSpot.intents, []);
    assert.equal(intoSpot.state.currentCellId, null);
    assert.equal(intoSpot.state.enteredAtMs, null);
  });
});

describe('classifyZoneDwell: gap breaks continuity', () => {
  test('a gap larger than maxGapMs resets the dwell in the same cell (no intent, fresh entry)', () => {
    const config = baseConfig();
    const entered = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );

    const afterGap = classifyZoneDwell(
      entered.state,
      entered.dedupe,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 + config.maxGapMs + 1 },
      SPOTS,
      config
    );

    assert.deepEqual(afterGap.intents, []);
    assert.equal(afterGap.state.currentCellId, CELL_1);
    assert.equal(afterGap.state.enteredAtMs, T0 + config.maxGapMs + 1);
  });

  test('a gap exactly at maxGapMs does NOT break continuity', () => {
    const config = baseConfig();
    const entered = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );

    const atGap = classifyZoneDwell(
      entered.state,
      entered.dedupe,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 + config.maxGapMs },
      SPOTS,
      config
    );

    assert.deepEqual(atGap.intents, []);
    // enteredAtMs unchanged -- still the original dwell.
    assert.equal(atGap.state.enteredAtMs, T0);
  });

  test('moving to a different qualifying cell forgets the old dwell and starts fresh, no intent', () => {
    const config = baseConfig();
    const entered = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );

    const switched = classifyZoneDwell(
      entered.state,
      entered.dedupe,
      { lat: ZONE_POINT_2.lat, lon: ZONE_POINT_2.lon, timestampMs: T0 + minutes(5) },
      SPOTS,
      config
    );

    assert.deepEqual(switched.intents, []);
    assert.equal(switched.state.currentCellId, CELL_2);
    assert.equal(switched.state.enteredAtMs, T0 + minutes(5));
  });
});

describe('classifyZoneDwell: dark-gate false -> nothing', () => {
  test('a sample outside dark hours never accrues dwell, even in an otherwise-qualifying cell', () => {
    const config = baseConfig({ isDark: NEVER_DARK });
    const result = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );

    assert.deepEqual(result.intents, []);
    assert.equal(result.state.currentCellId, null);
  });

  test('daylight abandons an in-progress dwell that started while dark', () => {
    const config = baseConfig();
    const entered = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );
    assert.equal(entered.state.currentCellId, CELL_1);

    const dawnConfig = baseConfig({ isDark: NEVER_DARK });
    const afterDawn = classifyZoneDwell(
      entered.state,
      entered.dedupe,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 + minutes(5) },
      SPOTS,
      dawnConfig
    );

    assert.deepEqual(afterDawn.intents, []);
    assert.equal(afterDawn.state.currentCellId, null);
  });
});

describe('classifyZoneDwell: urban exclusion', () => {
  test('a sample in an excluded cell never accrues dwell', () => {
    const config = baseConfig({ urbanExclusion: new Set([CELL_1]) });
    const result = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );

    assert.deepEqual(result.intents, []);
    assert.equal(result.state.currentCellId, null);
  });

  test('excluding one cell does not affect dwell in a different cell', () => {
    const config = baseConfig({ urbanExclusion: new Set([CELL_2]) });
    const result = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );

    assert.equal(result.state.currentCellId, CELL_1);
  });
});

describe('classifyZoneDwell: per-night dedupe', () => {
  test('the same cell does not emit a second zone_dwell later the same night', () => {
    const config = baseConfig();
    const entered = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );
    const firstDwell = stepZoneUntilElapsed(entered, ZONE_POINT_1, ZONE_DWELL_MS, config);
    assert.equal(firstDwell.intents.length, 1);

    // Leave (spot entry, simplest way to "exit" the cell) and come back
    // later the same night.
    const left = classifyZoneDwell(
      firstDwell.state,
      firstDwell.dedupe,
      { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 + ZONE_DWELL_MS + minutes(5) },
      SPOTS,
      config
    );

    const reentered = classifyZoneDwell(
      left.state,
      left.dedupe,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 + ZONE_DWELL_MS + minutes(10) },
      SPOTS,
      config
    );
    const secondDwell = stepZoneUntilElapsed(reentered, ZONE_POINT_1, ZONE_DWELL_MS, config);

    assert.deepEqual(secondDwell.intents, []);
    assert.deepEqual(secondDwell.dedupe.emittedCellIds, [CELL_1]);
  });

  test('night rollover clears the emitted-cells set, allowing the same cell to emit again', () => {
    const config = baseConfig();
    const entered = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      INITIAL_NIGHT_DEDUPE_STATE,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 },
      SPOTS,
      config
    );
    const firstDwell = stepZoneUntilElapsed(entered, ZONE_POINT_1, ZONE_DWELL_MS, config);
    assert.equal(firstDwell.intents.length, 1);
    assert.equal(firstDwell.dedupe.nightKey, UTC_NIGHT_KEY(T0));

    // A sample the following night (>24h later, so UTC_NIGHT_KEY definitely
    // differs) in the same cell should be free to emit again.
    const nextNight = T0 + 24 * 60 * 60 * 1000;
    const enteredAgain = classifyZoneDwell(
      INITIAL_ZONE_DWELL_STATE,
      firstDwell.dedupe,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: nextNight },
      SPOTS,
      config
    );
    assert.notEqual(enteredAgain.dedupe.nightKey, firstDwell.dedupe.nightKey);
    assert.deepEqual(enteredAgain.dedupe.emittedCellIds, []);

    const secondDwell = stepZoneUntilElapsed(enteredAgain, ZONE_POINT_1, ZONE_DWELL_MS, config);
    assert.deepEqual(secondDwell.intents, [
      { type: 'zone_dwell', h3Cell: CELL_1, timeBucket: new Date(nextNight).getUTCHours(), dwellBucket: '15-30m' }
    ]);
  });

  test('the night-key check runs even on a stale/duplicate sample so rollover is never missed', () => {
    const config = baseConfig();
    // A dedupe state left over from "night 1" ...
    const staleDedupe: NightDedupeState = { nightKey: UTC_NIGHT_KEY(T0), emittedCellIds: [CELL_1] };
    // ...processed with a sample from night 2 that also happens to be
    // stale relative to state.lastSampleMs (out-of-order/duplicate).
    const state: ZoneDwellState = { currentCellId: null, enteredAtMs: null, lastSampleMs: T0 + 24 * 60 * 60 * 1000 };

    const result = classifyZoneDwell(
      state,
      staleDedupe,
      { lat: ZONE_POINT_1.lat, lon: ZONE_POINT_1.lon, timestampMs: T0 + 24 * 60 * 60 * 1000 - 1 },
      SPOTS,
      config
    );

    assert.deepEqual(result.intents, []);
    // The stale sample itself is dropped (state unchanged)...
    assert.deepEqual(result.state, state);
    // ...but the night key still rolled over based on the sample's own
    // timestamp, since that check runs before the staleness check.
    assert.notEqual(result.dedupe.nightKey, staleDedupe.nightKey);
    assert.deepEqual(result.dedupe.emittedCellIds, []);
  });
});
