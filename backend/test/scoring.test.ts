import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { computeMoonPenaltyPoints, computeScore, deriveTrend, rankSpots } from '../src/scoring.js';
import { moonAltitudeDeg, moonIlluminatedFraction } from '../src/moon.js';
import { darknessFactor, solarElevationDeg } from '../src/solar.js';
import type { HourlyForecast, Spot, SpotHourlyScore } from '../src/types.js';

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
  test('clear sky + high KP + short drive + low light pollution yields a high score (no longer clamped at 100)', () => {
    // cloudFactor=100, kpFactor=kpAuroraFactor(9)=110 (latitude-aware KP curve --
    // see docs/scoring-model.md, "Latitude-aware KP curve") ->
    // raw = 0.7*100 + 0.3*110 - 0 - 5 = 70 + 33 - 5 = 98. Unlike the old flat
    // kp*15 curve (kpFactor=135 at kp=9, which clamped this fixture to 100),
    // the new curve's gentle Kp 6-9 rolloff means even kp=9 no longer maxes
    // out the score on its own.
    const score = computeScore(0, 9, 10, 1);
    assert.equal(score, 98);
  });

  test('overcast sky + zero KP yields a low score, clamped at 0', () => {
    // cloudFactor=0, kpFactor=kpAuroraFactor(0)=20 -> raw = 0.3*20 - 15 = 6 - 15 = -9, clamped to 0
    const score = computeScore(100, 0, 10, 3);
    assert.equal(score, 0);
  });

  test('lightPollution difference of 2 produces exactly a 10-point score gap (no clamping)', () => {
    // kpFactor=kpAuroraFactor(5)=127.5 (interpolated between the kp=4/125 and
    // kp=6/130 curve breakpoints -- see docs/scoring-model.md)
    const low = computeScore(50, 5, 10, 1);
    const high = computeScore(50, 5, 10, 3);
    assert.equal(low - high, 10);
    assert.equal(low, 68.25);
    assert.equal(high, 58.25);
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

// kpAuroraFactor itself isn't exported (module-private in scoring.ts), but
// computeScore(cloudCover=100, kp, distanceKm=0, lightPollution=0) isolates
// it exactly and without clamping: cloudFactor = 100 - 100 = 0, distance and
// light penalties are both 0, so score = 0.3 * kpAuroraFactor(kp), and since
// kpAuroraFactor's whole range [20, 130] keeps 0.3*kpFactor within [6, 39] --
// comfortably inside computeScore's 0-100 clamp -- the clamp never engages
// here. score / 0.3 == kpAuroraFactor(kp) exactly.
describe('kpAuroraFactor: latitude-aware Kp curve (isolated via computeScore(100, kp, 0, 0))', () => {
  test('exact values at every curve breakpoint (0->20, 2->80, 4->125, 6->130, 9->110)', () => {
    const breakpoints: Array<[kp: number, points: number]> = [
      [0, 20],
      [2, 80],
      [4, 125],
      [6, 130],
      [9, 110]
    ];
    for (const [kp, points] of breakpoints) {
      const score = computeScore(100, kp, 0, 0);
      assert.ok(
        Math.abs(score - 0.3 * points) < 1e-9,
        `kp=${kp}: expected kpAuroraFactor=${points} (score ${0.3 * points}), got score ${score}`
      );
    }
  });

  test('midpoint interpolation between breakpoints (kp=1, kp=3, kp=7.5)', () => {
    // kp=1: midway between (0,20) and (2,80) -> 50
    assert.ok(Math.abs(computeScore(100, 1, 0, 0) - 0.3 * 50) < 1e-9);
    // kp=3: midway between (2,80) and (4,125) -> 102.5
    assert.ok(Math.abs(computeScore(100, 3, 0, 0) - 0.3 * 102.5) < 1e-9);
    // kp=7.5: midway between (6,130) and (9,110) -> 120
    assert.ok(Math.abs(computeScore(100, 7.5, 0, 0) - 0.3 * 120) < 1e-9);
  });

  test('monotonically rises across Kp 0-6 and monotonically declines across Kp 6-9', () => {
    const rising = [0, 1, 2, 3, 4, 5, 6].map((kp) => computeScore(100, kp, 0, 0));
    for (let i = 1; i < rising.length; i += 1) {
      assert.ok(rising[i] > rising[i - 1], `expected strictly increasing at index ${i}, got ${JSON.stringify(rising)}`);
    }

    const falling = [6, 7, 7.5, 8, 9].map((kp) => computeScore(100, kp, 0, 0));
    for (let i = 1; i < falling.length; i += 1) {
      assert.ok(falling[i] < falling[i - 1], `expected strictly decreasing at index ${i}, got ${JSON.stringify(falling)}`);
    }
  });

  test('Kp below 0 clamps to kpAuroraFactor(0); Kp above 9 clamps to kpAuroraFactor(9)', () => {
    assert.equal(computeScore(100, -5, 0, 0), computeScore(100, 0, 0, 0));
    assert.equal(computeScore(100, 15, 0, 0), computeScore(100, 9, 0, 0));
    assert.equal(computeScore(100, -0.0001, 0, 0), computeScore(100, 0, 0, 0));
    assert.equal(computeScore(100, 9.0001, 0, 0), computeScore(100, 9, 0, 0));
  });

  // Cross-check: the same computeScore(100, kp, 0, 0) isolation and the same
  // pinned expected values are asserted against the frontend twin's
  // src/scoring/score.ts in the root test/scoring.test.ts, to the same 1e-9
  // tolerance -- extends the solarElevationDeg/darknessFactor cross-check
  // pattern above to kpAuroraFactor.
  test('matches the frontend twin\'s kpAuroraFactor to within 1e-9 at every breakpoint plus the three interpolated points', () => {
    const pinned: Array<[kp: number, expectedScore: number]> = [
      [0, 6],
      [2, 24],
      [4, 37.5],
      [6, 39],
      [9, 33],
      [1, 15],
      [3, 30.75],
      [7.5, 36]
    ];
    for (const [kp, expected] of pinned) {
      const score = computeScore(100, kp, 0, 0);
      assert.ok(Math.abs(score - expected) < 1e-9, `kp=${kp}: expected ${expected}, got ${score}`);
    }
  });
});

// computeEffectiveCloudCover itself isn't exported either; computeScore(cloudCover,
// kp=0, distanceKm=0, lightPollution=0, cloudLayers) isolates it: with kp=0,
// kpFactor=kpAuroraFactor(0)=20 (a fixed constant, unaffected by clouds), so
// score = 0.7*(100-effective) + 0.3*20 - 0 - 0 = 76 - 0.7*effective, which
// never clamps across any effective value in 0-100 (score stays within [6,76]).
describe('computeEffectiveCloudCover: layered clouds (isolated via computeScore(cloudCover, 0, 0, 0, layers))', () => {
  test('80% high-only cloud is only lightly blocking (thin cirrus) -> effective 32', () => {
    // transmission: low=1, medium=1, high=1-0.4*0.8=0.68 -> total=0.68 -> effective=100*(1-0.68)=32
    // score = 76 - 0.7*32 = 53.6
    const score = computeScore(80, 0, 0, 0, { low: 0, medium: 0, high: 80 });
    assert.ok(Math.abs(score - 53.6) < 1e-9, `expected ~53.6, got ${score}`);
  });

  test('80% low-only cloud is fully opaque (dense low cloud) -> effective 80, matching the plain aggregate', () => {
    // transmission: low=1-1.0*0.8=0.2, medium=1, high=1 -> total=0.2 -> effective=100*(1-0.2)=80
    // score = 76 - 0.7*80 = 20
    const score = computeScore(80, 0, 0, 0, { low: 80, medium: 0, high: 0 });
    assert.equal(score, 20);
  });

  test('mixed layers (low=30, medium=40, high=50): hand-computed multiplied transmission', () => {
    // low transmission=0.7; medium transmission=1-0.75*0.4=0.7; high transmission=1-0.4*0.5=0.8
    // total = 0.7*0.7*0.8 = 0.392 -> effective = 100*(1-0.392) = 60.8
    // score = 76 - 0.7*60.8 = 33.44
    const score = computeScore(80, 0, 0, 0, { low: 30, medium: 40, high: 50 });
    assert.ok(Math.abs(score - 33.44) < 1e-9, `expected ~33.44, got ${score}`);
  });

  test('any one layer missing falls back to the plain aggregate cloudCover, ignoring the other two layers', () => {
    const withPartialLayers = computeScore(45, 0, 0, 0, { low: 50, medium: undefined, high: 30 });
    const plainAggregate = computeScore(45, 0, 0, 0);
    assert.equal(withPartialLayers, plainAggregate);
  });

  test('no cloudLayers argument at all falls back to the plain aggregate cloudCover', () => {
    assert.equal(computeScore(45, 0, 0, 0, undefined), computeScore(45, 0, 0, 0));
  });

  test('all-zero layers produce 0% effective cloud cover (full transmission)', () => {
    // score = 76 - 0.7*0 = 76
    const score = computeScore(0, 0, 0, 0, { low: 0, medium: 0, high: 0 });
    assert.equal(score, 76);
  });

  test('all-100 layers produce 100% effective cloud cover (the implementation\'s ceiling) -- ' +
    '100% low cloud alone forces zero transmission regardless of medium/high, since transmissions multiply', () => {
    // score = 76 - 0.7*100 = 6
    const score = computeScore(100, 0, 0, 0, { low: 100, medium: 100, high: 100 });
    assert.equal(score, 6);
  });

  // Cross-check: the same fixture inputs and pinned expected outputs are
  // asserted against the frontend twin's src/scoring/score.ts in the root
  // test/scoring.test.ts, to the same 1e-9 tolerance.
  test('matches the frontend twin\'s computeEffectiveCloudCover to within 1e-9 across the fixtures above', () => {
    assert.ok(Math.abs(computeScore(80, 0, 0, 0, { low: 0, medium: 0, high: 80 }) - 53.6) < 1e-9);
    assert.equal(computeScore(80, 0, 0, 0, { low: 80, medium: 0, high: 0 }), 20);
    assert.ok(Math.abs(computeScore(80, 0, 0, 0, { low: 30, medium: 40, high: 50 }) - 33.44) < 1e-9);
    assert.equal(computeScore(0, 0, 0, 0, { low: 0, medium: 0, high: 0 }), 76);
    assert.equal(computeScore(100, 0, 0, 0, { low: 100, medium: 100, high: 100 }), 6);
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

// Minimal SpotHourlyScore fixtures for deriveTrend -- only `.score` is read
// by deriveTrend, so the other fields are dummy/unused placeholders.
function trendHours(scores: number[]): SpotHourlyScore[] {
  return scores.map((score, index) => ({
    time: `2026-07-16T${String(index).padStart(2, '0')}:00:00.000Z`,
    score,
    cloudCover: 0,
    temperature: 0,
    windSpeed: 0
  }));
}

describe('deriveTrend: trend semantics (headline score = best hour, not hourlyScores[0])', () => {
  test('good_now: the best hour is now (index 0) and clears the 55 "good" bar', () => {
    assert.equal(deriveTrend(trendHours([60, 40, 30])), 'good_now');
  });

  test('good_now: the best hour is imminent (index 1) and clears the 55 "good" bar', () => {
    assert.equal(deriveTrend(trendHours([50, 60, 30, 20])), 'good_now');
  });

  test(
    'regression: current=55 (index 0) but the true best hour is 80 at index 5 -- must NOT be ' +
      "'good_now' (the headline score of 80 is five hours away, not now), must be 'improving'",
    () => {
      const scores = [55, 50, 45, 60, 70, 80];
      assert.equal(deriveTrend(trendHours(scores)), 'improving');
    }
  );

  test('improving: the best hour is later (index >= 2) and at least 8 points better than now', () => {
    // current=40 (index 0), best=48 (index 2) -> improvement of exactly 8, and >= DECENT_SCORE(40)
    assert.equal(deriveTrend(trendHours([40, 30, 48])), 'improving');
  });

  test('worse: nothing decent is coming (best score stays under the 40 "decent" bar)', () => {
    assert.equal(deriveTrend(trendHours([20, 25, 30, 35])), 'worse');
  });

  test('worse: best hour is imminent (index 1) but does not clear the 55 "good" bar', () => {
    // Imminent alone isn't enough -- a mediocre "now" score still isn't good_now.
    assert.equal(deriveTrend(trendHours([40, 50, 20])), 'worse');
  });

  test('worse: best hour is later but the gain over now is below the +8 improvement bar', () => {
    // current=45 (index 0), best=50 (index 3): only +5, and later than index 1 -- not a
    // meaningful-enough improvement to call out, even though 50 clears the decent bar.
    assert.equal(deriveTrend(trendHours([45, 44, 46, 50])), 'worse');
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
    // ungated score for cloud=80, kp=9: 0.7*20 + 0.3*kpAuroraFactor(9) = 14 + 0.3*110 = 14 + 33 = 47
    // (kp=9 also fully damps the moon penalty to 0 -- see KP_MOON_IRRELEVANT_AT
    // in scoring.ts -- so this fixture is unaffected by the moon factor.)
    assert.equal(result.score, 47);
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

  // Cross-check constants: the exact same two float constants (to the same
  // 1e-9 tolerance) are pinned in the frontend twin's root test/scoring.test.ts
  // against src/scoring/solar.ts's independently-maintained copy of this
  // exact math, for the same two instants/coordinates. Editing either
  // solar.ts twin without updating the other now breaks *that twin's own*
  // test suite, not just the other one's.
  test('matches the frontend copy\'s solarElevationDeg output to within 1e-9 degrees for two fixed instants', () => {
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

  // Cross-check constant: the same -8.5 -> 0.5 midpoint is pinned in the
  // frontend twin's root test/scoring.test.ts against
  // src/scoring/solar.ts's darknessFactor.
  test('the midpoint -8.5 ramps linearly to exactly 0.5 (cross-check constant, matches frontend)', () => {
    assert.equal(darknessFactor(-8.5), 0.5);
  });
});

// Real-world reference lunar phase times for Jan 2026, queried from the US
// Naval Observatory's Astronomical Applications API
// (https://aa.usno.navy.mil/api/moon/phases/date?date=2026-01-01&nump=5):
//   Full Moon:     2026-01-03 10:03 UTC (100% illuminated)
//   Last Quarter:  2026-01-10 15:48 UTC (~50% illuminated)
//   New Moon:      2026-01-18 19:52 UTC (0% illuminated)
//   First Quarter: 2026-01-26 04:47 UTC (~50% illuminated)
// Tolerances below are generous, matching moon.ts's documented ~1-2%
// synodic-approximation accuracy budget plus a margin for the exact
// phase-time-vs-instant offset.
describe('moonIlluminatedFraction: sanity vs real ephemeris (USNO phase times)', () => {
  test('full moon (2026-01-03 10:03 UTC): illuminated fraction is close to 1', () => {
    const fraction = moonIlluminatedFraction(new Date('2026-01-03T10:03:00.000Z').getTime());
    assert.ok(Math.abs(fraction - 1) < 0.05, `expected ~1 (full moon), got ${fraction}`);
  });

  test('new moon (2026-01-18 19:52 UTC): illuminated fraction is close to 0', () => {
    const fraction = moonIlluminatedFraction(new Date('2026-01-18T19:52:00.000Z').getTime());
    assert.ok(fraction < 0.05, `expected ~0 (new moon), got ${fraction}`);
  });

  test('last quarter (2026-01-10 15:48 UTC): illuminated fraction is close to half', () => {
    const fraction = moonIlluminatedFraction(new Date('2026-01-10T15:48:00.000Z').getTime());
    assert.ok(Math.abs(fraction - 0.5) < 0.1, `expected ~0.5 (last quarter), got ${fraction}`);
  });

  test('first quarter (2026-01-26 04:47 UTC): illuminated fraction is close to half', () => {
    const fraction = moonIlluminatedFraction(new Date('2026-01-26T04:47:00.000Z').getTime());
    assert.ok(Math.abs(fraction - 0.5) < 0.1, `expected ~0.5 (first quarter), got ${fraction}`);
  });
});

describe('moonAltitudeDeg: sanity for real Tromso cases (USNO rise/set/transit data)', () => {
  // https://aa.usno.navy.mil/api/rstt/oneday?date=2026-01-15&coords=69.6492,18.9553&tz=0
  // reports the Moon "continuously below the Horizon" for all of 2026-01-15
  // at Tromso (waning crescent, ~10% illuminated) -- picking instants spread
  // across that whole day is robust to moon.ts's documented ~1-2deg error
  // budget, unlike a near-horizon case would be.
  test('2026-01-15 (moon reported continuously below horizon all day at Tromso): altitude stays negative', () => {
    const times = ['2026-01-15T00:00:00.000Z', '2026-01-15T12:00:00.000Z', '2026-01-15T23:00:00.000Z'];
    for (const time of times) {
      const alt = moonAltitudeDeg(new Date(time).getTime(), TROMSO.lat, TROMSO.lon);
      assert.ok(alt < -5, `expected a comfortably-below-horizon altitude at ${time}, got ${alt}`);
    }
  });

  // https://aa.usno.navy.mil/api/rstt/oneday?date=2026-01-03&coords=69.6492,18.9553&tz=0
  // reports the Moon "continuously above the Horizon" all day (full moon,
  // upper transit 23:24 UTC) -- near that transit the Moon is well clear of
  // the horizon, again robust to the module's degree-or-two error budget.
  test('2026-01-03 near upper transit (moon reported continuously above horizon all day at Tromso): well above the horizon', () => {
    const alt = moonAltitudeDeg(new Date('2026-01-03T23:24:00.000Z').getTime(), TROMSO.lat, TROMSO.lon);
    assert.ok(alt > 20, `expected a comfortably-above-horizon altitude, got ${alt}`);
  });
});

describe('computeMoonPenaltyPoints: penalty shape', () => {
  test('altitude at or below the horizon is always 0, regardless of illumination/Kp', () => {
    assert.equal(computeMoonPenaltyPoints(1, 0, 0), 0);
    assert.equal(computeMoonPenaltyPoints(1, -1, 0), 0);
    assert.equal(computeMoonPenaltyPoints(1, -45, 9), 0);
  });

  test('illumination below the 0.5 ramp start is always 0, regardless of altitude/Kp', () => {
    assert.equal(computeMoonPenaltyPoints(0.5, 30, 0), 0);
    assert.equal(computeMoonPenaltyPoints(0.49, 30, 0), 0);
    assert.equal(computeMoonPenaltyPoints(0, 45, 0), 0);
  });

  test('damped to exactly 0 at Kp >= 7 (KP_MOON_IRRELEVANT_AT), even at full illumination/altitude', () => {
    assert.equal(computeMoonPenaltyPoints(1, 45, 7), 0);
    assert.equal(computeMoonPenaltyPoints(1, 45, 8), 0);
    assert.equal(computeMoonPenaltyPoints(1, 45, 9), 0);
  });

  test('capped at 15 (MOON_MAX_PENALTY_POINTS), never exceeded across a grid sweep, and the cap is reached', () => {
    const illuminations = [0, 0.3, 0.5, 0.6, 0.75, 0.9, 1];
    const altitudes = [-10, 0, 5, 15, 30, 45, 90];
    const kps = [0, 1, 3, 5, 6, 6.9, 7, 8, 9];

    let max = -Infinity;
    for (const illum of illuminations) {
      for (const alt of altitudes) {
        for (const kp of kps) {
          const penalty = computeMoonPenaltyPoints(illum, alt, kp);
          assert.ok(penalty >= 0, `penalty should never be negative: illum=${illum} alt=${alt} kp=${kp} -> ${penalty}`);
          assert.ok(penalty <= 15 + 1e-9, `penalty exceeded cap: illum=${illum} alt=${alt} kp=${kp} -> ${penalty}`);
          max = Math.max(max, penalty);
        }
      }
    }
    // full illumination, high altitude, kp=0 should actually reach the cap
    assert.ok(Math.abs(max - 15) < 1e-9, `expected the grid to reach the 15-point cap, got max ${max}`);
  });

  test('monotonically non-decreasing in illumination at a fixed altitude/Kp (strictly increasing here)', () => {
    const illuminations = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
    const penalties = illuminations.map((illum) => computeMoonPenaltyPoints(illum, 30, 2));
    for (let i = 1; i < penalties.length; i += 1) {
      assert.ok(penalties[i] >= penalties[i - 1], `expected non-decreasing, got ${JSON.stringify(penalties)}`);
    }
    assert.ok(penalties[penalties.length - 1] > penalties[0]);
  });
});

// Twin-drift guard for moon.ts: the same fixed timestamps and the same
// pinned float outputs (to 1e-9) are asserted against the frontend twin's
// src/scoring/moon.ts in the root test/scoring.test.ts -- extends the
// solarElevationDeg cross-check pattern above to backend/src/moon.ts vs
// src/scoring/moon.ts. Editing either moon.ts twin without updating the
// other now breaks *that twin's own* test suite, not just the other one's.
describe('Cross-check: moon.ts pinned outputs (matches frontend twin)', () => {
  test('moonIlluminatedFraction and moonAltitudeDeg match the frontend twin to within 1e-9 at fixed timestamps', () => {
    const fixtures: Array<{ time: string; illum: number; alt: number }> = [
      { time: '2026-01-03T10:03:00.000Z', illum: 0.999202016122652, alt: 7.3648672874543974 },
      { time: '2026-01-18T19:52:00.000Z', illum: 0.0016176434761858705, alt: -36.951566661406495 },
      { time: '2026-01-10T15:48:00.000Z', illum: 0.5434173764815082, alt: -30.265210533248556 },
      { time: '2026-01-26T04:47:00.000Z', illum: 0.5390081764588218, alt: -2.189435785175375 },
      { time: '2026-01-15T12:00:00.000Z', illum: 0.09527615143829854, alt: -15.936446006429419 },
      { time: '2026-01-03T23:24:00.000Z', illum: 0.9990440152950687, alt: 46.18276237489254 }
    ];

    for (const { time, illum, alt } of fixtures) {
      const ms = new Date(time).getTime();
      const gotIllum = moonIlluminatedFraction(ms);
      const gotAlt = moonAltitudeDeg(ms, TROMSO.lat, TROMSO.lon);
      assert.ok(Math.abs(gotIllum - illum) < 1e-9, `${time}: illum expected ${illum}, got ${gotIllum}`);
      assert.ok(Math.abs(gotAlt - alt) < 1e-9, `${time}: alt expected ${alt}, got ${gotAlt}`);
    }
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

// Cross-check: the same fixture inputs and pinned expected outputs (to the
// same tight tolerance) are asserted against the frontend twin's
// src/scoring/score.ts in the root test/scoring.test.ts. Editing either
// twin's computeScore/rankSpots without updating the other now breaks
// *that twin's own* test suite, not just the other one's -- extends the
// same cross-check pattern already used for solar.ts above.
describe('Cross-check: computeScore/rankSpots pinned values (matches frontend twin)', () => {
  test('computeScore: 3 fixed fixtures match the frontend twin to within 1e-9', () => {
    // fixture A: mid cloud, mid-low KP, short drive, light pollution 2
    // cloudFactor=70, kpFactor=kpAuroraFactor(6)=130 (a curve breakpoint --
    // see docs/scoring-model.md, "Latitude-aware KP curve"), driveMin=57.5
    // (<120, no penalty), lightPenalty=10
    // raw = 0.7*70 + 0.3*130 - 0 - 10 = 49 + 39 - 10 = 78
    const a = computeScore(30, 6, 50, 2);
    assert.ok(Math.abs(a - 78) < 1e-9, `fixture A: expected ~78, got ${a}`);

    // fixture B: heavy cloud, low-mid KP, long drive (over threshold), light pollution 1
    // cloudFactor=35, kpFactor=kpAuroraFactor(4)=125 (a curve breakpoint),
    // driveMin=207, penalty=(207-120)*0.35=30.45, lightPenalty=5
    // raw = 0.7*35 + 0.3*125 - 30.45 - 5 = 24.5 + 37.5 - 30.45 - 5 = 26.55
    const b = computeScore(65, 4, 180, 1);
    assert.ok(Math.abs(b - 26.55) < 1e-9, `fixture B: expected ~26.55, got ${b}`);

    // fixture C: near-clear sky, max-ish KP, no drive/light penalty
    // cloudFactor=90, kpFactor=kpAuroraFactor(9)=110 (the Kp 6-9 rolloff --
    // see docs/scoring-model.md -- means kp=9 no longer maxes out the curve)
    // raw = 0.7*90 + 0.3*110 = 63 + 33 = 96 (no longer clamped to 100)
    const c = computeScore(10, 9, 0, 0);
    assert.ok(Math.abs(c - 96) < 1e-9, `fixture C: expected ~96, got ${c}`);
  });

  test('rankSpots: one small fixture matches the frontend twin\'s pinned result exactly', () => {
    // Equator coordinates (makeSpot() default lat=0, lon=0) at 00:00-02:00 UTC
    // in mid-July are deep solar night (darknessFactor 1 throughout -- see the
    // note above hoursFrom()), so this fixture isolates cloud/KP/distance/light
    // scoring from the darkness gate entirely. At these particular
    // instants/coordinates the moon factor also happens to land at exactly 0
    // (moon below the horizon or too dim -- see computeMoonPenaltyPoints), so
    // the per-hour scores below equal the raw cloud/KP/distance/light formula
    // exactly, with no moon adjustment to account for.
    const spot = makeSpot({ distanceKm: 20, lightPollution: 1 });
    const forecast = hoursFrom([50, 20, 70]);
    const kpByHour = [4, 4, 4];

    const [result] = rankSpots([spot], { [spot.id]: forecast }, kpByHour);

    // Per-hour raw scores (kp=4 -> kpFactor=kpAuroraFactor(4)=125, driveMin=23
    // -> no penalty, lightPenalty=5):
    // hour0 (cloud=50): 0.7*50 + 0.3*125 - 5 = 35 + 37.5 - 5 = 67.5
    // hour1 (cloud=20): 0.7*80 + 0.3*125 - 5 = 56 + 37.5 - 5 = 88.5 <- best hour
    // hour2 (cloud=70): 0.7*30 + 0.3*125 - 5 = 21 + 37.5 - 5 = 53.5
    assert.deepEqual(
      result.hourlyScores.map((h) => h.score),
      [67.5, 88.5, 53.5]
    );
    // 88.5 rounds to 89 (JS Math.round rounds .5 up)
    assert.equal(result.score, 89);
    assert.equal(result.cloudCoverAtBestHour, 20);
    assert.equal(result.bestWindowStart, forecast[0].time);
    assert.equal(result.bestWindowEnd, forecast[2].time);
    // best hour (index 1) is imminent (<= IMMINENT_INDEX) and clears the 55 good bar -> good_now
    assert.equal(result.trend, 'good_now');
    // coldScore from temperature=0, windSpeed=0 (makeHour defaults): (2-0)*6.5=13
    assert.equal(result.coldScore, 13);
  });
});
