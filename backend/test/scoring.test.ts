import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { computeScore, rankSpots } from '../src/scoring.js';
import type { HourlyForecast, Spot } from '../src/types.js';

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

describe('computeScore', () => {
  test('clear sky + high KP + short drive + low light pollution yields a high score, clamped at 100', () => {
    // cloudFactor=100, kpFactor=135 -> raw = 0.7*100 + 0.3*135 - 0 - 5 = 105.5, clamped to 100
    const score = computeScore(0, 9, 10, 1);
    assert.equal(score, 100);
  });

  test('overcast sky + zero KP yields a low score, clamped at 0', () => {
    // cloudFactor=0, kpFactor=0 -> raw = -15 (light penalty only), clamped to 0
    const score = computeScore(100, 0, 10, 3);
    assert.equal(score, 0);
  });

  test('lightPollution difference of 2 produces exactly a 10-point score gap (no clamping)', () => {
    const low = computeScore(50, 5, 10, 1);
    const high = computeScore(50, 5, 10, 3);
    assert.equal(low - high, 10);
    assert.equal(low, 52.5);
    assert.equal(high, 42.5);
  });

  test('long drive distance penalizes the score relative to a nearby spot with identical weather/KP', () => {
    const near = computeScore(30, 5, 10, 1);
    const far = computeScore(30, 5, 200, 1);
    assert.ok(far < near, `expected far (${far}) < near (${near})`);
    // estimatedDriveMinutes = 200*1.15=230; penalty=(230-120)*0.35=38.5
    assert.ok(Math.abs(near - far - 38.5) < 1e-9, `expected penalty ~38.5, got ${near - far}`);
  });

  test('drive distances under the 120-minute threshold incur no distance penalty', () => {
    // 100km * 1.15 = 115 minutes, under the 120-minute threshold
    const a = computeScore(30, 5, 0, 1);
    const b = computeScore(30, 5, 100, 1);
    assert.equal(a, b);
  });

  test('score is clamped to 0 for extreme unfavorable inputs (over-range cloud cover)', () => {
    const score = computeScore(150, 0, 500, 5);
    assert.equal(score, 0);
  });

  test('score is clamped to 100 for extreme favorable inputs (over-range KP)', () => {
    const score = computeScore(0, 20, 0, 0);
    assert.equal(score, 100);
  });
});

describe('rankSpots: best-3-hour-window selection', () => {
  test('picks the 3-hour window with the highest average score from a known hourly series', () => {
    const spot = makeSpot();
    // constant KP isolates the effect of cloud cover on the window choice
    const kpByHour = [3, 3, 3, 3, 3];
    const forecast = hoursFrom([80, 80, 20, 20, 20]);

    const [result] = rankSpots([spot], { [spot.id]: forecast }, kpByHour);

    assert.equal(result.bestWindowStart, forecast[2].time);
    assert.equal(result.bestWindowEnd, forecast[4].time);
    assert.equal(result.cloudCoverAtBestHour, 20);
  });

  test('within a tied 3-hour window, the first (earliest) hour with the max score is reported as the best hour', () => {
    const spot = makeSpot();
    const kpByHour = [3, 3, 3, 3, 3];
    // hours 2 and 3 tie for the highest per-hour score (cloud=20); hour 4 is slightly worse (cloud=30)
    const forecast = hoursFrom([80, 80, 20, 20, 30]).map((hour, index) => ({
      ...hour,
      temperature: index === 2 ? -1 : index === 3 ? -9 : 0
    }));

    const [result] = rankSpots([spot], { [spot.id]: forecast }, kpByHour);

    assert.equal(result.bestWindowStart, forecast[2].time);
    assert.equal(result.bestWindowEnd, forecast[4].time);
    // reduce() uses a strict `>` comparison, so the earlier tied hour (index 2) wins over index 3
    assert.equal(result.temperatureAtBestHour, -1);
  });

  test('with fewer than 3 hours of data (1 hour), the single hour is used as both window bounds', () => {
    const spot = makeSpot();
    const forecast = hoursFrom([40]);

    const [result] = rankSpots([spot], { [spot.id]: forecast }, [4]);

    assert.equal(result.bestWindowStart, forecast[0].time);
    assert.equal(result.bestWindowEnd, forecast[0].time);
  });

  test('with fewer than 3 hours of data (2 hours), the actual best-scoring hour is reported' +
    ' (fixed: previously always reported hour 0 even when a later hour scored higher)', () => {
    const spot = makeSpot();
    // hour0 is heavily overcast (low score), hour1 is clear (higher score)
    const forecast = hoursFrom([90, 10]);

    const [result] = rankSpots([spot], { [spot.id]: forecast }, [3, 3]);

    // window bounds still span all available hours (there's no full 3-hour window to slide)
    assert.equal(result.bestWindowStart, forecast[0].time);
    assert.equal(result.bestWindowEnd, forecast[1].time);
    // cloudCoverAtBestHour now reflects the actually-higher-scoring hour[1] (10), not hour[0] (90)
    assert.equal(result.cloudCoverAtBestHour, 10);
  });
});

describe('rankSpots: cloud gate', () => {
  test('a best hour with >80% cloud cover is capped at score 20 and marked as worse trend', () => {
    const spot = makeSpot();
    const forecast = hoursFrom([90, 90, 90]);
    const [result] = rankSpots([spot], { [spot.id]: forecast }, [9, 9, 9]);

    assert.equal(result.cloudCoverAtBestHour, 90);
    assert.ok(result.score <= 20);
    assert.equal(result.trend, 'worse');
  });

  test('a best hour at exactly 80% cloud cover is not gated', () => {
    const spot = makeSpot();
    const forecast = hoursFrom([80, 80, 80]);
    const [result] = rankSpots([spot], { [spot.id]: forecast }, [9, 9, 9]);

    assert.equal(result.cloudCoverAtBestHour, 80);
    // ungated score for cloud=80, kp=9: 0.7*20 + 0.3*135 = 14 + 40.5 = 54.5 -> rounds to 55
    assert.equal(result.score, 55);
  });
});

describe('rankSpots: ordering and count', () => {
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

  test('a spot with no forecast entry (missing key) is scored from an empty forecast array without throwing', () => {
    const spot = makeSpot({ id: 'no-data' });
    const rankings = rankSpots([spot], {}, [5]);

    assert.equal(rankings.length, 1);
    assert.equal(rankings[0].spotId, 'no-data');
    assert.equal(rankings[0].hourlyScores.length, 0);
  });
});
