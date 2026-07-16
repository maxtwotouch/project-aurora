import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { TonightSnapshot } from '../src/types.js';

// server.ts's buildApp() reads the shared store.ts singleton, which in turn
// resolves its on-disk mirror path from `process.cwd()` at module-evaluation
// time. We `chdir` into a scratch directory before dynamically importing
// both modules so nothing here ever touches the real `backend/data/` mirror,
// and no network I/O occurs (routes that would trigger a live refresh stub
// `globalThis.fetch` the same way `snapshot.test.ts` does).
let serverMod: typeof import('../src/server.js');
let store: typeof import('../src/store.js');
let tempDir: string;
let originalCwd: string;

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

before(async () => {
  originalCwd = process.cwd();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-server-test-'));
  process.chdir(tempDir);
  store = await import('../src/store.js');
  serverMod = await import('../src/server.js');
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true });
});

function makeSnapshot(updatedAt: string): TonightSnapshot {
  return {
    updatedAt,
    kp: { current: 3, peakNext12h: 6, tonightPeak: 6, hourly: [3, 4, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6] },
    tonightScore: { score: 70, chance: 'High', cloudCover: 20, peakKp: 6 },
    tomorrowScore: null,
    sightingPossibleFrom: '21:30',
    topSpots: [],
    rankings: [],
    forecastsBySpotId: {},
    dataQuality: { usingFallbackKp: false, fallbackWeatherSpotIds: [] }
  };
}

// --- Cold-start behaviour: no snapshot has ever been loaded/set. ---

test('GET /v1/health with no snapshot: ok false, hasSnapshot false, new fields present but null', async () => {
  const app = serverMod.buildApp({ adminToken: '' });
  const response = await app.inject({ method: 'GET', url: '/v1/health' });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, false);
  assert.equal(body.hasSnapshot, false);
  assert.equal(body.snapshotAgeMs, null);
  assert.equal(body.stale, null);
  // refresh-status fields are always present, even before any refresh attempt.
  assert.equal(body.lastRefreshSucceeded, null);
  assert.equal(body.lastRefreshAttemptAt, null);
  assert.equal(body.lastRefreshError, null);

  await app.close();
});

test('GET /v1/tonight returns 503 when there is no snapshot yet', async () => {
  const app = serverMod.buildApp({ adminToken: '' });
  const response = await app.inject({ method: 'GET', url: '/v1/tonight' });

  assert.equal(response.statusCode, 503);
  assert.match(response.json().message, /not ready/i);

  await app.close();
});

test('GET /v1/spots/:id returns 404 for an unknown spot id regardless of snapshot state', async () => {
  const app = serverMod.buildApp({ adminToken: '' });
  const response = await app.inject({ method: 'GET', url: '/v1/spots/not-a-real-spot' });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().message, 'Spot not found.');

  await app.close();
});

// --- Warm behaviour: a snapshot is present in the store. ---

test('GET /v1/health and /v1/tonight reflect a snapshot once one is set, consistent with refresh status', async () => {
  const updatedAt = new Date().toISOString();
  store.recordRefreshOutcome(true);
  await store.setLatestSnapshot(makeSnapshot(updatedAt));

  const app = serverMod.buildApp({ adminToken: '' });

  const health = await app.inject({ method: 'GET', url: '/v1/health' });
  assert.equal(health.statusCode, 200);
  const healthBody = health.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.hasSnapshot, true);
  assert.equal(healthBody.updatedAt, updatedAt);
  assert.equal(typeof healthBody.snapshotAgeMs, 'number');
  assert.ok(healthBody.snapshotAgeMs >= 0);
  assert.equal(healthBody.stale, false);
  assert.equal(healthBody.lastRefreshSucceeded, true);
  assert.equal(healthBody.lastRefreshError, null);
  assert.equal(Number.isNaN(new Date(healthBody.lastRefreshAttemptAt).getTime()), false);
  assert.deepEqual(healthBody.dataQuality, { usingFallbackKp: false, fallbackWeatherSpotIds: [] });

  const tonight = await app.inject({ method: 'GET', url: '/v1/tonight' });
  assert.equal(tonight.statusCode, 200);
  assert.equal(tonight.json().updatedAt, updatedAt);

  await app.close();
});

test('GET /v1/health reports stale true once the snapshot is older than the staleness threshold', async () => {
  // 40 minutes old: past the default 30-minute STALE_SNAPSHOT_MS threshold.
  const updatedAt = new Date(Date.now() - 40 * 60 * 1000).toISOString();
  await store.setLatestSnapshot(makeSnapshot(updatedAt));

  const app = serverMod.buildApp({ adminToken: '' });
  const health = await app.inject({ method: 'GET', url: '/v1/health' });

  assert.equal(health.json().stale, true);

  await app.close();
});

// --- Admin refresh gate. ---

test('POST /v1/admin/refresh is rejected with 401 when no admin token is configured', async () => {
  const app = serverMod.buildApp({ adminToken: '' });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/refresh',
    headers: { 'x-admin-token': 'anything' }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().ok, false);

  await app.close();
});

test('POST /v1/admin/refresh is rejected with 401 when the provided token does not match', async () => {
  const app = serverMod.buildApp({ adminToken: 'expected-token' });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/refresh',
    headers: { 'x-admin-token': 'wrong-token' }
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().ok, false);

  await app.close();
});

test('POST /v1/admin/refresh is rejected with 401 when no token header is sent at all', async () => {
  const app = serverMod.buildApp({ adminToken: 'expected-token' });
  const response = await app.inject({ method: 'POST', url: '/v1/admin/refresh' });

  assert.equal(response.statusCode, 401);

  await app.close();
});

test('POST /v1/admin/refresh with a matching token triggers a refresh and returns ok true', async () => {
  // buildTonightSnapshot() has no fetch-injection seam of its own; stub the
  // global so this drives the documented, deterministic fallback path with
  // zero real network I/O (same technique as snapshot.test.ts).
  globalThis.fetch = (async () => {
    throw new Error('simulated network failure');
  }) as typeof fetch;

  const app = serverMod.buildApp({ adminToken: 'expected-token' });
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/refresh',
    headers: { 'x-admin-token': 'expected-token' }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.ok, true);
  assert.equal(Number.isNaN(new Date(body.updatedAt).getTime()), false);

  const status = store.getRefreshStatus();
  assert.equal(status.lastRefreshSucceeded, true);
  assert.equal(status.lastRefreshError, null);

  await app.close();
});
