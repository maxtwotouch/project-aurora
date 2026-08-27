// Tests for backend/src/stats.ts — GET /v1/stats/usage (ADMIN_TOKEN-gated).
// Runs in a temp cwd so the shared usageCounterStore singleton never touches
// backend/data/ (see events.test.ts / usageStore.test.ts for why).
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';

type UsageStoreModule = typeof import('../src/usageStore.js');
type StatsModule = typeof import('../src/stats.js');

let usageStoreModule: UsageStoreModule;
let statsModule: StatsModule;
let tmpDir: string;
let originalCwd: string;
let dataFilePath: string;
let app: FastifyInstance;

const ADMIN_TOKEN = 'test-admin-token';

before(async () => {
  originalCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-stats-test-'));
  process.chdir(tmpDir);
  usageStoreModule = await import('../src/usageStore.js');
  statsModule = await import('../src/stats.js');
  dataFilePath = path.join(tmpDir, 'data', 'usage-stats.json');
});

after(async () => {
  usageStoreModule.usageCounterStore.stop();
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(dataFilePath, { force: true });
  await usageStoreModule.usageCounterStore.load();

  app = Fastify({ logger: false });
  statsModule.registerStatsRoutes(app, ADMIN_TOKEN);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

test('GET /v1/stats/usage without a token returns 401', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/stats/usage' });
  assert.equal(response.statusCode, 401);
});

test('GET /v1/stats/usage with the wrong token returns 401', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/v1/stats/usage',
    headers: { 'x-admin-token': 'not-the-right-token' }
  });
  assert.equal(response.statusCode, 401);
});

test('GET /v1/stats/usage with an empty configured admin token still returns 401 (fails closed)', async () => {
  const appNoToken = Fastify({ logger: false });
  statsModule.registerStatsRoutes(appNoToken, '');
  await appNoToken.ready();

  const response = await appNoToken.inject({
    method: 'GET',
    url: '/v1/stats/usage',
    headers: { 'x-admin-token': '' }
  });
  assert.equal(response.statusCode, 401);

  await appNoToken.close();
});

test('GET /v1/stats/usage with the correct token returns an aggregate-only envelope', async () => {
  usageStoreModule.usageCounterStore.increment({
    type: 'spot_view',
    spotId: 'ersfjordbotn',
    hourBucket: '2026-07-16T10'
  });
  usageStoreModule.usageCounterStore.increment({
    type: 'spot_view',
    spotId: 'ersfjordbotn',
    hourBucket: '2026-07-16T10'
  });
  usageStoreModule.usageCounterStore.increment({
    type: 'navigate_pressed',
    spotId: 'kattfjordvatnet',
    hourBucket: '2026-07-16T11'
  });

  const response = await app.inject({
    method: 'GET',
    url: '/v1/stats/usage',
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as Record<string, unknown>;

  // Aggregate envelope shape.
  assert.equal(typeof body.generatedAt, 'string');
  assert.equal(body.aggregationLevel, 'spot-hour');
  assert.equal(body.totalEvents, 3);
  assert.deepEqual(body.totalsByType, {
    spot_view: 2,
    navigate_pressed: 1,
    spot_shared: 0,
    spot_visit: 0,
    recommended_spot_visit: 0,
    zone_dwell: 0
  });
  assert.equal(body.distinctCounterKeys, 2);

  const bySpot = body.bySpot as Array<{ spotId: string; total: number }>;
  assert.ok(bySpot.some((entry) => entry.spotId === 'ersfjordbotn' && entry.total === 2));
  assert.ok(bySpot.some((entry) => entry.spotId === 'kattfjordvatnet' && entry.total === 1));

  // --- PRIVACY INVARIANT ---
  // This endpoint must return aggregates only, never row-level/raw usage
  // records. Every entry in bySpot/byHour/byDay must be a (dimension,
  // totalsByType, total) aggregate — never a list of individual event
  // occurrences, and never anything with a person-derived field (ip,
  // userId, deviceId, coordinates, raw timestamp, session id, etc.).
  const forbiddenFieldNames = ['ip', 'userId', 'deviceId', 'sessionId', 'lat', 'lon', 'timestamp', 'events', 'records', 'raw'];
  const serialized = JSON.stringify(body).toLowerCase();
  for (const forbidden of forbiddenFieldNames) {
    assert.ok(!serialized.includes(`"${forbidden.toLowerCase()}"`), `response must not contain a "${forbidden}" field`);
  }

  for (const entry of bySpot) {
    assert.deepEqual(Object.keys(entry).sort(), ['spotId', 'total', 'totalsByType']);
  }
  const byHour = body.byHour as Array<Record<string, unknown>>;
  for (const entry of byHour) {
    assert.deepEqual(Object.keys(entry).sort(), ['hourBucket', 'total', 'totalsByType']);
    assert.match(entry.hourBucket as string, /^\d{4}-\d{2}-\d{2}T\d{2}$/);
  }
});

test('GET /v1/stats/usage with no recorded events returns a well-formed empty envelope', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/v1/stats/usage',
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as Record<string, unknown>;
  assert.equal(body.totalEvents, 0);
  assert.deepEqual(body.bySpot, []);
  assert.deepEqual(body.byHour, []);
  assert.deepEqual(body.byDay, []);
  assert.deepEqual(body.byZoneCell, []);
  assert.equal(body.distinctCounterKeys, 0);
  assert.deepEqual(body.suppression, { minCell: 0, suppressedCells: 0 });
});

// --- Small-cell suppression (STATS_MIN_CELL, default 0 = off) ---

function withStatsMinCell<T>(value: string | undefined, run: () => Promise<T>): Promise<T> {
  const original = process.env.STATS_MIN_CELL;
  if (value === undefined) delete process.env.STATS_MIN_CELL;
  else process.env.STATS_MIN_CELL = value;

  return run().finally(() => {
    if (original === undefined) delete process.env.STATS_MIN_CELL;
    else process.env.STATS_MIN_CELL = original;
  });
}

test('STATS_MIN_CELL unset (default off): every breakdown entry is returned regardless of count', async () => {
  await withStatsMinCell(undefined, async () => {
    usageStoreModule.usageCounterStore.increment({
      type: 'spot_view',
      spotId: 'ersfjordbotn',
      hourBucket: '2026-07-16T10'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/stats/usage',
      headers: { 'x-admin-token': ADMIN_TOKEN }
    });

    const body = response.json() as Record<string, unknown>;
    assert.deepEqual(body.suppression, { minCell: 0, suppressedCells: 0 });
    const bySpot = body.bySpot as Array<{ spotId: string; total: number }>;
    assert.equal(bySpot.length, 1);
    assert.equal(bySpot[0].total, 1);
  });
});

test('STATS_MIN_CELL > 0: low-count cells are omitted from bySpot/byHour/byDay, totals stay exact', async () => {
  await withStatsMinCell('3', async () => {
    // ersfjordbotn: total 5 across two hours/days -> kept in every breakdown.
    usageStoreModule.usageCounterStore.increment(
      { type: 'spot_view', spotId: 'ersfjordbotn', hourBucket: '2026-07-16T10' },
      5
    );
    // kattfjordvatnet: total 1 -> below threshold, suppressed from bySpot/byHour/byDay.
    usageStoreModule.usageCounterStore.increment({
      type: 'navigate_pressed',
      spotId: 'kattfjordvatnet',
      hourBucket: '2026-07-16T11'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/stats/usage',
      headers: { 'x-admin-token': ADMIN_TOKEN }
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as Record<string, unknown>;

    // Totals remain exact -- suppression never touches totalEvents/totalsByType.
    assert.equal(body.totalEvents, 6);
    assert.deepEqual(body.totalsByType, {
      spot_view: 5,
      navigate_pressed: 1,
      spot_shared: 0,
      spot_visit: 0,
      recommended_spot_visit: 0,
      zone_dwell: 0
    });
    assert.equal(body.distinctCounterKeys, 2);

    const bySpot = body.bySpot as Array<{ spotId: string; total: number }>;
    assert.equal(bySpot.length, 1);
    assert.equal(bySpot[0].spotId, 'ersfjordbotn');

    const byHour = body.byHour as Array<{ hourBucket: string; total: number }>;
    assert.equal(byHour.length, 1);
    assert.equal(byHour[0].hourBucket, '2026-07-16T10');

    const byDay = body.byDay as Array<{ day: string; total: number }>;
    // Both records fall on the same day, and their combined day-total (6) is
    // >= the threshold, so the day entry is kept even though one of the two
    // contributing spot/hour cells was suppressed on its own breakdown.
    assert.equal(byDay.length, 1);
    assert.equal(byDay[0].total, 6);

    // suppressedCells counts entries omitted across bySpot + byHour + byDay:
    // kattfjordvatnet's row is suppressed from both bySpot and byHour (day is
    // not suppressed here since the combined day total clears the threshold).
    assert.deepEqual(body.suppression, { minCell: 3, suppressedCells: 2 });
  });
});

test('STATS_MIN_CELL suppresses every breakdown once combined totals also fall below the threshold', async () => {
  await withStatsMinCell('10', async () => {
    usageStoreModule.usageCounterStore.increment({
      type: 'spot_view',
      spotId: 'ersfjordbotn',
      hourBucket: '2026-07-16T10'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/stats/usage',
      headers: { 'x-admin-token': ADMIN_TOKEN }
    });

    const body = response.json() as Record<string, unknown>;

    // Exact totals survive even when every breakdown row is suppressed.
    assert.equal(body.totalEvents, 1);
    assert.deepEqual(body.totalsByType, {
      spot_view: 1,
      navigate_pressed: 0,
      spot_shared: 0,
      spot_visit: 0,
      recommended_spot_visit: 0,
      zone_dwell: 0
    });

    assert.deepEqual(body.bySpot, []);
    assert.deepEqual(body.byHour, []);
    assert.deepEqual(body.byDay, []);
    assert.deepEqual(body.suppression, { minCell: 10, suppressedCells: 3 });
  });
});

// --- Tourism event types exposure (docs/analytics-pivot.md's 2026-08-22
// amendment): totalsByType covers all six types; bySpot folds in the two
// spot-keyed tourism types; zone_dwell gets its own byZoneCell breakdown
// (h3Cell has no spotId, so it can never appear in bySpot). ---

test('spot_visit / recommended_spot_visit counts fold into totalsByType and bySpot', async () => {
  usageStoreModule.usageCounterStore.increment({
    type: 'spot_visit',
    spotId: 'ersfjordbotn',
    hourBucket: '2026-07-16T10',
    dwellBucket: '15-30m'
  });
  usageStoreModule.usageCounterStore.increment({
    type: 'recommended_spot_visit',
    spotId: 'ersfjordbotn',
    hourBucket: '2026-07-16T11',
    recommendationId: 'tonight-top-3'
  });

  const response = await app.inject({
    method: 'GET',
    url: '/v1/stats/usage',
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as Record<string, unknown>;

  assert.equal(body.totalEvents, 2);
  assert.deepEqual(body.totalsByType, {
    spot_view: 0,
    navigate_pressed: 0,
    spot_shared: 0,
    spot_visit: 1,
    recommended_spot_visit: 1,
    zone_dwell: 0
  });

  const bySpot = body.bySpot as Array<{ spotId: string; total: number; totalsByType: Record<string, number> }>;
  assert.equal(bySpot.length, 1);
  assert.equal(bySpot[0].spotId, 'ersfjordbotn');
  assert.equal(bySpot[0].total, 2);
  assert.equal(bySpot[0].totalsByType.spot_visit, 1);
  assert.equal(bySpot[0].totalsByType.recommended_spot_visit, 1);

  assert.deepEqual(body.byZoneCell, []);
});

test('zone_dwell counts fold into totalsByType and byZoneCell, never into bySpot', async () => {
  usageStoreModule.usageCounterStore.increment({
    type: 'zone_dwell',
    h3Cell: '8708ed358ffffff',
    hourBucket: '2026-07-16T10',
    dwellBucket: '60m+'
  });
  usageStoreModule.usageCounterStore.increment(
    {
      type: 'zone_dwell',
      h3Cell: '8708ed358ffffff',
      hourBucket: '2026-07-16T11',
      dwellBucket: '<5m'
    },
    2
  );

  const response = await app.inject({
    method: 'GET',
    url: '/v1/stats/usage',
    headers: { 'x-admin-token': ADMIN_TOKEN }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as Record<string, unknown>;

  assert.equal(body.totalEvents, 3);
  assert.deepEqual(body.totalsByType, {
    spot_view: 0,
    navigate_pressed: 0,
    spot_shared: 0,
    spot_visit: 0,
    recommended_spot_visit: 0,
    zone_dwell: 3
  });

  assert.deepEqual(body.bySpot, [], 'zone_dwell has no spotId, so it must never appear in bySpot');

  const byZoneCell = body.byZoneCell as Array<{ h3Cell: string; total: number }>;
  assert.equal(byZoneCell.length, 1);
  assert.equal(byZoneCell[0].h3Cell, '8708ed358ffffff');
  assert.equal(byZoneCell[0].total, 3);
  assert.deepEqual(Object.keys(byZoneCell[0]).sort(), ['h3Cell', 'total']);

  // --- PRIVACY INVARIANT --- byZoneCell entries carry no other dimension.
  const serialized = JSON.stringify(body).toLowerCase();
  for (const forbidden of ['ip', 'userid', 'deviceid', 'sessionid', 'lat', 'lon', 'timestamp']) {
    assert.ok(!serialized.includes(`"${forbidden}"`), `response must not contain a "${forbidden}" field`);
  }
});

test('STATS_MIN_CELL suppresses low-count byZoneCell entries too, and counts toward suppressedCells', async () => {
  await withStatsMinCell('3', async () => {
    // kept: total 5 >= 3
    usageStoreModule.usageCounterStore.increment(
      { type: 'zone_dwell', h3Cell: '8708ed358ffffff', hourBucket: '2026-07-16T10', dwellBucket: '60m+' },
      5
    );
    // suppressed: total 1 < 3
    usageStoreModule.usageCounterStore.increment({
      type: 'zone_dwell',
      h3Cell: '870831b30ffffff',
      hourBucket: '2026-07-16T10',
      dwellBucket: '<5m'
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/stats/usage',
      headers: { 'x-admin-token': ADMIN_TOKEN }
    });

    const body = response.json() as Record<string, unknown>;

    assert.equal(body.totalEvents, 6);
    assert.equal((body.totalsByType as Record<string, number>).zone_dwell, 6);

    const byZoneCell = body.byZoneCell as Array<{ h3Cell: string; total: number }>;
    assert.equal(byZoneCell.length, 1);
    assert.equal(byZoneCell[0].h3Cell, '8708ed358ffffff');

    // byZoneCell (1) + byHour (0, both cells share the same hour bucket, combined total 6 >= 3) +
    // byDay (0, same reasoning) -- only the single low-count zone cell is suppressed.
    assert.deepEqual(body.suppression, { minCell: 3, suppressedCells: 1 });
  });
});
