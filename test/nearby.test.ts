// Tests for the pure device-position ranking in
// src/components/trip/nearby.ts's rankNearbySpots -- no React Native import
// (mirrors src/trip/presenceCore.ts's own "pure core, no I/O" split, and
// reuses that module's real haversineDistanceM rather than re-deriving
// distance math by hand, so the "rounded to one decimal" assertion below is
// checked against the actual formula the source uses, not a hand-copied
// approximation of it).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { rankNearbySpots } from '../src/components/trip/nearby.js';
import { haversineDistanceM } from '../src/trip/presenceCore.js';
import type { Spot, SpotScoreResult } from '../src/types/index.js';

function makeSpot(id: string, lat: number, lon: number): Spot {
  return {
    id,
    name: id,
    lat,
    lon,
    distanceKm: 0,
    lightPollution: 1,
    horizon: 'north',
    description: `test spot ${id}`
  };
}

function makeResult(spotId: string, score: number): SpotScoreResult {
  return {
    spotId,
    spotName: spotId,
    score,
    trend: 'good_now',
    bestWindowStart: '20:00',
    bestWindowEnd: '22:00',
    hourlyScores: [],
    cloudCoverAtBestHour: 10,
    temperatureAtBestHour: -5,
    windSpeedAtBestHour: 2,
    coldScore: 80,
    dressAdvice: 'Layer up, it is cold near the fjord.'
  };
}

// A device position south of every test spot below -- all test spots are
// placed due north at controlled latitude offsets so distance ordering is
// predictable (1 degree of latitude ~= 111.32km near Tromsø).
const DEVICE = { latitude: 69.0, longitude: 18.0 };

describe('rankNearbySpots: null coords', () => {
  test('returns [] when coords is null, regardless of spots/results', () => {
    const spots = [makeSpot('a', 69.05, 18.0)];
    const results = [makeResult('a', 80)];
    assert.deepEqual(rankNearbySpots(null, spots, results), []);
  });
});

describe('rankNearbySpots: filters by maxKm', () => {
  test('a spot within maxKm is kept, one well beyond it is excluded', () => {
    const near = makeSpot('near', 69.045, 18.0); // ~5km
    const far = makeSpot('far', 69.9, 18.0); // ~100km
    const results = [makeResult('near', 70), makeResult('far', 90)];

    const ranked = rankNearbySpots(DEVICE, [near, far], results, { maxKm: 50, limit: 10 });
    assert.deepEqual(ranked.map((r) => r.spot.id), ['near']);
  });
});

describe('rankNearbySpots: sorts by score desc, then distance asc on a tie', () => {
  test('a higher score ranks first even when it is much farther away', () => {
    const closeLowScore = makeSpot('close-low', 69.01, 18.0); // ~1.1km
    const farHighScore = makeSpot('far-high', 69.09, 18.0); // ~10km
    const results = [makeResult('close-low', 40), makeResult('far-high', 90)];

    const ranked = rankNearbySpots(DEVICE, [closeLowScore, farHighScore], results, { maxKm: 50, limit: 10 });
    assert.deepEqual(ranked.map((r) => r.spot.id), ['far-high', 'close-low']);
  });

  test('equal scores break the tie by distance ascending', () => {
    const closer = makeSpot('closer', 69.02, 18.0); // ~2.2km
    const farther = makeSpot('farther', 69.05, 18.0); // ~5.6km
    const results = [makeResult('closer', 70), makeResult('farther', 70)];

    // Input order deliberately reversed from the expected output order.
    const ranked = rankNearbySpots(DEVICE, [farther, closer], results, { maxKm: 50, limit: 10 });
    assert.deepEqual(ranked.map((r) => r.spot.id), ['closer', 'farther']);
  });
});

describe('rankNearbySpots: limit', () => {
  test('caps the number of returned entries at opts.limit, keeping the top-ranked ones', () => {
    const spots = [makeSpot('a', 69.01, 18.0), makeSpot('b', 69.02, 18.0), makeSpot('c', 69.03, 18.0)];
    const results = spots.map((spot, i) => makeResult(spot.id, 90 - i)); // a:90, b:89, c:88

    const ranked = rankNearbySpots(DEVICE, spots, results, { maxKm: 50, limit: 2 });
    assert.equal(ranked.length, 2);
    assert.deepEqual(ranked.map((r) => r.spot.id), ['a', 'b']);
  });
});

describe('rankNearbySpots: distance is rounded to one decimal', () => {
  test('distanceKm matches Math.round(distanceM / 1000 * 10) / 10 for the real haversine distance', () => {
    const spot = makeSpot('a', 69.033, 18.021);
    const results = [makeResult('a', 80)];
    const ranked = rankNearbySpots(DEVICE, [spot], results, { maxKm: 100, limit: 10 });

    const expectedDistanceM = haversineDistanceM(DEVICE.latitude, DEVICE.longitude, spot.lat, spot.lon);
    const expectedRounded = Math.round((expectedDistanceM / 1000) * 10) / 10;

    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].distanceKm, expectedRounded);
    // Genuinely rounded to (at most) one decimal place, not a raw float.
    assert.ok(Number.isInteger(ranked[0].distanceKm * 10));
  });
});

describe('rankNearbySpots: spots without a scoring result rank last', () => {
  test('a spot missing from rankedSpots sorts after every spot that has a result, even when it is much closer', () => {
    const withResult = makeSpot('has-result', 69.5, 18.0); // ~55.7km, low score
    const withoutResult = makeSpot('no-result', 69.01, 18.0); // ~1.1km, no score entry at all
    const results = [makeResult('has-result', 10)];

    const ranked = rankNearbySpots(DEVICE, [withoutResult, withResult], results, { maxKm: 200, limit: 10 });
    assert.deepEqual(ranked.map((r) => r.spot.id), ['has-result', 'no-result']);
    assert.notEqual(ranked[0].result, undefined);
    assert.equal(ranked[1].result, undefined);
  });
});
