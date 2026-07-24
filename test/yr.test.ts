// Tests for src/api/yr.ts's layered cloud field parsing and fallback
// generation -- mirrors backend/test/sources.test.ts's identical coverage
// for backend/src/sources.ts (the two files independently parse the same
// MET Norway fields; see src/api/yr.ts's header comments pointing at the
// backend twin).
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearForecastCache,
  fetchPointForecastDetailed,
  fetchSpotForecastDetailed
} from '../src/api/yr.js';
import type { Spot } from '../src/types/index.js';

// yr.ts calls the global `fetch` directly and does not accept it as a
// dependency, so there is no way to unit-test its request-building /
// response-handling without either (a) making real network calls
// (forbidden here) or (b) stubbing the global `fetch`. We stub
// `globalThis.fetch` per test and restore the real one afterwards -- no
// network I/O ever occurs. We also clear yr.ts's in-memory forecast cache
// after each test (keyed by lat/lon) so a stubbed response from one test
// can never leak into another via the cache.
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  clearForecastCache();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

function makeSpot(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'yr-test-spot',
    name: 'Yr Test Spot',
    lat: 69.111,
    lon: 18.111,
    distanceKm: 0,
    lightPollution: 0,
    horizon: 'north',
    description: 'synthetic spot for yr.ts tests',
    ...overrides
  };
}

function timeseriesPayloadWithLayers(count: number) {
  return {
    properties: {
      timeseries: Array.from({ length: count }, (_, i) => ({
        time: `2026-07-16T${String(i).padStart(2, '0')}:00:00Z`,
        data: {
          instant: {
            details: {
              cloud_area_fraction: 50,
              cloud_area_fraction_low: i * 10,
              cloud_area_fraction_medium: i * 5,
              cloud_area_fraction_high: i * 2,
              air_temperature: -i,
              wind_speed: i
            }
          }
        }
      }))
    }
  };
}

function timeseriesPayloadWithoutLayers(count: number) {
  return {
    properties: {
      timeseries: Array.from({ length: count }, (_, i) => ({
        time: `2026-07-16T${String(i).padStart(2, '0')}:00:00Z`,
        data: {
          instant: {
            details: {
              cloud_area_fraction: 50,
              air_temperature: -i,
              wind_speed: i
            }
          }
        }
      }))
    }
  };
}

describe('fetchSpotForecastDetailed / fetchPointForecastDetailed: layered cloud field parsing ' +
  '(cloud_area_fraction_low/_medium/_high)', () => {
  test('a MET payload WITH per-layer cloud fields populates cloudCoverLow/Medium/High', async () => {
    globalThis.fetch = (async () => jsonResponse(timeseriesPayloadWithLayers(3))) as typeof fetch;

    const { hourly, usedFallback } = await fetchSpotForecastDetailed(makeSpot({ lat: 69.201, lon: 18.201 }));

    assert.equal(usedFallback, false);
    assert.deepEqual(
      hourly.map((h) => h.cloudCoverLow),
      [0, 10, 20]
    );
    assert.deepEqual(
      hourly.map((h) => h.cloudCoverMedium),
      [0, 5, 10]
    );
    assert.deepEqual(
      hourly.map((h) => h.cloudCoverHigh),
      [0, 2, 4]
    );
    assert.deepEqual(
      hourly.map((h) => h.cloudCover),
      [50, 50, 50]
    );
  });

  test('a MET payload WITHOUT per-layer cloud fields leaves cloudCoverLow/Medium/High undefined, ' +
    'while the aggregate cloudCover is still populated (scoring still works via the aggregate fallback)', async () => {
    globalThis.fetch = (async () => jsonResponse(timeseriesPayloadWithoutLayers(3))) as typeof fetch;

    const { hourly, usedFallback } = await fetchSpotForecastDetailed(makeSpot({ lat: 69.202, lon: 18.202 }));

    assert.equal(usedFallback, false);
    for (const hour of hourly) {
      assert.equal(hour.cloudCoverLow, undefined);
      assert.equal(hour.cloudCoverMedium, undefined);
      assert.equal(hour.cloudCoverHigh, undefined);
      assert.equal(hour.cloudCover, 50);
    }
  });

  test('fetchPointForecastDetailed also parses per-layer cloud fields', async () => {
    globalThis.fetch = (async () => jsonResponse(timeseriesPayloadWithLayers(2))) as typeof fetch;

    const { hourly, usedFallback } = await fetchPointForecastDetailed(69.203, 18.203, 2);

    assert.equal(usedFallback, false);
    assert.equal(hourly[1].cloudCoverLow, 10);
    assert.equal(hourly[1].cloudCoverMedium, 5);
    assert.equal(hourly[1].cloudCoverHigh, 2);
  });

  test('a malformed MET payload (missing properties.timeseries) falls back to a forecast whose layered ' +
    'fields are consistent with its own aggregate (50/30/20 low/medium/high split)', async () => {
    globalThis.fetch = (async () => jsonResponse({ unexpected: 'shape' })) as typeof fetch;

    const { hourly, usedFallback } = await fetchSpotForecastDetailed(makeSpot({ lat: 69.204, lon: 18.204 }));

    assert.equal(usedFallback, true);
    assert.deepEqual(
      hourly.map((h) => h.cloudCover),
      [72, 68, 63, 58, 55, 52, 50, 54, 59, 64, 69, 74]
    );
    for (const hour of hourly) {
      assert.equal(hour.cloudCoverLow, Math.round(hour.cloudCover * 0.5));
      assert.equal(hour.cloudCoverMedium, Math.round(hour.cloudCover * 0.3));
      assert.equal(hour.cloudCoverHigh, Math.round(hour.cloudCover * 0.2));
    }
  });

  test('a failed fetch (network error) falls back to the deterministic layered cloud sequence', async () => {
    globalThis.fetch = (async () => {
      throw new Error('simulated network failure');
    }) as typeof fetch;

    const { hourly, usedFallback } = await fetchPointForecastDetailed(69.205, 18.205);

    assert.equal(usedFallback, true);
    assert.equal(hourly[0].cloudCover, 72);
    assert.equal(hourly[0].cloudCoverLow, 36);
    assert.equal(hourly[0].cloudCoverMedium, Math.round(72 * 0.3));
    assert.equal(hourly[0].cloudCoverHigh, Math.round(72 * 0.2));
  });

  test('a non-ok MET response falls back to the deterministic layered cloud sequence', async () => {
    globalThis.fetch = (async () => jsonResponse({}, false, 500)) as typeof fetch;

    const { hourly, usedFallback } = await fetchSpotForecastDetailed(makeSpot({ lat: 69.206, lon: 18.206 }));

    assert.equal(usedFallback, true);
    assert.equal(hourly[0].cloudCover, 72);
    assert.equal(hourly[0].cloudCoverLow, 36);
  });
});
