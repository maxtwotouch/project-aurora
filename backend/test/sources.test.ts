import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchKpTrendWithQuality,
  fetchPointForecastWithQuality,
  fetchSightingPossibleFromWithQuality,
  fetchSpotForecastWithQuality
} from '../src/sources.js';
import type { Spot } from '../src/types.js';

// sources.ts calls the global `fetch` directly and does not accept it as a
// dependency, so there is no way to unit-test its request-building /
// response-handling without either (a) making real network calls (forbidden
// here) or (b) stubbing the global `fetch`. We stub `globalThis.fetch` per
// test and restore the real one afterwards -- no network I/O ever occurs.
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

const testSpot: Spot = {
  id: 'test-spot',
  name: 'Test Spot',
  lat: 69.6,
  lon: 18.9,
  distanceKm: 10,
  lightPollution: 1,
  horizon: 'north',
  description: 'synthetic spot for tests'
};

describe('fetchKpTrendWithQuality: NOAA KP parsing and fallback', () => {
  test('empty KP payload falls back to the deterministic default trend', async () => {
    globalThis.fetch = (async () => jsonResponse([])) as typeof fetch;

    const { kp, usingFallback } = await fetchKpTrendWithQuality();

    assert.equal(usingFallback, true);
    assert.equal(kp.current, 2);
    assert.equal(kp.peakNext12h, 5);
    assert.equal(kp.tonightPeak, 5);
    assert.equal(kp.hourly.length, 12);
    assert.equal(kp.hourly[0], 2);
    assert.equal(kp.hourly[11], 5);
    assert.deepEqual(kp.dailyOutlook?.map((d) => d.peak) ?? [], [5, 5, 5, 5]);
  });

  test('non-array (malformed shape) KP payload falls back', async () => {
    globalThis.fetch = (async () => jsonResponse({ not: 'an array' })) as typeof fetch;

    const { usingFallback } = await fetchKpTrendWithQuality();

    assert.equal(usingFallback, true);
  });

  test('non-ok response from the KP "now" endpoint falls back', async () => {
    globalThis.fetch = (async () => jsonResponse({}, false, 500)) as typeof fetch;

    const { usingFallback } = await fetchKpTrendWithQuality();

    assert.equal(usingFallback, true);
  });

  test('a thrown/rejected fetch (network error) falls back', async () => {
    globalThis.fetch = (async () => {
      throw new Error('simulated network failure');
    }) as typeof fetch;

    const { kp, usingFallback } = await fetchKpTrendWithQuality();

    assert.equal(usingFallback, true);
    assert.equal(kp.current, 2);
  });

  test('a valid "now" payload is parsed and clamped to the 0-9 plausible KP range', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes('planetary_k_index_1m')) {
        // The real NOAA "now" feed is an array of objects with a kp_index field
        return jsonResponse([{ time_tag: '2026-07-16T00:00:00Z', kp_index: 15 }]); // out-of-range, should clamp to 9
      }
      return jsonResponse({}, false, 500);
    }) as typeof fetch;

    const { kp, usingFallback } = await fetchKpTrendWithQuality();

    assert.equal(usingFallback, false);
    assert.equal(kp.current, 9);
    // forecast endpoint failed, so peak/tonightPeak fall back to max(current, FALLBACK_PEAK_KP)
    assert.equal(kp.peakNext12h, 9);
    assert.equal(kp.tonightPeak, 9);
  });

  test('the latest valid entry is used, skipping trailing malformed rows', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes('planetary_k_index_1m')) {
        return jsonResponse([
          { time_tag: '2026-07-16T00:00:00Z', kp_index: 4 },
          { time_tag: '2026-07-16T01:00:00Z', kp_index: 6 },
          { garbage: true } // trailing malformed row should be skipped
        ]);
      }
      return jsonResponse({}, false, 500);
    }) as typeof fetch;

    const { kp } = await fetchKpTrendWithQuality();

    assert.equal(kp.current, 6);
  });

  test('peakNext12h is the max of "current" and the first 16 forecast rows', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes('planetary_k_index_1m')) {
        return jsonResponse([{ time_tag: '2026-07-16T00:00:00Z', kp_index: 3 }]);
      }
      if (String(url).includes('noaa-planetary-k-index-forecast')) {
        const header = ['time_tag', 'kp'];
        // 20 rows, all within the plausible 0-9 range so clampKp doesn't mask the slicing:
        // the first 16 rows peak at 5; rows 17-20 peak at 8 and must be ignored.
        const rows = Array.from({ length: 20 }, (_, i) => [`2099-01-01T${i}:00:00Z`, i < 16 ? (i === 15 ? 5 : 1) : 8]);
        return jsonResponse([header, ...rows]);
      }
      return jsonResponse({}, false, 500);
    }) as typeof fetch;

    const { kp, usingFallback } = await fetchKpTrendWithQuality();

    assert.equal(usingFallback, false);
    // only the first 16 rows are considered; their max is 5, current is 3, so peak = max(3,5) = 5
    // (if rows 17-20, peaking at 8, were incorrectly included, this would be 8 instead)
    assert.equal(kp.peakNext12h, 5);
  });

  test('a structurally valid but too-short forecast payload uses default fallback peaks (distinct from full outer fallback)', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes('planetary_k_index_1m')) {
        return jsonResponse([{ time_tag: '2026-07-16T00:00:00Z', kp_index: 7 }]);
      }
      if (String(url).includes('noaa-planetary-k-index-forecast')) {
        // only a header row, length < 2
        return jsonResponse([['time_tag', 'kp']]);
      }
      return jsonResponse({}, false, 500);
    }) as typeof fetch;

    const { kp, usingFallback } = await fetchKpTrendWithQuality();

    // the "now" fetch succeeded, so this is NOT the outer catch-fallback path
    assert.equal(usingFallback, false);
    // peakNext12h / tonightPeak use max(current, FALLBACK_PEAK_KP) = max(7, 5) = 7
    assert.equal(kp.peakNext12h, 7);
    assert.equal(kp.tonightPeak, 7);
    // dailyOutlook's short-payload fallback is hardcoded to FALLBACK_PEAK_KP (5),
    // independent of "current" -- distinct behavior from the peak fallbacks above
    assert.deepEqual(kp.dailyOutlook?.map((d) => d.peak) ?? [], [5, 5, 5, 5]);
    assert.deepEqual(
      kp.dailyOutlook?.map((d) => d.label) ?? [],
      ['Today', 'Tomorrow', 'Day 3', 'Day 4']
    );
  });
});

describe('fetchSpotForecastWithQuality / fetchPointForecastWithQuality: MET parsing and fallback', () => {
  function timeseriesPayload(count: number) {
    return {
      properties: {
        timeseries: Array.from({ length: count }, (_, i) => ({
          time: `2026-07-16T${String(i).padStart(2, '0')}:00:00Z`,
          data: {
            instant: {
              details: {
                cloud_area_fraction: i * 10,
                air_temperature: -i,
                wind_speed: i
              }
            }
          }
        }))
      }
    };
  }

  test('a valid MET payload is parsed into hourly cloud/temperature/wind data', async () => {
    globalThis.fetch = (async () => jsonResponse(timeseriesPayload(5))) as typeof fetch;

    const { hourly, usingFallback } = await fetchSpotForecastWithQuality(testSpot);

    assert.equal(usingFallback, false);
    assert.equal(hourly.length, 5);
    assert.equal(hourly[2].cloudCover, 20);
    assert.equal(hourly[2].temperature, -2);
    assert.equal(hourly[2].windSpeed, 2);
  });

  test('fetchSpotForecastWithQuality slices the MET timeseries to a maximum of 12 hours', async () => {
    globalThis.fetch = (async () => jsonResponse(timeseriesPayload(24))) as typeof fetch;

    const { hourly } = await fetchSpotForecastWithQuality(testSpot);

    assert.equal(hourly.length, 12);
  });

  test('fetchPointForecastWithQuality respects a custom `hours` slice length', async () => {
    globalThis.fetch = (async () => jsonResponse(timeseriesPayload(24))) as typeof fetch;

    const { hourly, usingFallback } = await fetchPointForecastWithQuality(69.6, 18.9, 3);

    assert.equal(usingFallback, false);
    assert.equal(hourly.length, 3);
  });

  test('a malformed MET payload (missing properties.timeseries) falls back to the deterministic cloud sequence', async () => {
    globalThis.fetch = (async () => jsonResponse({ unexpected: 'shape' })) as typeof fetch;

    const { hourly, usingFallback } = await fetchSpotForecastWithQuality(testSpot);

    assert.equal(usingFallback, true);
    assert.equal(hourly.length, 12);
    assert.deepEqual(
      hourly.map((h) => h.cloudCover),
      [72, 68, 63, 58, 55, 52, 50, 54, 59, 64, 69, 74]
    );
    for (const hour of hourly) {
      assert.equal(hour.temperature, -4);
      assert.equal(hour.windSpeed, 4);
    }
  });

  test('a non-ok MET response falls back to the deterministic cloud sequence', async () => {
    globalThis.fetch = (async () => jsonResponse({}, false, 500)) as typeof fetch;

    const { hourly, usingFallback } = await fetchSpotForecastWithQuality(testSpot);

    assert.equal(usingFallback, true);
    assert.equal(hourly[0].cloudCover, 72);
  });

  test('a thrown/rejected fetch (network error) falls back to the deterministic cloud sequence', async () => {
    globalThis.fetch = (async () => {
      throw new Error('simulated network failure');
    }) as typeof fetch;

    const { hourly, usingFallback } = await fetchPointForecastWithQuality(69.6, 18.9);

    assert.equal(usingFallback, true);
    assert.equal(hourly.length, 12);
    assert.equal(hourly[0].cloudCover, 72);
  });
});

describe('fetchSightingPossibleFromWithQuality', () => {
  test('a valid sunset payload produces an HH:mm sighting estimate', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        properties: {
          sunset: { time: '2026-07-16T20:00:00Z' }
        }
      })) as typeof fetch;

    const { sightingPossibleFrom, usingFallback } = await fetchSightingPossibleFromWithQuality(69.6, 18.9);

    assert.equal(usingFallback, false);
    assert.match(sightingPossibleFrom ?? '', /^\d{2}:\d{2}$/);
  });

  test('a malformed sunset payload (no sunset field) falls back to null', async () => {
    globalThis.fetch = (async () => jsonResponse({ properties: {} })) as typeof fetch;

    const { sightingPossibleFrom, usingFallback } = await fetchSightingPossibleFromWithQuality(69.6, 18.9);

    assert.equal(usingFallback, false); // fetch succeeded; estimateSightingPossibleFrom just returns null
    assert.equal(sightingPossibleFrom, null);
  });

  test('a failed fetch falls back to null with usingFallback = true', async () => {
    globalThis.fetch = (async () => jsonResponse({}, false, 500)) as typeof fetch;

    const { sightingPossibleFrom, usingFallback } = await fetchSightingPossibleFromWithQuality(69.6, 18.9);

    assert.equal(usingFallback, true);
    assert.equal(sightingPossibleFrom, null);
  });
});
