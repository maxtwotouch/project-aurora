// Tests for the pure Trip-mode presence state machine in
// src/trip/presenceCore.ts -- no `expo-location`, no analytics module, no
// react-native import anywhere in this file's dependency graph, so it runs
// the same way under plain node:test as userLocation.test.ts /
// expoGoDetection.test.ts. See presenceCore.ts's own header for the privacy
// contract this machine exists to enforce, and
// docs/design-trip-tracking.md sections 2-3 for the product spec.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PRESENCE_CONFIG,
  INITIAL_PRESENCE_STATE,
  advancePresence,
  classifySpot,
  resetPresence,
  spotsToGeofences
} from '../src/trip/presenceCore.js';
import type { PresenceConfig, PresenceState, SpotGeofence } from '../src/trip/presenceCore.js';

// A minimal two-spot layout used across most tests: A and B are close
// enough (~700m apart) that a point can be "inside" both 500m-radius
// geofences at once, which is what the overlap/nearest tests below rely on.
const SPOT_A: SpotGeofence = { spotId: 'a', lat: 69.65, lon: 18.95, radiusM: 500 };
const SPOT_B: SpotGeofence = { spotId: 'b', lat: 69.656, lon: 18.95, radiusM: 500 };
const SPOTS: SpotGeofence[] = [SPOT_A, SPOT_B];

// Well outside both A and B's radii.
const OUTSIDE = { lat: 69.9, lon: 18.5 };

const T0 = Date.UTC(2026, 7, 18, 20, 0, 0); // 2026-08-18T20:00:00Z

function minutes(n: number): number {
  return n * 60 * 1000;
}

describe('classifySpot', () => {
  test('inside exactly one radius returns that spot', () => {
    // ~55m north of A's centre, well outside B's radius.
    assert.equal(classifySpot(69.6505, 18.95, [SPOT_A]), 'a');
  });

  test('outside every radius returns null', () => {
    assert.equal(classifySpot(OUTSIDE.lat, OUTSIDE.lon, SPOTS), null);
  });

  test('exactly on a radius boundary counts as inside', () => {
    // 500m due north of A's centre (~0.0045 deg latitude at this latitude).
    const boundaryLat = SPOT_A.lat + 500 / 111320;
    const spotId = classifySpot(boundaryLat, SPOT_A.lon, [SPOT_A]);
    assert.equal(spotId, 'a');
  });

  test('inside several radii resolves to the nearest', () => {
    // A point roughly 300m from A and further from B still resolves to A.
    const nearA = classifySpot(69.6527, 18.95, SPOTS);
    assert.equal(nearA, 'a');

    // A point inside both A's and B's radii, but closer to B, resolves to B.
    const nearB = classifySpot(69.654, 18.95, SPOTS);
    assert.equal(nearB, 'b');
  });

  test('no spots at all returns null', () => {
    assert.equal(classifySpot(SPOT_A.lat, SPOT_A.lon, []), null);
  });
});

describe('advancePresence: null -> spot (enter)', () => {
  test('entering a spot emits spot_presence and records enter state', () => {
    const { state, intents } = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);

    assert.deepEqual(intents, [{ type: 'spot_presence', spotId: 'a', utcHour: 20 }]);
    assert.equal(state.currentSpotId, 'a');
    assert.equal(state.enteredAtMs, T0);
    assert.equal(state.presenceEmitted, true);
    assert.equal(state.longPresenceEmitted, false);
    assert.equal(state.lastSampleMs, T0);
  });

  test('staying outside every spot emits nothing and stays null', () => {
    const { state, intents } = advancePresence(
      INITIAL_PRESENCE_STATE,
      { lat: OUTSIDE.lat, lon: OUTSIDE.lon, timestampMs: T0 },
      SPOTS
    );

    assert.deepEqual(intents, []);
    assert.equal(state.currentSpotId, null);
    assert.equal(state.lastSampleMs, T0);
  });
});

describe('advancePresence: dedupe while continuously inside', () => {
  test('a second sample inside the same spot shortly after entry emits nothing new', () => {
    const first = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const second = advancePresence(
      first.state,
      { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 + minutes(5) },
      SPOTS
    );

    assert.deepEqual(second.intents, []);
    assert.equal(second.state.currentSpotId, 'a');
    assert.equal(second.state.presenceEmitted, true);
    // enteredAtMs is preserved from the original entry, not bumped forward.
    assert.equal(second.state.enteredAtMs, T0);
  });
});

// Advances through a spot with samples spaced `intervalMs` apart (well under
// maxGapMs, so "continuously inside" is never broken by the gap check),
// stopping at the first sample whose timestamp is >= `entered.enteredAtMs +
// targetElapsedMs`. Returns the final { state, intents } from the last call,
// mirroring how a real caller polls frequently rather than jumping straight
// from entry to the dwell threshold in one sample (which would itself exceed
// maxGapMs and be indistinguishable from a backgrounding gap).
function stepUntilElapsed(
  entered: { state: PresenceState },
  targetElapsedMs: number,
  intervalMs: number = minutes(5)
): { state: PresenceState; intents: ReturnType<typeof advancePresence>['intents'] } {
  const startMs = entered.state.enteredAtMs as number;
  let current = { state: entered.state, intents: [] as ReturnType<typeof advancePresence>['intents'] };
  let elapsed = 0;

  while (elapsed < targetElapsedMs) {
    const step = Math.min(intervalMs, targetElapsedMs - elapsed);
    elapsed += step;
    current = advancePresence(current.state, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: startMs + elapsed }, SPOTS);
  }

  return current;
}

describe('advancePresence: dwell threshold for spot_presence_long', () => {
  test('just under the dwell threshold emits nothing extra', () => {
    const entered = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const justUnder = stepUntilElapsed(entered, DEFAULT_PRESENCE_CONFIG.dwellMs - 1);

    assert.deepEqual(justUnder.intents, []);
    assert.equal(justUnder.state.longPresenceEmitted, false);
  });

  test('exactly at the dwell threshold emits spot_presence_long once', () => {
    const entered = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const atThreshold = stepUntilElapsed(entered, DEFAULT_PRESENCE_CONFIG.dwellMs);

    assert.deepEqual(atThreshold.intents, [
      { type: 'spot_presence_long', spotId: 'a', utcHour: new Date(T0 + DEFAULT_PRESENCE_CONFIG.dwellMs).getUTCHours() }
    ]);
    assert.equal(atThreshold.state.longPresenceEmitted, true);

    // A further sample after the threshold must not re-emit.
    const after = advancePresence(
      atThreshold.state,
      { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 + DEFAULT_PRESENCE_CONFIG.dwellMs + minutes(1) },
      SPOTS
    );
    assert.deepEqual(after.intents, []);
  });
});

describe('advancePresence: spot -> null (exit forgets state)', () => {
  test('leaving the geofence forgets all visit state', () => {
    const entered = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const left = advancePresence(entered.state, { lat: OUTSIDE.lat, lon: OUTSIDE.lon, timestampMs: T0 + minutes(2) }, SPOTS);

    assert.deepEqual(left.intents, []);
    assert.equal(left.state.currentSpotId, null);
    assert.equal(left.state.enteredAtMs, null);
    assert.equal(left.state.presenceEmitted, false);
    assert.equal(left.state.longPresenceEmitted, false);
    // lastSampleMs is retained so a later out-of-order sample is still
    // rejected correctly.
    assert.equal(left.state.lastSampleMs, T0 + minutes(2));
  });

  test('re-entering after leaving emits spot_presence again and resets the dwell clock', () => {
    const entered = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const left = advancePresence(entered.state, { lat: OUTSIDE.lat, lon: OUTSIDE.lon, timestampMs: T0 + minutes(2) }, SPOTS);
    const reentered = advancePresence(
      left.state,
      { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 + minutes(4) },
      SPOTS
    );

    assert.deepEqual(reentered.intents, [{ type: 'spot_presence', spotId: 'a', utcHour: 20 }]);
    assert.equal(reentered.state.enteredAtMs, T0 + minutes(4));
    assert.equal(reentered.state.longPresenceEmitted, false);
  });
});

describe('advancePresence: spot -> different spot (exit+enter in one step)', () => {
  test('a sample landing directly in a different spot forgets A and enters B, emitting for B only', () => {
    const enteredA = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const toB = advancePresence(enteredA.state, { lat: SPOT_B.lat, lon: SPOT_B.lon, timestampMs: T0 + minutes(3) }, SPOTS);

    assert.deepEqual(toB.intents, [{ type: 'spot_presence', spotId: 'b', utcHour: 20 }]);
    assert.equal(toB.state.currentSpotId, 'b');
    assert.equal(toB.state.enteredAtMs, T0 + minutes(3));
    assert.equal(toB.state.longPresenceEmitted, false);
  });
});

describe('advancePresence: large gap breaks continuity even in the same spot', () => {
  test('a gap larger than maxGapMs resets the visit and re-emits spot_presence', () => {
    const entered = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const afterGap = advancePresence(
      entered.state,
      { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 + DEFAULT_PRESENCE_CONFIG.maxGapMs + 1 },
      SPOTS
    );

    assert.deepEqual(afterGap.intents, [
      { type: 'spot_presence', spotId: 'a', utcHour: new Date(T0 + DEFAULT_PRESENCE_CONFIG.maxGapMs + 1).getUTCHours() }
    ]);
    assert.equal(afterGap.state.enteredAtMs, T0 + DEFAULT_PRESENCE_CONFIG.maxGapMs + 1);
    assert.equal(afterGap.state.longPresenceEmitted, false);
  });

  test('a gap exactly at maxGapMs does NOT break continuity', () => {
    const entered = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const atGap = advancePresence(
      entered.state,
      { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 + DEFAULT_PRESENCE_CONFIG.maxGapMs },
      SPOTS
    );

    assert.deepEqual(atGap.intents, []);
    // enteredAtMs unchanged -- still the original visit.
    assert.equal(atGap.state.enteredAtMs, T0);
  });

  test('custom config: a small maxGapMs breaks continuity sooner', () => {
    const config: PresenceConfig = { dwellMs: minutes(20), maxGapMs: minutes(1) };
    const entered = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS, config);
    const afterGap = advancePresence(
      entered.state,
      { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 + minutes(1) + 1 },
      SPOTS,
      config
    );

    assert.equal(afterGap.intents.length, 1);
    assert.equal(afterGap.intents[0].type, 'spot_presence');
    assert.equal(afterGap.state.enteredAtMs, T0 + minutes(1) + 1);
  });
});

describe('advancePresence: out-of-order and duplicate samples are ignored', () => {
  test('a sample older than lastSampleMs is dropped entirely (state and intents unchanged)', () => {
    const entered = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const stale = advancePresence(
      entered.state,
      { lat: OUTSIDE.lat, lon: OUTSIDE.lon, timestampMs: T0 - minutes(1) },
      SPOTS
    );

    assert.deepEqual(stale.intents, []);
    assert.deepEqual(stale.state, entered.state);
  });

  test('a sample with an equal timestamp is also dropped', () => {
    const entered = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: T0 }, SPOTS);
    const duplicate = advancePresence(entered.state, { lat: OUTSIDE.lat, lon: OUTSIDE.lon, timestampMs: T0 }, SPOTS);

    assert.deepEqual(duplicate.intents, []);
    assert.deepEqual(duplicate.state, entered.state);
  });
});

describe('utcHour derivation', () => {
  test('utcHour reflects the sample timestamp in UTC, not local time', () => {
    const lateNight = Date.UTC(2026, 7, 18, 23, 30, 0);
    const { intents } = advancePresence(INITIAL_PRESENCE_STATE, { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: lateNight }, SPOTS);
    assert.equal(intents[0].utcHour, 23);
  });

  test('utcHour rolls over past midnight UTC', () => {
    const justAfterMidnight = Date.UTC(2026, 7, 19, 0, 5, 0);
    const { intents } = advancePresence(
      INITIAL_PRESENCE_STATE,
      { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: justAfterMidnight },
      SPOTS
    );
    assert.equal(intents[0].utcHour, 0);
  });
});

describe('resetPresence', () => {
  test('always returns the initial state, regardless of prior state', () => {
    const midVisit: PresenceState = {
      currentSpotId: 'a',
      enteredAtMs: T0,
      presenceEmitted: true,
      longPresenceEmitted: true,
      lastSampleMs: T0 + minutes(30)
    };

    assert.deepEqual(resetPresence(), INITIAL_PRESENCE_STATE);
    // resetPresence() does not read or depend on the prior state at all --
    // demonstrated by calling it with no arguments regardless of midVisit.
    void midVisit;
  });

  test('reset returns a fresh object, not a shared mutable reference', () => {
    const a = resetPresence();
    const b = resetPresence();
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
  });
});

describe('spotsToGeofences adapter', () => {
  const rawSpots = [
    { id: 'ersfjordbotn', lat: 69.6626, lon: 18.3738 },
    { id: 'kattfjordvatnet', lat: 69.6667, lon: 18.2 }
  ];

  test('falls back to defaultRadiusM when no override is given', () => {
    const geofences = spotsToGeofences(rawSpots);
    assert.deepEqual(geofences, [
      { spotId: 'ersfjordbotn', lat: 69.6626, lon: 18.3738, radiusM: 500 },
      { spotId: 'kattfjordvatnet', lat: 69.6667, lon: 18.2, radiusM: 500 }
    ]);
  });

  test('applies a custom defaultRadiusM', () => {
    const geofences = spotsToGeofences(rawSpots, {}, 300);
    assert.equal(geofences[0].radiusM, 300);
    assert.equal(geofences[1].radiusM, 300);
  });

  test('per-spot overrides take precedence over the default, unmatched spots still fall back', () => {
    const geofences = spotsToGeofences(rawSpots, { ersfjordbotn: 250 });
    assert.equal(geofences.find((g) => g.spotId === 'ersfjordbotn')?.radiusM, 250);
    assert.equal(geofences.find((g) => g.spotId === 'kattfjordvatnet')?.radiusM, 500);
  });
});
