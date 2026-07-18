import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { computeScore, rankSpots } from '../src/scoring.js';
import { darknessFactor, solarElevationDeg } from '../src/solar.js';
import type { HourlyForecast, Spot } from '../src/types.js';

// Real Tromso coordinates, reused across the darkness-aware tests below
// (as opposed to makeSpot()'s default lat/lon 0,0, which is used for the
// pre-existing cloud/KP/distance tests -- see the note above hoursFrom()).
const TROMSO = { lat: 69.6492, lon: 18.9553 };

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

// NOTE on darkness and makeSpot()'s default lat=0, lon=0: with the
// darkness-aware scoring added below, every hourly score is now gated by
// solar elevation at the *spot's own* coordinates. All the pre-existing
// tests in this file use hoursFrom()'s default startHour=0, i.e. times
// 00:00-04:00 UTC -- which, at the equator (lon 0), is deep solar night
// (elevation well past -11deg) throughout mid-July, so darknessFactor is 1
// there and those tests are unaffected. The darkness-specific tests below
// use real Tromso coordinates instead, where darkness is seasonal.
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

describe('solarElevationDeg: sanity checks against known Tromso solar behavior', () => {
  test('July 16 01:00 local (midnight-sun season) puts the sun above the darkness threshold', () => {
    // 2026-07-16T01:00 local Oslo/Tromso time (CEST, UTC+2) = 2026-07-15T23:00:00Z.
    const elevation = solarElevationDeg(new Date('2026-07-15T23:00:00Z').getTime(), TROMSO.lat, TROMSO.lon);
    assert.ok(elevation > -6, `expected elevation > -6, got ${elevation}`);
    assert.equal(darknessFactor(elevation), 0);
  });

  test('Dec 21 13:00 local (deep polar night) never clears the horizon, even near solar noon', () => {
    // 2026-12-21T13:00 local Oslo/Tromso time (CET, UTC+1) = 2026-12-21T12:00:00Z,
    // close to solar noon in Tromso in December.
    const elevation = solarElevationDeg(new Date('2026-12-21T12:00:00Z').getTime(), TROMSO.lat, TROMSO.lon);
    assert.ok(elevation < 0, `expected the sun below the horizon even at midday, got elevation ${elevation}`);
  });
});

describe('darknessFactor: boundary behavior', () => {
  test('elevation exactly -6 (civil twilight) is 0 (not yet dark enough)', () => {
    assert.equal(darknessFactor(-6), 0);
  });

  test('elevation above -6 is 0', () => {
    assert.equal(darknessFactor(0), 0);
    assert.equal(darknessFactor(-5.999), 0);
  });

  test('elevation exactly -11 (dark enough) is 1', () => {
    assert.equal(darknessFactor(-11), 1);
  });

  test('elevation below -11 stays clamped at 1', () => {
    assert.equal(darknessFactor(-45), 1);
  });

  test('the midpoint -8.5 ramps linearly to exactly 0.5', () => {
    assert.equal(darknessFactor(-8.5), 0.5);
  });
});

describe('rankSpots: darkness gating (real Tromso coordinates)', () => {
  test('a mid-July Tromso night (midnight sun) collapses every hourly score to 0', () => {
    const spot = makeSpot({ id: 'tromso', ...TROMSO });
    // An 18:00 -> 06:00 span across the night of July 16-17, clear skies and
    // high KP throughout -- if darkness weren't applied, this would score
    // very highly. With darkness applied, it must be all zeros: the sun
    // never gets low enough tonight in July at this latitude.
    const times = [
      '2026-07-16T16:00:00.000Z',
      '2026-07-16T18:00:00.000Z',
      '2026-07-16T20:00:00.000Z',
      '2026-07-16T22:00:00.000Z',
      '2026-07-17T00:00:00.000Z',
      '2026-07-17T02:00:00.000Z',
      '2026-07-17T04:00:00.000Z'
    ];
    const forecast: HourlyForecast[] = times.map((time) => ({ time, cloudCover: 0, temperature: 5, windSpeed: 0 }));
    const kpByHour = times.map(() => 9);

    const [result] = rankSpots([spot], { [spot.id]: forecast }, kpByHour);

    assert.ok(
      result.hourlyScores.every((hour) => hour.score === 0),
      `expected every hourly score to be 0, got ${JSON.stringify(result.hourlyScores.map((h) => h.score))}`
    );
    assert.equal(result.score, 0);
  });

  test('a mid-August Tromso night constrains the best window to the genuinely dark hours', () => {
    const spot = makeSpot({ id: 'tromso', ...TROMSO });
    // Local 18:00 Aug 20 -> 08:00 Aug 21 (CEST, UTC+2), one entry per hour.
    // Cloud cover and KP are held constant across every hour, isolating the
    // effect of the darkness gate on window selection: local 00:00-02:00
    // (indices 6-8) is meaningfully dark (darknessFactor 0.24-0.43), with
    // 23:00 (index 5) just barely past the -6deg twilight threshold (a
    // near-zero but technically non-zero factor -- see the precise values
    // asserted below) and every other hour exactly 0. Indices 6-8 still form
    // the clear best-average 3-hour window either way.
    const times = [
      '2026-08-20T16:00:00.000Z', // 18:00 local
      '2026-08-20T17:00:00.000Z', // 19:00 local
      '2026-08-20T18:00:00.000Z', // 20:00 local
      '2026-08-20T19:00:00.000Z', // 21:00 local
      '2026-08-20T20:00:00.000Z', // 22:00 local
      '2026-08-20T21:00:00.000Z', // 23:00 local -- just past -6deg, ~0.003
      '2026-08-20T22:00:00.000Z', // 00:00 local (Aug 21) -- dark
      '2026-08-20T23:00:00.000Z', // 01:00 local (Aug 21) -- dark
      '2026-08-21T00:00:00.000Z', // 02:00 local (Aug 21) -- dark
      '2026-08-21T01:00:00.000Z', // 03:00 local
      '2026-08-21T02:00:00.000Z', // 04:00 local
      '2026-08-21T03:00:00.000Z', // 05:00 local
      '2026-08-21T04:00:00.000Z', // 06:00 local
      '2026-08-21T05:00:00.000Z', // 07:00 local
      '2026-08-21T06:00:00.000Z' // 08:00 local
    ];
    const forecast: HourlyForecast[] = times.map((time) => ({ time, cloudCover: 20, temperature: 2, windSpeed: 1 }));
    const kpByHour = times.map(() => 5);

    // Sanity: confirm the expected dark/bright split directly against the
    // pure solar function before asserting on the higher-level window pick.
    const elevations = times.map((time) => solarElevationDeg(new Date(time).getTime(), TROMSO.lat, TROMSO.lon));
    const factors = elevations.map(darknessFactor);
    assert.deepEqual(
      factors.map((f) => f > 0.01),
      [false, false, false, false, false, false, true, true, true, false, false, false, false, false, false]
    );
    assert.ok(factors[6] > factors[5] && factors[7] > factors[6], 'expected 00:00-01:00 local to be the deepening dark edge');

    const [result] = rankSpots([spot], { [spot.id]: forecast }, kpByHour);

    assert.equal(result.bestWindowStart, times[6]);
    assert.equal(result.bestWindowEnd, times[8]);
    assert.ok(result.score > 0, `expected a non-zero score within the dark window, got ${result.score}`);
  });
});
