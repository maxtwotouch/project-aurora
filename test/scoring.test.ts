// Tests for src/scoring/score.ts -- the frontend's direct-source scoring
// path (mirrors backend/src/scoring.ts's computeScore/dress-threshold logic
// by design; see score.ts's header comment on dressLevelFromColdScore).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { computeScore, dressLevelFromColdScore, rankSpots } from '../src/scoring/score.js';
import type { HourlyForecast, Spot } from '../src/types/index.js';

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'test-spot',
    name: 'Test Spot',
    lat: 0,
    lon: 0,
    distanceKm: 0,
    lightPollution: 0,
    horizon: 'north',
    description: 'synthetic spot for tests',
    ...overrides
  };
}

function makeHour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    time: '2026-07-16T00:00:00.000Z',
    cloudCover: 0,
    temperature: 0,
    windSpeed: 0,
    ...overrides
  };
}

function hoursFrom(cloudCovers: number[], startHour = 0): HourlyForecast[] {
  return cloudCovers.map((cloudCover, index) =>
    makeHour({
      time: `2026-07-16T${String(startHour + index).padStart(2, '0')}:00:00.000Z`,
      cloudCover
    })
  );
}

describe('computeScore: representative inputs', () => {
  test('clear sky + high KP + short drive + low light pollution clamps to 100', () => {
    // cloudFactor=100, kpFactor=135 -> raw = 0.7*100 + 0.3*135 - 0 - 5 = 105.5, clamped to 100
    assert.equal(computeScore(0, 9, 10, 1), 100);
  });

  test('fully overcast + zero KP clamps to 0', () => {
    // cloudFactor=0, kpFactor=0 -> raw = -15 (light penalty only), clamped to 0
    assert.equal(computeScore(100, 0, 10, 3), 0);
  });

  test('a mid-range input produces the exact expected weighted score (no clamping)', () => {
    // cloudFactor=50, kpFactor=45 -> 0.7*50 + 0.3*45 - 0 - 10 = 35 + 13.5 - 10 = 38.5
    assert.equal(computeScore(50, 3, 10, 2), 38.5);
  });

  test('light pollution is a linear per-unit penalty (5 points per unit)', () => {
    const low = computeScore(50, 5, 10, 1);
    const high = computeScore(50, 5, 10, 3);
    assert.equal(low - high, 10);
  });

  test('drives under the 120-minute threshold incur no distance penalty', () => {
    // 100km * 1.15 = 115 minutes, under the 120-minute cutoff
    assert.equal(computeScore(30, 5, 0, 1), computeScore(30, 5, 100, 1));
  });

  test('drives over the 120-minute threshold are penalized proportionally to the excess', () => {
    const near = computeScore(30, 5, 10, 1);
    const far = computeScore(30, 5, 200, 1);
    // estimatedDriveMinutes = 200*1.15=230; penalty=(230-120)*0.35=38.5
    assert.ok(Math.abs(near - far - 38.5) < 1e-9, `expected penalty ~38.5, got ${near - far}`);
  });
});

describe('dressLevelFromColdScore: exact threshold boundaries', () => {
  test('coldScore 100 (well above the arctic threshold) is arctic', () => {
    assert.equal(dressLevelFromColdScore(100), 'arctic');
  });

  test('coldScore exactly 80 is arctic (>= is inclusive)', () => {
    assert.equal(dressLevelFromColdScore(80), 'arctic');
  });

  test('coldScore 79 (just under the arctic threshold) is veryCold', () => {
    assert.equal(dressLevelFromColdScore(79), 'veryCold');
  });

  test('coldScore exactly 60 is veryCold (>= is inclusive)', () => {
    assert.equal(dressLevelFromColdScore(60), 'veryCold');
  });

  test('coldScore 59 (just under the veryCold threshold) is cold', () => {
    assert.equal(dressLevelFromColdScore(59), 'cold');
  });

  test('coldScore exactly 40 is cold (>= is inclusive)', () => {
    assert.equal(dressLevelFromColdScore(40), 'cold');
  });

  test('coldScore 39 (just under the cold threshold) is cool', () => {
    assert.equal(dressLevelFromColdScore(39), 'cool');
  });

  test('coldScore 0 is cool', () => {
    assert.equal(dressLevelFromColdScore(0), 'cool');
  });
});

describe('rankSpots: ordering', () => {
  test('orders spots by descending score and returns one entry per input spot', () => {
    const forecast = hoursFrom([20, 20, 20]);
    const kpByHour = [5, 5, 5];
    const spots = [
      makeSpot({ id: 'far-and-lit', distanceKm: 300, lightPollution: 5 }),
      makeSpot({ id: 'near-and-dark', distanceKm: 0, lightPollution: 0 }),
      makeSpot({ id: 'middle', distanceKm: 50, lightPollution: 2 })
    ];
    const forecastsBySpotId = Object.fromEntries(spots.map((spot) => [spot.id, forecast]));

    const rankings = rankSpots(spots, forecastsBySpotId, kpByHour);

    assert.equal(rankings.length, spots.length);
    assert.deepEqual(
      rankings.map((r) => r.spotId),
      ['near-and-dark', 'middle', 'far-and-lit']
    );
    for (let i = 1; i < rankings.length; i += 1) {
      assert.ok(rankings[i - 1].score >= rankings[i].score);
    }
  });

  test('a spot with a heavily-overcast best hour is cloud-gated to a low score and "worse" trend, ' +
    'still ranked below clearer spots', () => {
    const clearForecast = hoursFrom([20, 20, 20]);
    const overcastForecast = hoursFrom([90, 90, 90]);
    const spots = [makeSpot({ id: 'overcast' }), makeSpot({ id: 'clear' })];
    const forecastsBySpotId = {
      overcast: overcastForecast,
      clear: clearForecast
    };

    const rankings = rankSpots(spots, forecastsBySpotId, [9, 9, 9]);

    assert.deepEqual(
      rankings.map((r) => r.spotId),
      ['clear', 'overcast']
    );
    const overcastResult = rankings.find((r) => r.spotId === 'overcast')!;
    assert.ok(overcastResult.score <= 20);
    assert.equal(overcastResult.trend, 'worse');
  });

  test('a spot with no forecast entry (missing key) is scored from an empty forecast array without throwing', () => {
    const spot = makeSpot({ id: 'no-data' });
    const rankings = rankSpots([spot], {}, [5]);

    assert.equal(rankings.length, 1);
    assert.equal(rankings[0].spotId, 'no-data');
    assert.equal(rankings[0].hourlyScores.length, 0);
  });
});
