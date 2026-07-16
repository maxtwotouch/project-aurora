// Tests for backend/src/events.ts — POST /v1/events ingestion.
// Runs in a temp cwd (never backend/data/) so the usageCounterStore singleton
// it shares with usageStore.ts never touches the real data mirror, and so the
// unref'd 30s auto-flush timer (if it ever fired) couldn't pollute the repo.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';

type UsageStoreModule = typeof import('../src/usageStore.js');
type EventsModule = typeof import('../src/events.js');

let usageStoreModule: UsageStoreModule;
let eventsModule: EventsModule;
let tmpDir: string;
let originalCwd: string;
let dataFilePath: string;
let app: FastifyInstance;

// A real spot id from src/data/spots.json (see backend/src/snapshot.ts ->
// getSpots(), used by events.ts to validate spotId).
const VALID_SPOT_ID = 'ersfjordbotn';
const OTHER_VALID_SPOT_ID = 'kattfjordvatnet';

before(async () => {
  originalCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-events-test-'));
  process.chdir(tmpDir);
  usageStoreModule = await import('../src/usageStore.js');
  eventsModule = await import('../src/events.js');
  dataFilePath = path.join(tmpDir, 'data', 'usage-stats.json');
});

after(async () => {
  usageStoreModule.usageCounterStore.stop();
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  // No file has ever been written in this temp dir, so load() resets the
  // shared singleton's in-memory counters to empty before every test.
  await fs.rm(dataFilePath, { force: true });
  await usageStoreModule.usageCounterStore.load();

  app = Fastify({ logger: false });
  eventsModule.registerEventRoutes(app);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

test('valid single event increments a counter with the correct UTC hour bucket', async () => {
  const expectedHourBucket = usageStoreModule.toHourBucket(); // computed at call time, tolerant of hour rollover
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    payload: { type: 'spot_view', spotId: VALID_SPOT_ID }
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, '');

  const records = usageStoreModule.usageCounterStore.getAll();
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.type, 'spot_view');
  assert.equal(record.spotId, VALID_SPOT_ID);
  assert.equal(record.count, 1);
  // Tolerate an hour rollover between reading the clock above and the
  // request being handled: accept either the bucket we computed or the one
  // immediately after it.
  assert.ok(
    record.hourBucket === expectedHourBucket || record.hourBucket === usageStoreModule.toHourBucket(),
    `expected hourBucket near ${expectedHourBucket}, got ${record.hourBucket}`
  );

  // --- PRIVACY INVARIANT ---
  // The only thing ever persisted for a usage event is the (type, spotId,
  // hourBucket) counter tuple plus its integer count — never a raw
  // timestamp, IP address, device/session id, or any other request
  // metadata. Assert the stored record has exactly these fields and nothing
  // else.
  assert.deepEqual(Object.keys(record).sort(), ['count', 'hourBucket', 'spotId', 'type']);
  assert.equal(Number.isInteger(record.count), true);
  assert.match(record.hourBucket, /^\d{4}-\d{2}-\d{2}T\d{2}$/);
});

test('extra/unexpected fields on an event are never stored (privacy invariant)', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    payload: {
      type: 'spot_view',
      spotId: VALID_SPOT_ID,
      // None of these should ever reach storage.
      ip: '203.0.113.7',
      userId: 'user-123',
      lat: 69.6626,
      lon: 18.3738,
      timestamp: '2026-07-16T10:15:32.123Z'
    }
  });

  assert.equal(response.statusCode, 204);

  const records = usageStoreModule.usageCounterStore.getAll();
  assert.equal(records.length, 1);
  // Only the allowlisted fields exist on the stored record — extra input
  // fields are dropped, never persisted.
  assert.deepEqual(Object.keys(records[0]).sort(), ['count', 'hourBucket', 'spotId', 'type']);
});

test('valid batch of events increments counters per (type, spotId, hour)', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    payload: [
      { type: 'spot_view', spotId: VALID_SPOT_ID },
      { type: 'spot_view', spotId: VALID_SPOT_ID },
      { type: 'navigate_pressed', spotId: VALID_SPOT_ID },
      { type: 'spot_shared', spotId: OTHER_VALID_SPOT_ID }
    ]
  });

  assert.equal(response.statusCode, 204);

  const records = usageStoreModule.usageCounterStore.getAll();
  const find = (type: string, spotId: string) => records.find((r) => r.type === type && r.spotId === spotId);

  assert.equal(find('spot_view', VALID_SPOT_ID)?.count, 2);
  assert.equal(find('navigate_pressed', VALID_SPOT_ID)?.count, 1);
  assert.equal(find('spot_shared', OTHER_VALID_SPOT_ID)?.count, 1);
  assert.equal(usageStoreModule.usageCounterStore.getDistinctKeyCount(), 3);
});

test('rejects an unknown event type (400, nothing stored)', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    payload: { type: 'page_view', spotId: VALID_SPOT_ID }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(usageStoreModule.usageCounterStore.getAll(), []);
});

test('rejects an unknown spotId not present in the spot catalog (400, nothing stored)', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    payload: { type: 'spot_view', spotId: 'not-a-real-spot' }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(usageStoreModule.usageCounterStore.getAll(), []);
});

test('rejects a batch larger than 20 events (400, nothing stored)', async () => {
  const events = Array.from({ length: 21 }, () => ({ type: 'spot_view', spotId: VALID_SPOT_ID }));
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    payload: events
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(usageStoreModule.usageCounterStore.getAll(), []);
});

test('accepts a batch of exactly 20 events (the cap is inclusive)', async () => {
  const events = Array.from({ length: 20 }, () => ({ type: 'spot_view', spotId: VALID_SPOT_ID }));
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    payload: events
  });

  assert.equal(response.statusCode, 204);
  assert.equal(usageStoreModule.usageCounterStore.getAll()[0]?.count, 20);
});

test('rejects a non-JSON body (400, nothing stored)', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: { 'content-type': 'application/json' },
    payload: 'this is not json'
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(usageStoreModule.usageCounterStore.getAll(), []);
});

test('rejects an empty body (400, nothing stored)', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: { 'content-type': 'application/json' },
    payload: ''
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(usageStoreModule.usageCounterStore.getAll(), []);
});

test('rejects a body larger than the 8KiB cap (413, nothing stored)', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify([{ type: 'spot_view', spotId: VALID_SPOT_ID, filler: 'x'.repeat(9000) }])
  });

  assert.equal(response.statusCode, 413);
  assert.deepEqual(usageStoreModule.usageCounterStore.getAll(), []);
});
