import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { TonightSnapshot } from '../src/types.js';

// store.ts resolves its on-disk mirror path (`data/latest-snapshot.json`) from
// `process.cwd()` at module-evaluation time, so the only way to point it at an
// isolated, disposable location (instead of the real `backend/data/`) is to
// `chdir` into a scratch directory *before* the module is first imported, then
// dynamically import it. All tests in this file share that one store module
// instance (consistent with how `node --test` isolates each test *file* into
// its own process), so later tests are written to set up their own state
// explicitly rather than depend on ordering.
let store: typeof import('../src/store.js');
let tempDir: string;
let snapshotPath: string;
let originalCwd: string;

function makeSnapshot(updatedAt: string): TonightSnapshot {
  return {
    updatedAt,
    kp: { current: 2, peakNext12h: 5, tonightPeak: 5, hourly: [2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
    tonightScore: null,
    tomorrowScore: null,
    sightingPossibleFrom: null,
    topSpots: [],
    rankings: [],
    forecastsBySpotId: {},
    dataQuality: { usingFallbackKp: false, fallbackWeatherSpotIds: [] }
  };
}

before(async () => {
  originalCwd = process.cwd();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-store-test-'));
  process.chdir(tempDir);
  store = await import('../src/store.js');
  snapshotPath = path.join(tempDir, 'data', 'latest-snapshot.json');
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true });
});

test('loadSnapshotFromDisk with no mirror file present starts empty and does not throw', async () => {
  await fs.rm(snapshotPath, { force: true });

  await assert.doesNotReject(store.loadSnapshotFromDisk());
  assert.equal(store.getLatestSnapshot(), null);
});

test('loadSnapshotFromDisk loads a fresh mirror and marks staleSnapshot false', async () => {
  const updatedAt = '2026-01-01T00:00:00.000Z';
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(makeSnapshot(updatedAt)), 'utf8');

  // 5 minutes after updatedAt: well under the default 30-minute threshold.
  const now = new Date('2026-01-01T00:05:00.000Z').getTime();
  await store.loadSnapshotFromDisk(now);

  const snapshot = store.getLatestSnapshot();
  assert.notEqual(snapshot, null);
  assert.equal(snapshot?.updatedAt, updatedAt);
  assert.equal(snapshot?.dataQuality.staleSnapshot, false);
});

test('loadSnapshotFromDisk marks an old mirror staleSnapshot true once past the threshold', async () => {
  const updatedAt = '2026-01-01T00:00:00.000Z';
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(makeSnapshot(updatedAt)), 'utf8');

  // 1 hour after updatedAt: past the default 30-minute STALE_SNAPSHOT_MS threshold.
  const now = new Date('2026-01-01T01:00:00.000Z').getTime();
  await store.loadSnapshotFromDisk(now);

  const snapshot = store.getLatestSnapshot();
  assert.notEqual(snapshot, null);
  assert.equal(snapshot?.dataQuality.staleSnapshot, true);
});

test('loadSnapshotFromDisk with corrupt JSON starts empty and does not throw', async () => {
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, '{ this is not valid json', 'utf8');

  await assert.doesNotReject(store.loadSnapshotFromDisk());
  assert.equal(store.getLatestSnapshot(), null);
});

test('getSnapshotAgeMs / isSnapshotStale return null/false when there is no snapshot', () => {
  // Following directly on from the corrupt-JSON test above, which leaves the
  // store empty.
  assert.equal(store.getLatestSnapshot(), null);
  assert.equal(store.getSnapshotAgeMs(), null);
  assert.equal(store.isSnapshotStale(), false);
});

test('getSnapshotAgeMs / isSnapshotStale are consistent with each other once a snapshot is loaded', async () => {
  const updatedAt = '2026-01-01T00:00:00.000Z';
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(makeSnapshot(updatedAt)), 'utf8');
  await store.loadSnapshotFromDisk(new Date(updatedAt).getTime());

  const tenMinutesLater = new Date('2026-01-01T00:10:00.000Z').getTime();
  assert.equal(store.getSnapshotAgeMs(tenMinutesLater), 10 * 60 * 1000);
  assert.equal(store.isSnapshotStale(tenMinutesLater), false);

  const fortyMinutesLater = new Date('2026-01-01T00:40:00.000Z').getTime();
  assert.equal(store.getSnapshotAgeMs(fortyMinutesLater), 40 * 60 * 1000);
  assert.equal(store.isSnapshotStale(fortyMinutesLater), true);
});

test('recordRefreshOutcome(false) records the error, then recordRefreshOutcome(true) clears it', () => {
  store.recordRefreshOutcome(false, new Error('upstream exploded'));

  let status = store.getRefreshStatus();
  assert.equal(status.lastRefreshSucceeded, false);
  assert.equal(status.lastRefreshError, 'upstream exploded');
  assert.equal(Number.isNaN(new Date(status.lastRefreshAttemptAt ?? '').getTime()), false);

  store.recordRefreshOutcome(true);

  status = store.getRefreshStatus();
  assert.equal(status.lastRefreshSucceeded, true);
  assert.equal(status.lastRefreshError, null);
  assert.equal(Number.isNaN(new Date(status.lastRefreshAttemptAt ?? '').getTime()), false);
});

test('recordRefreshOutcome(false) with a non-Error value stringifies it', () => {
  store.recordRefreshOutcome(false, 'plain string failure');

  const status = store.getRefreshStatus();
  assert.equal(status.lastRefreshSucceeded, false);
  assert.equal(status.lastRefreshError, 'plain string failure');
});

test('recordRefreshOutcome(false) with no error argument falls back to a default message', () => {
  store.recordRefreshOutcome(false);

  const status = store.getRefreshStatus();
  assert.equal(status.lastRefreshSucceeded, false);
  assert.equal(status.lastRefreshError, 'Unknown error');
});
