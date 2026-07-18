// Tests for src/scoring/score.ts -- the frontend's direct-source scoring
// path (mirrors backend/src/scoring.ts's computeScore/dress-threshold logic
// by design; see score.ts's header comment on dressLevelFromColdScore).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { computeScore, dressLevelFromColdScore, rankSpots } from '../src/scoring/score.js';
import { darknessFactor, solarElevationDeg } from '../src/scoring/solar.js';
import type { HourlyForecast, Spot } from '../src/types/index.js';

// Real Tromso coordinates, reused across the darkness-aware tests below (as
// opposed to makeSpot()'s default lat/lon 0,0 -- see the note above
// hoursFrom()).
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

  // Cross-check constants: these are the exact values backend/test/scoring.test.ts
  // asserts (with looser bounds) against backend/src/solar.ts's identical
  // implementation for the same two instants/coordinates. Pinning the precise
  // numbers here (with a tight tolerance) guards against the two
  // independently-maintained copies (this file's src/scoring/solar.ts and
  // backend/src/solar.ts) drifting apart silently.
  test('matches the backend copy\'s solarElevationDeg output to within 1e-9 degrees for two fixed instants', () => {
    const july = solarElevationDeg(new Date('2026-07-15T23:00:00Z').getTime(), TROMSO.lat, TROMSO.lon);
    const december = solarElevationDeg(new Date('2026-12-21T12:00:00Z').getTime(), TROMSO.lat, TROMSO.lon);

    assert.ok(Math.abs(july - 1.0644436508697908) < 1e-9, `expected ~1.0644436508697908, got ${july}`);
    assert.ok(Math.abs(december - -4.130399248019373) < 1e-9, `expected ~-4.130399248019373, got ${december}`);
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

  test('the midpoint -8.5 ramps linearly to exactly 0.5 (cross-check constant, matches backend)', () => {
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
    // near-zero but technically non-zero factor) and every other hour
    // exactly 0. Indices 6-8 still form the clear best-average 3-hour
    // window either way. Mirrors backend/test/scoring.test.ts's identical
    // scenario.
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

    const elevations = times.map((time) => solarElevationDeg(new Date(time).getTime(), TROMSO.lat, TROMSO.lon));
    const factors = elevations.map(darknessFactor);
    assert.deepEqual(
      factors.map((f) => f > 0.01),
      [false, false, false, false, false, false, true, true, true, false, false, false, false, false, false]
    );

    const [result] = rankSpots([spot], { [spot.id]: forecast }, kpByHour);

    assert.equal(result.bestWindowStart, times[6]);
    assert.equal(result.bestWindowEnd, times[8]);
    assert.ok(result.score > 0, `expected a non-zero score within the dark window, got ${result.score}`);
  });
});
