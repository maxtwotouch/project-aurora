// Sanity checks for src/data/spots.json -- the frontend's spot definitions
// (see backend/src/snapshot.ts, which reads this same file). These are data
// invariants, not scoring behavior: catch typos/duplicates/out-of-range
// coordinates before they ship.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import spots from '../src/data/spots.json' with { type: 'json' };

type RawSpot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  lightPollution: number;
  horizon: string;
  description: string;
  busStop?: string;
  parking?: string;
  source?: string;
};

const typedSpots = spots as RawSpot[];

// Tromsø-area bounding box the app is scoped to (see CLAUDE.md: "helps
// tourists in Tromsø"). Generous enough to cover the Lyngen Alps / Kilpisjärvi
// outliers already in the data without being a no-op check.
const LAT_MIN = 69;
const LAT_MAX = 70.5;
const LON_MIN = 17;
const LON_MAX = 21;

describe('spots.json: shape and count', () => {
  test('contains exactly 28 spots', () => {
    assert.equal(typedSpots.length, 28);
  });

  test('every entry is a non-null object with the expected required keys', () => {
    for (const spot of typedSpots) {
      assert.equal(typeof spot, 'object');
      assert.ok(spot);
      for (const key of ['id', 'name', 'lat', 'lon', 'distanceKm', 'lightPollution', 'horizon', 'description']) {
        assert.ok(key in spot, `missing required key "${key}" on spot ${JSON.stringify(spot)}`);
      }
    }
  });
});

describe('spots.json: unique ids', () => {
  test('every id is unique', () => {
    const ids = typedSpots.map((s) => s.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, `duplicate ids found: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  });

  test('every id is a non-empty string', () => {
    for (const spot of typedSpots) {
      assert.equal(typeof spot.id, 'string');
      assert.ok(spot.id.trim().length > 0, `empty id on spot ${JSON.stringify(spot)}`);
    }
  });
});

describe('spots.json: coordinates within the Tromsø region', () => {
  test('every lat is within 69-70.5', () => {
    for (const spot of typedSpots) {
      assert.ok(
        spot.lat >= LAT_MIN && spot.lat <= LAT_MAX,
        `spot ${spot.id} has lat ${spot.lat}, expected within [${LAT_MIN}, ${LAT_MAX}]`
      );
    }
  });

  test('every lon is within 17-21', () => {
    for (const spot of typedSpots) {
      assert.ok(
        spot.lon >= LON_MIN && spot.lon <= LON_MAX,
        `spot ${spot.id} has lon ${spot.lon}, expected within [${LON_MIN}, ${LON_MAX}]`
      );
    }
  });
});

describe('spots.json: no empty strings on required text fields', () => {
  test('name, horizon, and description are non-empty on every spot', () => {
    for (const spot of typedSpots) {
      for (const key of ['name', 'horizon', 'description'] as const) {
        const value = spot[key];
        assert.equal(typeof value, 'string');
        assert.ok(value.trim().length > 0, `empty "${key}" on spot ${spot.id}`);
      }
    }
  });

  test('numeric fields (distanceKm, lightPollution) are finite numbers, not NaN/strings', () => {
    for (const spot of typedSpots) {
      assert.equal(typeof spot.distanceKm, 'number');
      assert.ok(Number.isFinite(spot.distanceKm), `non-finite distanceKm on spot ${spot.id}`);
      assert.equal(typeof spot.lightPollution, 'number');
      assert.ok(Number.isFinite(spot.lightPollution), `non-finite lightPollution on spot ${spot.id}`);
    }
  });
});

describe('spots.json: optional busStop/parking are non-empty when present', () => {
  test('busStop, when present, is a non-empty string', () => {
    for (const spot of typedSpots) {
      if (spot.busStop === undefined) continue;
      assert.equal(typeof spot.busStop, 'string');
      assert.ok(spot.busStop.trim().length > 0, `empty busStop on spot ${spot.id}`);
    }
  });

  test('parking, when present, is a non-empty string', () => {
    for (const spot of typedSpots) {
      if (spot.parking === undefined) continue;
      assert.equal(typeof spot.parking, 'string');
      assert.ok(spot.parking.trim().length > 0, `empty parking on spot ${spot.id}`);
    }
  });
});

describe('spots.json: source values are valid', () => {
  test('source, when present, is a non-empty string from the known set', () => {
    const knownSources = new Set(['Tromsø kommune']);
    for (const spot of typedSpots) {
      if (spot.source === undefined) continue;
      assert.equal(typeof spot.source, 'string');
      assert.ok(spot.source.trim().length > 0, `empty source on spot ${spot.id}`);
      assert.ok(
        knownSources.has(spot.source),
        `unexpected source "${spot.source}" on spot ${spot.id}; update knownSources if this is intentional`
      );
    }
  });
});
