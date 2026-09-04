// End-to-end (still fully pure/in-memory) flow test: recommendation shown ->
// local on-device attribution -> a real arrival via the presence machine ->
// recommended_spot_visit intent -> wire payload. Exercises attributionStore.ts
// (the module singleton) together with presenceCore.ts's advancePresence and
// tripEventWire.ts's toWireBatch, using two real spots from
// src/data/spots.json so the geofence math is realistic rather than
// hand-picked coordinates. See recommendationAttribution.ts's header for the
// "entire attribution mechanism is on-device, nothing server-side ever joins
// shown with visited" privacy contract this exercises end-to-end.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import spotsData from '../src/data/spots.json' with { type: 'json' };
import {
  attributeArrival,
  recordShownRecommendation,
  resetAttributionStore,
  TONIGHT_BEST_SPOT_RECOMMENDATION_ID
} from '../src/trip/attributionStore.js';
import {
  DEFAULT_PRESENCE_CONFIG,
  INITIAL_PRESENCE_STATE,
  advancePresence,
  spotsToGeofences
} from '../src/trip/presenceCore.js';
import type { PresenceSample, SpotGeofence } from '../src/trip/presenceCore.js';
import { toWireBatch } from '../src/trip/tripEventWire.js';
import type { TripEventIntent } from '../src/trip/tripEventWire.js';

type RawSpot = { id: string; lat: number; lon: number };
const typedSpots = spotsData as RawSpot[];

// Two real spots from src/data/spots.json, ~15km apart -- far enough that
// A's 500m default geofence and B's 500m default geofence never overlap.
const SPOT_A = typedSpots.find((spot) => spot.id === 'ersfjordbotn');
const SPOT_B = typedSpots.find((spot) => spot.id === 'kattfjordvatnet');

if (!SPOT_A || !SPOT_B) {
  throw new Error('attributionFlow.test.ts expects src/data/spots.json to contain both ersfjordbotn and kattfjordvatnet');
}

const GEOFENCES: SpotGeofence[] = spotsToGeofences([SPOT_A, SPOT_B]);

const T0 = Date.UTC(2026, 7, 18, 20, 0, 0); // 2026-08-18T20:00:00Z

function hours(n: number): number {
  return n * 60 * 60 * 1000;
}
function minutes(n: number): number {
  return n * 60 * 1000;
}

describe('recommendation -> attribution -> visit -> recommended_spot_visit (happy path)', () => {
  beforeEach(() => {
    resetAttributionStore();
  });

  test('a sample inside spot A 30 minutes after showing produces spot_presence, and the arrival attributes', () => {
    recordShownRecommendation(TONIGHT_BEST_SPOT_RECOMMENDATION_ID, [SPOT_A.id], T0);

    const arrivalAt = T0 + minutes(30);
    const sample: PresenceSample = { lat: SPOT_A.lat, lon: SPOT_A.lon, timestampMs: arrivalAt };
    const { intents } = advancePresence(INITIAL_PRESENCE_STATE, sample, GEOFENCES, DEFAULT_PRESENCE_CONFIG);

    assert.deepEqual(intents, [{ type: 'spot_presence', spotId: SPOT_A.id, utcHour: new Date(arrivalAt).getUTCHours() }]);

    const attributed = attributeArrival(SPOT_A.id, arrivalAt);
    assert.deepEqual(attributed, {
      type: 'recommended_spot_visit',
      spotId: SPOT_A.id,
      recommendationId: TONIGHT_BEST_SPOT_RECOMMENDATION_ID,
      timeBucket: new Date(arrivalAt).getUTCHours()
    });
  });

  test('toWireBatch of the attributed intent contains exactly {type, spotId, recommendationId, utcHour} and nothing else identifying', () => {
    recordShownRecommendation(TONIGHT_BEST_SPOT_RECOMMENDATION_ID, [SPOT_A.id], T0);
    const arrivalAt = T0 + minutes(30);
    const attributed = attributeArrival(SPOT_A.id, arrivalAt);
    assert.notEqual(attributed, null);

    const wire = toWireBatch([attributed as TripEventIntent]);
    assert.equal(wire.length, 1);

    const payload = wire[0];
    assert.deepEqual(payload, {
      type: 'recommended_spot_visit',
      spotId: SPOT_A.id,
      recommendationId: TONIGHT_BEST_SPOT_RECOMMENDATION_ID,
      utcHour: new Date(arrivalAt).getUTCHours()
    });
    assert.deepEqual(Object.keys(payload).sort(), ['recommendationId', 'spotId', 'type', 'utcHour'].sort());
  });
});

describe('recommendation -> attribution: negative cases', () => {
  beforeEach(() => {
    resetAttributionStore();
  });

  test('an arrival at spot B, which was never recommended, does not attribute', () => {
    recordShownRecommendation(TONIGHT_BEST_SPOT_RECOMMENDATION_ID, [SPOT_A.id], T0);

    const arrivalAt = T0 + minutes(30);
    const sample: PresenceSample = { lat: SPOT_B.lat, lon: SPOT_B.lon, timestampMs: arrivalAt };
    const { intents } = advancePresence(INITIAL_PRESENCE_STATE, sample, GEOFENCES, DEFAULT_PRESENCE_CONFIG);
    assert.deepEqual(intents, [{ type: 'spot_presence', spotId: SPOT_B.id, utcHour: new Date(arrivalAt).getUTCHours() }]);

    const attributed = attributeArrival(SPOT_B.id, arrivalAt);
    assert.equal(attributed, null);
  });

  test('an arrival more than 12 hours after showing does not attribute', () => {
    recordShownRecommendation(TONIGHT_BEST_SPOT_RECOMMENDATION_ID, [SPOT_A.id], T0);

    const tooLate = T0 + hours(12) + minutes(1);
    const attributed = attributeArrival(SPOT_A.id, tooLate);
    assert.equal(attributed, null);
  });

  test('a second arrival at the same recommended spot does not attribute again (dedupe)', () => {
    recordShownRecommendation(TONIGHT_BEST_SPOT_RECOMMENDATION_ID, [SPOT_A.id], T0);

    const firstArrival = T0 + minutes(30);
    const first = attributeArrival(SPOT_A.id, firstArrival);
    assert.notEqual(first, null);

    const secondArrival = T0 + hours(2);
    const second = attributeArrival(SPOT_A.id, secondArrival);
    assert.equal(second, null);
  });
});
