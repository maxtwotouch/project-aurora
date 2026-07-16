// Tests for backend/src/usageStore.ts — the sole persistence layer for
// anonymous usage counters. These tests run against a temp directory (never
// backend/data/) by chdir-ing into a fresh mkdtemp() directory *before*
// dynamically importing the module under test, since USAGE_STATS_PATH in
// usageStore.ts is computed from `process.cwd()` at module-load time.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type UsageStoreModule = typeof import('../src/usageStore.js');

let usageStoreModule: UsageStoreModule;
let tmpDir: string;
let originalCwd: string;
let dataFilePath: string;

before(async () => {
  originalCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-usagestore-test-'));
  process.chdir(tmpDir);
  // Dynamic import (not a static import) so that the chdir() above has
  // already happened by the time usageStore.ts's top-level
  // `path.resolve(process.cwd(), 'data/usage-stats.json')` executes.
  usageStoreModule = await import('../src/usageStore.js');
  dataFilePath = path.join(tmpDir, 'data', 'usage-stats.json');
});

after(async () => {
  usageStoreModule.usageCounterStore.stop();
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Deletes any on-disk mirror and calls load(), which resets in-memory
 * counters to empty when there is nothing (or nothing valid) to read. Used
 * to give each test a clean starting point without a private reset API. */
async function resetStore(): Promise<void> {
  await fs.rm(dataFilePath, { force: true });
  await usageStoreModule.usageCounterStore.load();
}

test('increment() aggregates counts correctly across distinct and repeated keys', async () => {
  await resetStore();
  const { usageCounterStore } = usageStoreModule;

  usageCounterStore.increment({ type: 'spot_view', spotId: 'ersfjordbotn', hourBucket: '2026-07-16T10' });
  usageCounterStore.increment({ type: 'spot_view', spotId: 'ersfjordbotn', hourBucket: '2026-07-16T10' });
  usageCounterStore.increment({ type: 'spot_view', spotId: 'kattfjordvatnet', hourBucket: '2026-07-16T10' });
  usageCounterStore.increment({ type: 'navigate_pressed', spotId: 'ersfjordbotn', hourBucket: '2026-07-16T10' });
  usageCounterStore.increment({ type: 'spot_view', spotId: 'ersfjordbotn', hourBucket: '2026-07-16T11' }, 3);

  assert.equal(usageCounterStore.getDistinctKeyCount(), 4);

  const records = usageCounterStore.getAll();
  const find = (type: string, spotId: string, hourBucket: string) =>
    records.find((r) => r.type === type && r.spotId === spotId && r.hourBucket === hourBucket);

  assert.equal(find('spot_view', 'ersfjordbotn', '2026-07-16T10')?.count, 2);
  assert.equal(find('spot_view', 'kattfjordvatnet', '2026-07-16T10')?.count, 1);
  assert.equal(find('navigate_pressed', 'ersfjordbotn', '2026-07-16T10')?.count, 1);
  assert.equal(find('spot_view', 'ersfjordbotn', '2026-07-16T11')?.count, 3);
});

test('load() restores counters from a JSON file on disk (temp dir, never backend/data/)', async () => {
  await resetStore();
  const { usageCounterStore } = usageStoreModule;

  // Sanity: the resolved path must live under our temp dir, not the repo's
  // backend/data/ directory.
  assert.ok(dataFilePath.startsWith(tmpDir), 'usage-stats.json path must be inside the temp dir for this test');
  assert.ok(!dataFilePath.includes(path.join('backend', 'data')));

  await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
  await fs.writeFile(
    dataFilePath,
    JSON.stringify({
      updatedAt: '2026-07-16T09:00:00.000Z',
      counters: {
        'spot_view|ersfjordbotn|2026-07-16T09': 7,
        'spot_shared|kattfjordvatnet|2026-07-16T08': 2
      }
    }),
    'utf8'
  );

  await usageCounterStore.load();

  const records = usageCounterStore.getAll();
  assert.equal(records.length, 2);
  assert.ok(records.some((r) => r.type === 'spot_view' && r.spotId === 'ersfjordbotn' && r.hourBucket === '2026-07-16T09' && r.count === 7));
  assert.ok(records.some((r) => r.type === 'spot_shared' && r.spotId === 'kattfjordvatnet' && r.hourBucket === '2026-07-16T08' && r.count === 2));
});

test('flush() writes the JSON mirror atomically (no leftover tmp file, content matches counters)', async () => {
  await resetStore();
  const { usageCounterStore } = usageStoreModule;

  usageCounterStore.increment({ type: 'spot_view', spotId: 'ersfjordbotn', hourBucket: '2026-07-16T12' }, 4);
  usageCounterStore.increment({ type: 'navigate_pressed', spotId: 'grotfjord', hourBucket: '2026-07-16T12' }, 1);

  await usageCounterStore.flush();

  const dirEntries = await fs.readdir(path.dirname(dataFilePath));
  const leftoverTmpFiles = dirEntries.filter((name) => name.includes('.tmp-'));
  assert.deepEqual(leftoverTmpFiles, [], 'flush() must not leave a .tmp-<pid> file behind (atomic rename)');

  const raw = await fs.readFile(dataFilePath, 'utf8');
  const parsed = JSON.parse(raw) as { updatedAt: string; counters: Record<string, number> };
  assert.equal(typeof parsed.updatedAt, 'string');
  assert.equal(parsed.counters['spot_view|ersfjordbotn|2026-07-16T12'], 4);
  assert.equal(parsed.counters['navigate_pressed|grotfjord|2026-07-16T12'], 1);
});

test('malformed/corrupt JSON file on load degrades gracefully (empty counters, no crash)', async () => {
  await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
  await fs.writeFile(dataFilePath, '{ this is not valid JSON ]', 'utf8');

  const { usageCounterStore } = usageStoreModule;
  await assert.doesNotReject(() => usageCounterStore.load());

  assert.deepEqual(usageCounterStore.getAll(), []);
  assert.equal(usageCounterStore.getDistinctKeyCount(), 0);
});

test('increment() drops new keys past the cap and fires the warning handler instead of throwing', async () => {
  await resetStore();
  const { usageCounterStore } = usageStoreModule;

  const warnings: string[] = [];
  usageCounterStore.setWarningHandler((message) => warnings.push(message));

  const MAX_COUNTER_KEYS = 200_000; // mirrors the private cap in usageStore.ts

  for (let i = 0; i < MAX_COUNTER_KEYS; i += 1) {
    usageCounterStore.increment({ type: 'spot_view', spotId: `synthetic-${i}`, hourBucket: '2026-07-16T13' });
  }
  assert.equal(usageCounterStore.getDistinctKeyCount(), MAX_COUNTER_KEYS);
  assert.deepEqual(warnings, [], 'no warning expected before the cap is reached');

  // One more, brand-new key: should be dropped, not throw, and should warn.
  assert.doesNotThrow(() => {
    usageCounterStore.increment({ type: 'spot_view', spotId: 'one-too-many', hourBucket: '2026-07-16T13' });
  });
  assert.equal(usageCounterStore.getDistinctKeyCount(), MAX_COUNTER_KEYS, 'a brand-new key past the cap must be dropped');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /cap/i);

  // Existing keys must still be incrementable past the cap (only *new* keys are dropped).
  const before = usageCounterStore
    .getAll()
    .find((r) => r.spotId === 'synthetic-0' && r.hourBucket === '2026-07-16T13')?.count;
  usageCounterStore.increment({ type: 'spot_view', spotId: 'synthetic-0', hourBucket: '2026-07-16T13' });
  const after = usageCounterStore
    .getAll()
    .find((r) => r.spotId === 'synthetic-0' && r.hourBucket === '2026-07-16T13')?.count;
  assert.equal(after, (before ?? 0) + 1);

  usageCounterStore.setWarningHandler(() => {});
});

// --- Retention (USAGE_RETENTION_DAYS, default 180 days) ---

test('load() prunes hour-bucket keys older than the default 180-day retention window, keeps fresh ones', async () => {
  await fs.mkdir(path.dirname(dataFilePath), { recursive: true });

  const now = Date.now();
  const oldBucket = usageStoreModule.toHourBucket(new Date(now - 200 * 24 * 60 * 60 * 1000)); // 200 days ago
  const freshBucket = usageStoreModule.toHourBucket(new Date(now - 1 * 24 * 60 * 60 * 1000)); // 1 day ago

  await fs.writeFile(
    dataFilePath,
    JSON.stringify({
      updatedAt: new Date(now).toISOString(),
      counters: {
        [`spot_view|ersfjordbotn|${oldBucket}`]: 5,
        [`spot_view|ersfjordbotn|${freshBucket}`]: 3
      }
    }),
    'utf8'
  );

  const { usageCounterStore } = usageStoreModule;
  await usageCounterStore.load();

  const records = usageCounterStore.getAll();
  assert.equal(records.length, 1);
  assert.equal(records[0].hourBucket, freshBucket);
  assert.equal(records[0].count, 3);
});

test('load() honors a custom USAGE_RETENTION_DAYS value', async () => {
  const originalEnv = process.env.USAGE_RETENTION_DAYS;
  process.env.USAGE_RETENTION_DAYS = '7';

  try {
    await fs.mkdir(path.dirname(dataFilePath), { recursive: true });

    const now = Date.now();
    const tooOldBucket = usageStoreModule.toHourBucket(new Date(now - 10 * 24 * 60 * 60 * 1000)); // 10 days ago
    const stillFreshBucket = usageStoreModule.toHourBucket(new Date(now - 3 * 24 * 60 * 60 * 1000)); // 3 days ago

    await fs.writeFile(
      dataFilePath,
      JSON.stringify({
        updatedAt: new Date(now).toISOString(),
        counters: {
          [`spot_view|ersfjordbotn|${tooOldBucket}`]: 1,
          [`spot_view|ersfjordbotn|${stillFreshBucket}`]: 1
        }
      }),
      'utf8'
    );

    const { usageCounterStore } = usageStoreModule;
    await usageCounterStore.load();

    const records = usageCounterStore.getAll();
    assert.equal(records.length, 1);
    assert.equal(records[0].hourBucket, stillFreshBucket);
  } finally {
    if (originalEnv === undefined) delete process.env.USAGE_RETENTION_DAYS;
    else process.env.USAGE_RETENTION_DAYS = originalEnv;
  }
});

test('flush() prunes stale hour-bucket keys too, and the pruning is reflected in the written JSON mirror', async () => {
  await resetStore();
  const { usageCounterStore } = usageStoreModule;

  const now = Date.now();
  const oldBucket = usageStoreModule.toHourBucket(new Date(now - 365 * 24 * 60 * 60 * 1000)); // 1 year ago
  const freshBucket = usageStoreModule.toHourBucket(new Date(now));

  usageCounterStore.increment({ type: 'spot_view', spotId: 'ersfjordbotn', hourBucket: oldBucket });
  usageCounterStore.increment({ type: 'spot_view', spotId: 'ersfjordbotn', hourBucket: freshBucket });
  assert.equal(usageCounterStore.getDistinctKeyCount(), 2);

  const warnings: string[] = [];
  usageCounterStore.setWarningHandler((message) => warnings.push(message));

  await usageCounterStore.flush();

  assert.equal(usageCounterStore.getDistinctKeyCount(), 1, 'the stale key should be pruned by flush()');
  assert.equal(usageCounterStore.getAll()[0]?.hourBucket, freshBucket);
  assert.ok(warnings.some((message) => /pruned/i.test(message)), 'expected a pruning warning');
  assert.ok(
    warnings.every((message) => !message.includes(oldBucket)),
    'the pruning warning must be count-only, never include the pruned key/bucket itself'
  );

  const raw = await fs.readFile(dataFilePath, 'utf8');
  const parsed = JSON.parse(raw) as { counters: Record<string, number> };
  assert.deepEqual(Object.keys(parsed.counters), [`spot_view|ersfjordbotn|${freshBucket}`]);

  usageCounterStore.setWarningHandler(() => {});
});

test('load() treats a key whose hour-bucket segment is not a parseable date as prunable, warns with a count only', async () => {
  await fs.mkdir(path.dirname(dataFilePath), { recursive: true });

  await fs.writeFile(
    dataFilePath,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      counters: {
        'spot_view|ersfjordbotn|not-a-real-hour-bucket': 4,
        [`spot_view|ersfjordbotn|${usageStoreModule.toHourBucket()}`]: 2
      }
    }),
    'utf8'
  );

  const { usageCounterStore } = usageStoreModule;
  const warnings: string[] = [];
  usageCounterStore.setWarningHandler((message) => warnings.push(message));

  await usageCounterStore.load();

  const records = usageCounterStore.getAll();
  assert.equal(records.length, 1);
  assert.equal(records[0].count, 2);
  assert.ok(warnings.some((message) => /malformed/i.test(message)));
  assert.ok(
    warnings.every((message) => !message.includes('not-a-real-hour-bucket')),
    'the warning must never include the malformed key contents'
  );

  usageCounterStore.setWarningHandler(() => {});
});
