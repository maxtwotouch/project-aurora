import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchKpTrendWithQuality,
  fetchSpotForecastWithQuality,
  fetchWithTimeout,
  getSourceTimeoutMs
} from '../src/sources.js';
import type { FetchLike } from '../src/sources.js';
import type { Spot } from '../src/types.js';

const originalSourceTimeoutMs = process.env.SOURCE_TIMEOUT_MS;

afterEach(() => {
  if (originalSourceTimeoutMs === undefined) {
    delete process.env.SOURCE_TIMEOUT_MS;
  } else {
    process.env.SOURCE_TIMEOUT_MS = originalSourceTimeoutMs;
  }
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

/** A `fetch` stand-in that never resolves on its own, but -- like the real
 * `fetch` -- rejects with an AbortError as soon as its signal is aborted.
 * Used to prove `fetchWithTimeout` (and the fetchers built on it) can never
 * hang on a stuck upstream. */
function makeHangingFetch(): FetchLike {
  return (async (_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      });
    })) as unknown as FetchLike;
}

/** A `fetch` stand-in that resolves after `delayMs`, well before the caller's
 * timeout, exercising the non-aborted success path. */
function makeSlowFetch(delayMs: number, body: unknown): FetchLike {
  return (async () =>
    new Promise((resolve) => {
      setTimeout(() => resolve(jsonResponse(body)), delayMs);
    })) as unknown as FetchLike;
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

describe('getSourceTimeoutMs', () => {
  test('reads a valid SOURCE_TIMEOUT_MS from the environment', () => {
    process.env.SOURCE_TIMEOUT_MS = '1234';
    assert.equal(getSourceTimeoutMs(), 1234);
  });

  test('falls back to the 10s default for an unset/invalid SOURCE_TIMEOUT_MS', () => {
    delete process.env.SOURCE_TIMEOUT_MS;
    assert.equal(getSourceTimeoutMs(), 10_000);

    process.env.SOURCE_TIMEOUT_MS = 'not-a-number';
    assert.equal(getSourceTimeoutMs(), 10_000);

    process.env.SOURCE_TIMEOUT_MS = '-5';
    assert.equal(getSourceTimeoutMs(), 10_000);
  });
});

describe('fetchWithTimeout', () => {
  test('aborts and rejects a hung request once the timeout elapses, instead of hanging', async () => {
    const started = Date.now();

    await assert.rejects(
      fetchWithTimeout(makeHangingFetch(), 'https://example.invalid/hung', {}, 50),
      (error: unknown) => error instanceof Error && error.name === 'AbortError'
    );

    // Sanity bound so a regression that removes the abort wiring (and makes
    // this hang instead) fails the test suite quickly rather than timing out
    // node:test's own (much longer) default.
    assert.ok(Date.now() - started < 2000, 'expected fetchWithTimeout to abort promptly, not hang');
  });

  test('resolves normally when the request completes comfortably under the timeout', async () => {
    const response = await fetchWithTimeout(makeSlowFetch(10, { hello: 'world' }), 'https://example.invalid/ok', {}, 500);

    assert.equal(response.ok, true);
    assert.deepEqual(await response.json(), { hello: 'world' });
  });
});

describe('timeout behaviour of the higher-level fetchers (via injectable fetchImpl)', () => {
  test('fetchKpTrendWithQuality falls back when the upstream hangs past SOURCE_TIMEOUT_MS', async () => {
    process.env.SOURCE_TIMEOUT_MS = '50';
    const started = Date.now();

    const { kp, usingFallback } = await fetchKpTrendWithQuality(makeHangingFetch());

    assert.ok(Date.now() - started < 2000, 'expected the fetcher to fall back promptly, not hang');
    assert.equal(usingFallback, true);
    assert.equal(kp.current, 2);
    assert.equal(kp.peakNext12h, 5);
  });

  test('fetchSpotForecastWithQuality succeeds when the upstream responds well under SOURCE_TIMEOUT_MS', async () => {
    process.env.SOURCE_TIMEOUT_MS = '500';
    const payload = {
      properties: {
        timeseries: [
          {
            time: '2026-07-16T00:00:00Z',
            data: { instant: { details: { cloud_area_fraction: 12, air_temperature: -3, wind_speed: 2 } } }
          }
        ]
      }
    };

    const { hourly, usingFallback } = await fetchSpotForecastWithQuality(testSpot, makeSlowFetch(10, payload));

    assert.equal(usingFallback, false);
    assert.equal(hourly.length, 1);
    assert.equal(hourly[0].cloudCover, 12);
  });

  test('fetchSpotForecastWithQuality falls back when the upstream hangs past SOURCE_TIMEOUT_MS', async () => {
    process.env.SOURCE_TIMEOUT_MS = '50';
    const started = Date.now();

    const { hourly, usingFallback } = await fetchSpotForecastWithQuality(testSpot, makeHangingFetch());

    assert.ok(Date.now() - started < 2000, 'expected the fetcher to fall back promptly, not hang');
    assert.equal(usingFallback, true);
    assert.equal(hourly.length, 12);
    assert.equal(hourly[0].cloudCover, 72);
  });
});
