// Tests for the IMPURE side of backend/src/validation.ts: appending/reading
// backend/data/predictions.jsonl and observed.jsonl, the maybeRecordObservedOutcome
// trigger, the retention sweep, and the GET /v1/admin/validation route.
// Follows the chdir-before-dynamic-import pattern used throughout this test
// dir (see test/store.test.ts / test/alerts.test.ts) since validation.ts
// resolves PREDICTIONS_PATH/OBSERVED_PATH from `process.cwd()` at
// module-load time. See test/validation.test.ts for the pure-logic coverage
// (computeValidationReport, parseObservedKpEntry, computeObservedMaxKp,
// buildPredictionRecord).
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getOsloOffset } from '../src/sources.js';
import type { FetchLike } from '../src/sources.js';
import type { DarknessSeasonState, KpTrend, SpotScoreResult, TonightSnapshot } from '../src/types.js';
import type { ObservedNightRecord, PredictionRecord } from '../src/validation.js';

type ValidationModule = typeof import('../src/validation.js');
type ServerModule = typeof import('../src/server.js');

let validationModule: ValidationModule;
let serverModule: ServerModule;
let tempDir: string;
let originalCwd: string;
let predictionsPath: string;
let observedPath: string;

const realFetch = globalThis.fetch;

before(async () => {
  originalCwd = process.cwd();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-validation-test-'));
  process.chdir(tempDir);
  // Dynamic imports (not static) so validation.ts's top-level
  // `path.resolve(process.cwd(), 'data/predictions.jsonl')` /
  // `.../observed.jsonl` bind to the temp dir, never the real backend/data/.
  validationModule = await import('../src/validation.js');
  serverModule = await import('../src/server.js');
  predictionsPath = path.join(tempDir, 'data', 'predictions.jsonl');
  observedPath = path.join(tempDir, 'data', 'observed.jsonl');
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function resetDataFiles(): Promise<void> {
  await fs.rm(predictionsPath, { force: true });
  await fs.rm(observedPath, { force: true });
}

async function appendRawLine(filePath: string, record: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function osloLocalToMs(dayKey: string, hour: number, minute = 0): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getOsloOffset(guess);
  const sign = offset[0] === '-' ? -1 : 1;
  const [offsetHours, offsetMinutes] = offset.slice(1).split(':').map(Number);
  const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;
  return guess.getTime() - offsetMs;
}

function makePredictionRecordFixture(nightKey: string, score = 50): PredictionRecord {
  return {
    recordedAt: `${nightKey}T20:00:00.000Z`,
    nightKey,
    kp: { current: 3, tonightPeak: 4, peakNext12h: 4 },
    spots: [{ spotId: 'ersfjordbotn', score, bestWindowStart: '2026-01-10T20:00:00.000Z', bestWindowEnd: '2026-01-10T23:00:00.000Z' }],
    dataQuality: { usingFallbackKp: false, fallbackWeatherSpotIds: [] },
    seasonClosed: false
  };
}

const OPEN_DARKNESS: DarknessSeasonState = { seasonClosed: false, seasonReturns: null };

function makeKp(): KpTrend {
  return { current: 3, peakNext12h: 5, tonightPeak: 5, hourly: [3, 4, 5] };
}

function makeRanking(score: number): SpotScoreResult {
  return {
    spotId: 'ersfjordbotn',
    spotName: 'Ersfjordbotn',
    score,
    trend: 'good_now',
    bestWindowStart: '2026-01-10T20:00:00.000Z',
    bestWindowEnd: '2026-01-10T23:00:00.000Z',
    hourlyScores: [],
    cloudCoverAtBestHour: 10,
    temperatureAtBestHour: -5,
    windSpeedAtBestHour: 2,
    coldScore: 50,
    dressAdvice: 'Cold: layered top, insulated jacket, gloves, and warm footwear.'
  };
}

function makeSnapshot(score: number): TonightSnapshot {
  const ranking = makeRanking(score);
  return {
    updatedAt: new Date().toISOString(),
    kp: makeKp(),
    tonightScore: null,
    tomorrowScore: null,
    sightingPossibleFrom: null,
    topSpots: [ranking],
    rankings: [ranking],
    forecastsBySpotId: {},
    dataQuality: { usingFallbackKp: false, fallbackWeatherSpotIds: [] },
    darkness: OPEN_DARKNESS
  };
}

function noaaFetchStub(entries: Array<[string, number]>, calls: string[]): FetchLike {
  return (async (url: string) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => entries.map(([time, kp]) => ({ time_tag: time, Kp: kp }))
    } as Response;
  }) as unknown as FetchLike;
}

function failingFetchStub(calls: string[]): FetchLike {
  return (async (url: string) => {
    calls.push(String(url));
    throw new Error('simulated NOAA outage');
  }) as unknown as FetchLike;
}

// --- recordPrediction / readPredictionRecords ---

describe('recordPrediction / readPredictionRecords', () => {
  test('appends a well-formed record and readPredictionRecords reads it back', async () => {
    await resetDataFiles();
    const nowMs = osloLocalToMs('2026-01-10', 20);

    await validationModule.recordPrediction(makeSnapshot(72), () => nowMs);

    const records = await validationModule.readPredictionRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].nightKey, '2026-01-10');
    assert.equal(records[0].spots[0].score, 72);
  });

  test('an 02:00 Oslo recordedAt rolls the persisted nightKey back to the previous night', async () => {
    await resetDataFiles();
    const nowMs = osloLocalToMs('2026-01-11', 2);

    await validationModule.recordPrediction(makeSnapshot(40), () => nowMs);

    const records = await validationModule.readPredictionRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].nightKey, '2026-01-10');
  });

  test('readPredictionRecords tolerates a malformed line without throwing', async () => {
    await resetDataFiles();
    await appendRawLine(predictionsPath, makePredictionRecordFixture('2026-01-10'));
    await fs.appendFile(predictionsPath, 'not valid json at all\n', 'utf8');
    await appendRawLine(predictionsPath, makePredictionRecordFixture('2026-01-11'));

    let records: PredictionRecord[] = [];
    await assert.doesNotReject(async () => {
      records = await validationModule.readPredictionRecords();
    });
    assert.equal(records.length, 2);
  });

  test('readPredictionRecords returns [] when the file does not exist', async () => {
    await resetDataFiles();
    const records = await validationModule.readPredictionRecords();
    assert.deepEqual(records, []);
  });
});

// --- maybeRecordObservedOutcome trigger discipline ---

describe('maybeRecordObservedOutcome', () => {
  test('before 16:00 Oslo: does not fetch, records nothing', async () => {
    await resetDataFiles();
    await appendRawLine(predictionsPath, makePredictionRecordFixture('2026-01-10'));

    const calls: string[] = [];
    const result = await validationModule.maybeRecordObservedOutcome({
      now: () => osloLocalToMs('2026-01-11', 15, 59),
      fetchImpl: noaaFetchStub([['2026-01-10 20:00:00.000', 5]], calls)
    });

    assert.deepEqual(result, { recorded: false });
    assert.equal(calls.length, 0);
    assert.deepEqual(await validationModule.readObservedRecords(), []);
  });

  test('at/after 16:00 Oslo with a prediction present and no observed record yet: fetches and appends exactly one record', async () => {
    await resetDataFiles();
    await appendRawLine(predictionsPath, makePredictionRecordFixture('2026-01-10'));

    const calls: string[] = [];
    const result = await validationModule.maybeRecordObservedOutcome({
      now: () => osloLocalToMs('2026-01-11', 16, 0),
      fetchImpl: noaaFetchStub(
        [
          ['2026-01-10 20:00:00.000', 5],
          ['2026-01-11 03:00:00.000', 7],
          ['2026-01-10 12:00:00.000', 9] // daytime, outside the dark-hours window
        ],
        calls
      )
    });

    assert.deepEqual(result, { recorded: true, nightKey: '2026-01-10' });
    assert.equal(calls.length, 1);

    const observed = await validationModule.readObservedRecords();
    assert.equal(observed.length, 1);
    assert.equal(observed[0].nightKey, '2026-01-10');
    assert.equal(observed[0].maxKp, 7);
    assert.equal(observed[0].source, 'noaa_measured_3h');
  });

  test('a second call the same day (observed record already exists) does not fetch again or duplicate', async () => {
    // Continues directly from the previous test's on-disk state (one
    // observed record for nightKey 2026-01-10 already exists).
    const calls: string[] = [];
    const result = await validationModule.maybeRecordObservedOutcome({
      now: () => osloLocalToMs('2026-01-11', 18, 0),
      fetchImpl: noaaFetchStub([['2026-01-10 20:00:00.000', 5]], calls)
    });

    assert.deepEqual(result, { recorded: false });
    assert.equal(calls.length, 0, 'must not re-fetch once an observed record already exists for that night');

    const observed = await validationModule.readObservedRecords();
    assert.equal(observed.length, 1, 'must not append a duplicate observed record');
  });

  test('no prediction recorded for that night: does not fetch, records nothing', async () => {
    await resetDataFiles();
    // predictions.jsonl deliberately left empty/absent.

    const calls: string[] = [];
    const result = await validationModule.maybeRecordObservedOutcome({
      now: () => osloLocalToMs('2026-01-11', 17, 0),
      fetchImpl: noaaFetchStub([['2026-01-10 20:00:00.000', 5]], calls)
    });

    assert.deepEqual(result, { recorded: false });
    assert.equal(calls.length, 0);
    assert.deepEqual(await validationModule.readObservedRecords(), []);
  });

  test('a fetch failure still records an outcome (maxKp null, source unknown), and never throws', async () => {
    await resetDataFiles();
    await appendRawLine(predictionsPath, makePredictionRecordFixture('2026-01-10'));

    const calls: string[] = [];
    let result: { recorded: boolean; nightKey?: string } | undefined;
    await assert.doesNotReject(async () => {
      result = await validationModule.maybeRecordObservedOutcome({
        now: () => osloLocalToMs('2026-01-11', 16, 0),
        fetchImpl: failingFetchStub(calls)
      });
    });

    assert.deepEqual(result, { recorded: true, nightKey: '2026-01-10' });
    assert.equal(calls.length, 1);

    const observed = await validationModule.readObservedRecords();
    assert.equal(observed.length, 1);
    assert.equal(observed[0].maxKp, null);
    assert.equal(observed[0].source, 'unknown');
  });

  test('exactly at the trigger hour boundary (16:00) fires; 15:59 does not (already covered above) -- sanity re-check with a fresh night', async () => {
    await resetDataFiles();
    await appendRawLine(predictionsPath, makePredictionRecordFixture('2026-02-01'));

    const calls: string[] = [];
    const result = await validationModule.maybeRecordObservedOutcome({
      now: () => osloLocalToMs('2026-02-02', 16, 0),
      fetchImpl: noaaFetchStub([['2026-02-01 20:00:00.000', 3]], calls)
    });

    assert.equal(result.recorded, true);
    assert.equal(calls.length, 1);
  });
});

// --- recordValidationTick ---

describe('recordValidationTick', () => {
  test('appends a prediction record with the right nightKey and never throws even when the NOAA fetch fails', async () => {
    await resetDataFiles();
    const calls: string[] = [];

    await assert.doesNotReject(() =>
      validationModule.recordValidationTick(makeSnapshot(66), {
        now: () => osloLocalToMs('2026-03-05', 20),
        fetchImpl: failingFetchStub(calls)
      })
    );

    const predictions = await validationModule.readPredictionRecords();
    assert.equal(predictions.length, 1);
    assert.equal(predictions[0].nightKey, '2026-03-05');
    assert.equal(predictions[0].spots[0].score, 66);
  });

  test('a 02:00 Oslo tick rolls the recorded nightKey back to the previous night', async () => {
    await resetDataFiles();
    await validationModule.recordValidationTick(makeSnapshot(44), {
      now: () => osloLocalToMs('2026-03-06', 2),
      fetchImpl: noaaFetchStub([], [])
    });

    const predictions = await validationModule.readPredictionRecords();
    assert.equal(predictions.length, 1);
    assert.equal(predictions[0].nightKey, '2026-03-05');
  });

  test('also drives maybeRecordObservedOutcome as its second (independently-guarded) step', async () => {
    await resetDataFiles();
    // First tick records the prediction for the night that is about to end.
    await validationModule.recordValidationTick(makeSnapshot(80), {
      now: () => osloLocalToMs('2026-03-10', 20)
    });

    // Second tick, past 16:00 the next day: should both append a new
    // prediction tick for the (new) upcoming night AND record the observed
    // outcome for the night that just ended.
    const calls: string[] = [];
    await validationModule.recordValidationTick(makeSnapshot(20), {
      now: () => osloLocalToMs('2026-03-11', 16),
      fetchImpl: noaaFetchStub([['2026-03-10 21:00:00.000', 6]], calls)
    });

    assert.equal(calls.length, 1);
    const observed = await validationModule.readObservedRecords();
    assert.equal(observed.length, 1);
    assert.equal(observed[0].nightKey, '2026-03-10');
    assert.equal(observed[0].maxKp, 6);
  });
});

// --- Retention sweep ---

describe('retention sweep (VALIDATION_RETENTION_DAYS, throttled to once per Oslo day)', () => {
  const originalRetentionEnv = process.env.VALIDATION_RETENTION_DAYS;

  after(() => {
    if (originalRetentionEnv === undefined) delete process.env.VALIDATION_RETENTION_DAYS;
    else process.env.VALIDATION_RETENTION_DAYS = originalRetentionEnv;
  });

  test('drops nightKey-old records past the retention window, keeps fresh ones, and only re-sweeps once per Oslo day', async () => {
    // Uses dedicated, otherwise-unused dates (2027-xx) so this test's
    // "first call today" assumption can never collide with a day key any
    // earlier test in this file happened to touch (retention throttling is
    // process/module-global state -- see validation.ts's
    // lastRetentionSweepDayKey).
    process.env.VALIDATION_RETENTION_DAYS = '5';
    await resetDataFiles();

    const oldNightKey = '2020-01-01'; // far past a 5-day retention window
    const freshNightKey = '2027-06-01';
    await appendRawLine(predictionsPath, makePredictionRecordFixture(oldNightKey));
    await appendRawLine(predictionsPath, makePredictionRecordFixture(freshNightKey));

    const day1Now = () => osloLocalToMs('2027-06-01', 20);

    // First recordPrediction call of this (never-before-seen) day: triggers
    // the retention sweep, which should prune the old record.
    await validationModule.recordPrediction(makeSnapshot(10), day1Now);

    let predictions = await validationModule.readPredictionRecords();
    assert.ok(
      predictions.every((record) => record.nightKey !== oldNightKey),
      'the old record should have been pruned by the first sweep of the day'
    );
    assert.ok(predictions.some((record) => record.nightKey === freshNightKey), 'the fresh record must survive pruning');

    // Re-introduce another old record, then call again the SAME day: the
    // sweep must be throttled to once/day, so this old record must survive
    // this second call.
    await appendRawLine(predictionsPath, makePredictionRecordFixture(oldNightKey));
    await validationModule.recordPrediction(makeSnapshot(10), day1Now);

    predictions = await validationModule.readPredictionRecords();
    assert.ok(
      predictions.some((record) => record.nightKey === oldNightKey),
      'the sweep must not run twice in the same Oslo day, so this re-added old record must still be present'
    );

    // Advance to the next Oslo day: the sweep should run again and prune it.
    const day2Now = () => osloLocalToMs('2027-06-02', 20);
    await validationModule.recordPrediction(makeSnapshot(10), day2Now);

    predictions = await validationModule.readPredictionRecords();
    assert.ok(
      predictions.every((record) => record.nightKey !== oldNightKey),
      'a new Oslo day must trigger a fresh sweep, pruning the old record again'
    );
  });
});

// --- GET /v1/admin/validation route ---

describe('GET /v1/admin/validation', () => {
  test('401 when no admin token is configured', async () => {
    const app = serverModule.buildApp({ adminToken: '' });
    const response = await app.inject({ method: 'GET', url: '/v1/admin/validation', headers: { 'x-admin-token': 'anything' } });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().ok, false);
    await app.close();
  });

  test('401 when the provided token does not match', async () => {
    const app = serverModule.buildApp({ adminToken: 'expected-token' });
    const response = await app.inject({ method: 'GET', url: '/v1/admin/validation', headers: { 'x-admin-token': 'wrong-token' } });

    assert.equal(response.statusCode, 401);
    await app.close();
  });

  test('401 when no token header is sent at all', async () => {
    const app = serverModule.buildApp({ adminToken: 'expected-token' });
    const response = await app.inject({ method: 'GET', url: '/v1/admin/validation' });

    assert.equal(response.statusCode, 401);
    await app.close();
  });

  test('200 with a matching token returns a well-formed ValidationReport shape', async () => {
    await resetDataFiles();
    await appendRawLine(predictionsPath, makePredictionRecordFixture('2026-04-01', 88));
    await appendRawLine(observedPath, { nightKey: '2026-04-01', recordedAt: '2026-04-02T16:00:00.000Z', maxKp: 6, source: 'noaa_measured_3h' } satisfies ObservedNightRecord);

    const app = serverModule.buildApp({ adminToken: 'expected-token' });
    const response = await app.inject({ method: 'GET', url: '/v1/admin/validation', headers: { 'x-admin-token': 'expected-token' } });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(typeof body.generatedAt, 'string');
    assert.equal(Number.isNaN(new Date(body.generatedAt).getTime()), false);
    assert.equal(body.totalNightsWithPrediction, 1);
    assert.equal(body.totalNightsWithObservedOutcome, 1);
    assert.equal(body.bands.length, 5);
    assert.equal(body.bands.find((b: { label: string }) => b.label === '80-100').nights, 1);
    assert.equal(typeof body.hitRate, 'object');
    assert.equal(body.hitRate.nightsPredictedAboveThreshold, 1);
    assert.equal(body.hitRate.nightsWithHit, 1);

    await app.close();
  });

  test('200 with an empty data dir returns a zeroed report rather than erroring', async () => {
    await resetDataFiles();

    const app = serverModule.buildApp({ adminToken: 'expected-token' });
    const response = await app.inject({ method: 'GET', url: '/v1/admin/validation', headers: { 'x-admin-token': 'expected-token' } });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.totalNightsWithPrediction, 0);
    assert.equal(body.hitRate.hitRate, null);

    await app.close();
  });
});
