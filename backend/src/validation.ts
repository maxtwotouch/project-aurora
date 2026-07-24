import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { addDaysToDayKey, fetchWithTimeout, getOsloDayKey, getOsloParts } from './sources.js';
import type { Clock, FetchLike } from './sources.js';
import { getNightKey } from './alerts.js';
import type { DataQuality, TonightSnapshot } from './types.js';

/**
 * Scoring-validation loop (roadmap task #21).
 *
 * The app predicts a 0-100 aurora score per spot per night; nothing recorded
 * what we predicted or what actually happened, so prediction skill couldn't
 * be calibrated. This module is the MVP recorder + verifier: on every
 * successful snapshot refresh it appends a compact prediction record
 * (backend/data/predictions.jsonl), and once a night is definitively over it
 * looks up NOAA's *measured* planetary K-index for that night and appends an
 * observed-outcome record (backend/data/observed.jsonl). `computeValidationReport`
 * joins the two into per-score-band calibration stats, exposed read-only at
 * `GET /v1/admin/validation`.
 *
 * PRIVACY: this module stores and returns ZERO user/personal data. Every
 * record is either (a) our own model's predicted score/window per spot,
 * derived entirely from public weather/KP data -- never from a user or
 * request -- or (b) NOAA's publicly published measured planetary K-index.
 * `GET /v1/admin/validation` returns aggregates over these geophysical/model
 * records only; there is no row-level *user* data to return even in
 * principle, by construction.
 */

// --- Prediction records (backend/data/predictions.jsonl) ---

/** Per-spot slice of a prediction tick. Deliberately just {spotId, score} --
 * NOT a per-spot best-window anymore (see PredictionRecord.bestWindow below)
 * -- to keep each line small: with ~28 spots and a default 5-minute
 * REFRESH_MS, per-spot windows alone would roughly double this record's size
 * for information the report never actually uses (only the ranked #1 spot's
 * window is ever meaningful for "when to go"). */
export type PredictionSpotRecord = {
  spotId: string;
  score: number;
};

/** One record per successful snapshot refresh, tagged with the Oslo "night"
 * it belongs to (see getNightKey in alerts.ts -- before 06:00 local, still
 * the night that started the previous evening). Multiple refreshes a night
 * are expected and wanted: they trace the intra-night trajectory of the
 * prediction as clouds/KP forecasts change. Deliberately excludes any raw
 * upstream payload (MET/NOAA responses) -- only the derived score/window
 * inputs our own model actually used. */
export type PredictionRecord = {
  recordedAt: string;
  nightKey: string;
  kp: {
    current: number;
    tonightPeak: number;
    peakNext12h: number;
  };
  spots: PredictionSpotRecord[];
  /** The ranked #1 spot's (i.e. `spots[0]`'s) best-window for this tick --
   * kept once at the top level instead of once per spot (see
   * PredictionSpotRecord above). */
  bestWindow: {
    start: string;
    end: string;
  };
  dataQuality: DataQuality;
  seasonClosed: boolean;
};

// --- Observed-outcome records (backend/data/observed.jsonl) ---

/** Per-night observed summary: the max NOAA-measured planetary Kp during
 * that Oslo night's dark hours (see computeObservedMaxKp's window comment).
 * `maxKp: null` means we gave up without ever getting a value -- either a
 * persistently failing/empty NOAA fetch across the whole backfill window, or
 * (in principle) a parse failure -- recorded as "unknown" rather than never
 * writing a record at all, so this trigger doesn't chase the same night
 * forever. See maybeRecordObservedOutcome for the retry/backfill policy. */
export type ObservedNightRecord = {
  nightKey: string;
  recordedAt: string;
  maxKp: number | null;
  source: 'noaa_measured_3h' | 'unknown';
};

const PREDICTIONS_PATH = path.resolve(process.cwd(), 'data/predictions.jsonl');
const OBSERVED_PATH = path.resolve(process.cwd(), 'data/observed.jsonl');
const VALIDATION_STATE_PATH = path.resolve(process.cwd(), 'data/validation-state.json');

// NOAA's 3-hourly "official" planetary K-index product (a rolling ~7 day
// window at the time this was written), used here as the *measured/observed*
// counterpart to sources.ts's KP_FORECAST_URL. Deliberately NOT
// planetary_k_index_1m.json (also used by sources.ts, for "current" Kp): that
// product only carries a rolling few hours of 1-minute data, nowhere near
// enough lookback for this trigger, which fires once a night is fully over
// (i.e. up to ~24-40h after the data point we need) -- see
// maybeRecordObservedOutcome below.
const KP_OBSERVED_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

// Expected growth (backend/data/predictions.jsonl): ~1.5 KB/line (28 spots x
// ~40 bytes each for {spotId, score} + kp/bestWindow/dataQuality/nightKey
// overhead) x 288 ticks/day (default 5-minute REFRESH_MS) ~= 0.4 MB/day ~=
// ~170 MB at the full 400-day retention window below. observed.jsonl and
// validation-state.json are both ~1 row/night, so negligible by comparison.
// Ops note: lower VALIDATION_RETENTION_DAYS if disk is a concern.
const DEFAULT_VALIDATION_RETENTION_DAYS = 400; // one full season plus slack
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "Definitively over" trigger hour (Oslo local) -- reuses alerts.ts's
// quiet-hours-end convention (01:00-16:00 is quiet; 16:00 is safely past both
// the previous night's dark hours (ending ~06:00) and NOAA's own reporting
// lag for the last 3-hour bin of that night.
const OBSERVED_TRIGGER_HOUR = 16;

// How many days a pending night is retried before we give up and record a
// permanent {maxKp: null, source: 'unknown'} outcome. NOAA's 3-hourly product
// carries a rolling ~7-day window (see KP_OBSERVED_URL above); 6 days keeps
// every backfill attempt safely inside that window with a day of slack.
const BACKFILL_MAX_AGE_DAYS = 6;

// Rough proxy thresholds until real sighting-report data exists (see the task
// brief): the alert engine's lower tier (alerts.ts's ALERT_TIERS 'ge45'), and
// a Kp level commonly associated with aurora being visible as far south as
// Tromso.
const ALERT_SCORE_THRESHOLD = 45;
const KP_HIT_THRESHOLD = 4;

/** Reads VALIDATION_RETENTION_DAYS per-call (not cached at import time),
 * mirroring usageStore.ts's USAGE_RETENTION_DAYS / store.ts's
 * STALE_SNAPSHOT_MS pattern: missing/invalid -> silently fall back to the
 * documented default rather than failing startup. */
function getValidationRetentionDays(): number {
  const raw = Number(process.env.VALIDATION_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_VALIDATION_RETENTION_DAYS;
}

// --- Per-file write serialization (FIX 3) ---
//
// refreshSnapshot() can run concurrently (the background interval and the
// admin-triggered POST /v1/admin/refresh can overlap), and the retention
// sweep's read-filter-rewrite is a read-modify-write that must not interleave
// with a concurrent append (which would otherwise be silently dropped by the
// sweep's stale read). Every operation on a given file (predictions.jsonl,
// observed.jsonl, validation-state.json) is funneled through this in-process
// per-path promise chain so they always run one at a time, in call order.
// Swallow-safe: a failing operation is caught here so it can never poison the
// chain for later operations on the same file.
const fileMutexes = new Map<string, Promise<unknown>>();

async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previousTail = fileMutexes.get(filePath) ?? Promise.resolve();
  const settledPrevious = previousTail.catch(() => {});
  const result = settledPrevious.then(operation);
  fileMutexes.set(filePath, result.catch(() => {}));
  return result;
}

// --- Building + appending prediction records ---

/** Pure: turns a snapshot into the small record we persist. Exported for
 * testability (mirrors alerts.ts's evaluateAlertTriggers being pulled out of
 * the impure checkAlertTriggers). */
export function buildPredictionRecord(snapshot: TonightSnapshot, now: Clock = Date.now): PredictionRecord {
  const nowMs = now();
  const bestSpot = snapshot.rankings[0];
  const fallbackWindow = new Date(nowMs).toISOString();

  return {
    recordedAt: new Date(nowMs).toISOString(),
    nightKey: getNightKey(nowMs),
    kp: {
      current: snapshot.kp.current,
      tonightPeak: snapshot.kp.tonightPeak,
      peakNext12h: snapshot.kp.peakNext12h
    },
    spots: snapshot.rankings.map((spot) => ({
      spotId: spot.spotId,
      score: spot.score
    })),
    bestWindow: bestSpot
      ? { start: bestSpot.bestWindowStart, end: bestSpot.bestWindowEnd }
      : { start: fallbackWindow, end: fallbackWindow },
    dataQuality: snapshot.dataQuality,
    seasonClosed: snapshot.darkness.seasonClosed
  };
}

function isPredictionRecord(value: unknown): value is PredictionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PredictionRecord>;
  return (
    typeof record.recordedAt === 'string' &&
    typeof record.nightKey === 'string' &&
    Array.isArray(record.spots) &&
    typeof record.kp === 'object' &&
    record.kp !== null &&
    typeof record.dataQuality === 'object' &&
    record.dataQuality !== null &&
    typeof record.seasonClosed === 'boolean'
  );
}

function isObservedNightRecord(value: unknown): value is ObservedNightRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ObservedNightRecord>;
  return (
    typeof record.nightKey === 'string' &&
    typeof record.recordedAt === 'string' &&
    (record.maxKp === null || typeof record.maxKp === 'number') &&
    typeof record.source === 'string'
  );
}

async function appendJsonlRecord(filePath: string, record: unknown): Promise<void> {
  await withFileLock(filePath, async () => {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  });
}

async function readJsonlFile<T>(filePath: string, isValid: (value: unknown) => value is T): Promise<T[]> {
  return withFileLock(filePath, async () => {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as unknown;
          } catch {
            return null; // malformed line (e.g. a torn write) -- skip, don't crash
          }
        })
        .filter((value): value is T => value !== null && isValid(value));
    } catch {
      return []; // missing file (nothing recorded yet) -- start empty, no crash
    }
  });
}

/** Reads and parses backend/data/predictions.jsonl, tolerating malformed or
 * torn lines (skipped, not thrown). */
export async function readPredictionRecords(): Promise<PredictionRecord[]> {
  return readJsonlFile(PREDICTIONS_PATH, isPredictionRecord);
}

/** Reads and parses backend/data/observed.jsonl, same tolerance as
 * readPredictionRecords. */
export async function readObservedRecords(): Promise<ObservedNightRecord[]> {
  return readJsonlFile(OBSERVED_PATH, isObservedNightRecord);
}

async function writeLinesAtomicUnlocked(filePath: string, lines: string[]): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  const content = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);
}

/** epoch-ms age of a "YYYY-MM-DD" night key, treated as UTC midnight. Used
 * both for retention (400-day window) and for the observed-outcome backfill
 * cutoff (6-day window) -- NOT for any dark-hours computation (see
 * computeObservedMaxKp for that, which works in real Oslo-local wall-clock
 * time). A malformed key is treated as "infinitely old" so it gets pruned
 * rather than silently kept forever. */
function nightKeyAgeMs(nightKey: string, nowMs: number): number {
  const parsed = Date.parse(`${nightKey}T00:00:00Z`);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : nowMs - parsed;
}

/** Rewrites `filePath` (JSONL, one record per line, every record shape with
 * a `nightKey` field) dropping any line older than VALIDATION_RETENTION_DAYS
 * or whose `nightKey` doesn't parse -- following usageStore.ts's
 * pruneExpiredBuckets pattern, but operating on a JSONL file instead of an
 * in-memory Map. No-ops (no rewrite) when nothing needs pruning. The whole
 * read-filter-rewrite runs under this file's lock (FIX 3) so a concurrent
 * append can never be read mid-sweep and then silently dropped by the
 * rewrite. */
async function pruneJsonlFileByNightKey(filePath: string, now: Clock): Promise<void> {
  await withFileLock(filePath, async () => {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      return; // nothing to prune yet
    }

    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const nowMs = now();
    const retentionMs = getValidationRetentionDays() * MS_PER_DAY;

    const kept = lines.filter((line) => {
      try {
        const parsed = JSON.parse(line) as { nightKey?: unknown };
        if (typeof parsed?.nightKey !== 'string') return false;
        return nightKeyAgeMs(parsed.nightKey, nowMs) <= retentionMs;
      } catch {
        return false;
      }
    });

    if (kept.length === lines.length) return;
    await writeLinesAtomicUnlocked(filePath, kept);
  });
}

// --- validation-state.json: per-night tracking for the backfill loop ---
//
// Same pattern as alerts.ts's alerts-state.json: a tiny JSON mirror, atomic
// write, "load on first use" rather than requiring an explicit boot-time load
// call. Tracks, per nightKey: whether a prediction was ever recorded for it
// (`hasPrediction`), whether its observed outcome is settled (`recorded`) or
// still being retried (`pending`), and the last Oslo calendar day we
// attempted a backfill fetch for it (`lastAttemptDayKey`, null before the
// first attempt) -- see maybeRecordObservedOutcome below for how these three
// fields drive the retry/give-up policy (FIX 1).
//
// PRIVACY: same as predictions.jsonl/observed.jsonl -- nightKeys and our own
// model/NOAA-derived state only, zero user data.
export type ValidationStateEntry = {
  hasPrediction: boolean;
  observedStatus: 'recorded' | 'pending';
  lastAttemptDayKey: string | null;
};

type ValidationState = {
  updatedAt: string;
  nights: Record<string, ValidationStateEntry>;
};

function emptyValidationState(): ValidationState {
  return { updatedAt: new Date().toISOString(), nights: {} };
}

// In-memory cache, loaded from disk at most once per process (subsequent
// access reuses this object -- all mutation happens through mutateValidationState,
// which holds VALIDATION_STATE_PATH's file lock for the full load+mutate+persist
// span so concurrent callers can never interleave a stale read with a write).
let cachedValidationState: ValidationState | null = null;

async function readValidationStateFromDiskUnlocked(): Promise<ValidationState> {
  try {
    const raw = await fs.readFile(VALIDATION_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ValidationState>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.nights !== 'object' || parsed.nights === null) {
      throw new Error('Malformed validation-state.json');
    }
    return {
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      nights: parsed.nights as Record<string, ValidationStateEntry>
    };
  } catch {
    return emptyValidationState(); // missing/corrupt mirror -> start empty, no crash
  }
}

async function writeValidationStateToDiskUnlocked(state: ValidationState): Promise<void> {
  const dir = path.dirname(VALIDATION_STATE_PATH);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${VALIDATION_STATE_PATH}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, VALIDATION_STATE_PATH);
}

/** Read-only snapshot of the current validation state (loads from disk into
 * the cache on first call only). */
async function getValidationStateSnapshot(): Promise<ValidationState> {
  return withFileLock(VALIDATION_STATE_PATH, async () => {
    if (!cachedValidationState) {
      cachedValidationState = await readValidationStateFromDiskUnlocked();
    }
    return cachedValidationState;
  });
}

/** Loads (if not already cached), applies `mutator` synchronously, and
 * persists -- all under a single acquisition of VALIDATION_STATE_PATH's file
 * lock, so no other caller can observe or persist a half-updated state. */
async function mutateValidationState<T>(mutator: (state: ValidationState) => T): Promise<T> {
  return withFileLock(VALIDATION_STATE_PATH, async () => {
    if (!cachedValidationState) {
      cachedValidationState = await readValidationStateFromDiskUnlocked();
    }
    const result = mutator(cachedValidationState);
    cachedValidationState.updatedAt = new Date().toISOString();
    await writeValidationStateToDiskUnlocked(cachedValidationState);
    return result;
  });
}

async function markNightHasPrediction(nightKey: string): Promise<void> {
  await mutateValidationState((state) => {
    const existing = state.nights[nightKey];
    if (existing) {
      existing.hasPrediction = true;
    } else {
      state.nights[nightKey] = { hasPrediction: true, observedStatus: 'pending', lastAttemptDayKey: null };
    }
  });
}

async function markNightRecorded(nightKey: string, todayDayKey: string): Promise<void> {
  await mutateValidationState((state) => {
    const existing = state.nights[nightKey] ?? { hasPrediction: true, observedStatus: 'pending', lastAttemptDayKey: null };
    existing.observedStatus = 'recorded';
    existing.lastAttemptDayKey = todayDayKey;
    state.nights[nightKey] = existing;
  });
}

async function markNightAttempted(nightKey: string, todayDayKey: string): Promise<void> {
  await mutateValidationState((state) => {
    const existing = state.nights[nightKey];
    if (existing) {
      existing.lastAttemptDayKey = todayDayKey;
    }
  });
}

/** Test-only hook: clears the in-memory validation-state cache and its
 * on-disk mirror, mirroring alerts.ts's setAlertStateForTests. Needed
 * because state is cached in module memory across calls -- without this,
 * tests that reset predictions.jsonl/observed.jsonl on disk would still see
 * stale hasPrediction/observedStatus state left over from earlier test
 * cases. */
export async function resetValidationStateForTests(): Promise<void> {
  await withFileLock(VALIDATION_STATE_PATH, async () => {
    cachedValidationState = null;
  });
  await fs.rm(VALIDATION_STATE_PATH, { force: true });
}

// Retention sweeps rewrite the whole file, so they're throttled to at most
// once per Oslo calendar day (module-scope state, reset only by process
// restart) rather than run on every refresh tick -- a 5-minute REFRESH_MS
// would otherwise mean rewriting a potentially large predictions.jsonl every
// few minutes for no benefit, since the retention window is 400 days.
let lastRetentionSweepDayKey: string | null = null;

async function maybeRunRetentionSweep(now: Clock): Promise<void> {
  const dayKey = getOsloDayKey(new Date(now()));
  if (lastRetentionSweepDayKey === dayKey) return;
  lastRetentionSweepDayKey = dayKey;

  try {
    await pruneJsonlFileByNightKey(PREDICTIONS_PATH, now);
    await pruneJsonlFileByNightKey(OBSERVED_PATH, now);
    await mutateValidationState((state) => {
      const nowMs = now();
      const retentionMs = getValidationRetentionDays() * MS_PER_DAY;
      for (const nightKey of Object.keys(state.nights)) {
        if (nightKeyAgeMs(nightKey, nowMs) > retentionMs) {
          delete state.nights[nightKey];
        }
      }
    });
  } catch (error) {
    console.warn(
      '[validation] retention sweep failed; predictions/observed/state files left as-is.',
      error instanceof Error ? error.message : error
    );
  }
}

/** Appends one prediction record for `snapshot`, marks its night as having a
 * prediction (validation-state.json), then (at most once per calendar day)
 * runs the retention sweep. */
export async function recordPrediction(snapshot: TonightSnapshot, now: Clock = Date.now): Promise<void> {
  const record = buildPredictionRecord(snapshot, now);
  await appendJsonlRecord(PREDICTIONS_PATH, record);
  await markNightHasPrediction(record.nightKey);
  await maybeRunRetentionSweep(now);
}

// --- Observed outcome: fetch NOAA's measured Kp for a completed night ---

/** Ensures a NOAA `time_tag` (observed live without a trailing 'Z' or
 * explicit offset) parses as UTC rather than the ambiguous "local time" some
 * JS engines apply to offset-less date-time strings. NOAA's own values are
 * always UTC. */
function normalizeNoaaTimeTag(raw: string): string {
  return /Z$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
}

/** Parses one entry of NOAA's 3-hourly planetary-Kp product into a plain
 * {timeIso, kp} pair, or null if the entry doesn't look like a Kp reading at
 * all. Accepts both the live object shape ({time_tag, Kp, ...}) and a legacy
 * array shape ([time, kp, ...]) defensively, since sources.ts's equivalent
 * parsers for the *forecast* product have historically had to handle both. */
export function parseObservedKpEntry(entry: unknown): { timeIso: string; kp: number } | null {
  if (Array.isArray(entry)) {
    const timeRaw = entry[0];
    const kpRaw = Number(entry[1]);
    if (typeof timeRaw !== 'string' || !Number.isFinite(kpRaw)) return null;
    return { timeIso: normalizeNoaaTimeTag(timeRaw), kp: kpRaw };
  }

  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;

  const timeRaw = record.time_tag ?? record.time;
  if (typeof timeRaw !== 'string') return null;

  const kpCandidateKeys = ['Kp', 'kp', 'kp_index', 'kP'] as const;
  for (const key of kpCandidateKeys) {
    const kpRaw = Number(record[key]);
    if (Number.isFinite(kpRaw)) {
      return { timeIso: normalizeNoaaTimeTag(timeRaw), kp: kpRaw };
    }
  }
  return null;
}

/** Max Kp among entries falling inside `nightKey`'s Oslo-local dark-hours
 * window: local hour >= 18 (evening of `nightKey`) OR local hour < 6 (early
 * morning of the following day). Deliberately `< 6`, NOT `<= 6` -- this is
 * the exact complement of alerts.ts's `getNightKey`, which only rolls a tick
 * back to the previous night when its local hour is `< 6` (a tick at exactly
 * 06:00 is tagged as belonging to the *new* night, not the one ending). Using
 * `<= 6` here would have made a 06:00 NOAA reading count towards a night that
 * a same-time prediction tick would never itself be tagged with -- see the
 * task's FIX 2. */
export function computeObservedMaxKp(entries: Array<{ timeIso: string; kp: number }>, nightKey: string): number | null {
  const nextDayKey = addDaysToDayKey(nightKey, 1);

  const values = entries
    .map((entry) => {
      const parts = getOsloParts(entry.timeIso);
      if (!parts) return null;
      const inWindow = (parts.dayKey === nightKey && parts.hour >= 18) || (parts.dayKey === nextDayKey && parts.hour < 6);
      return inWindow ? entry.kp : null;
    })
    .filter((value): value is number => value !== null);

  return values.length > 0 ? Math.max(...values) : null;
}

/** Fetches NOAA's measured 3-hourly Kp payload and returns it parsed into
 * {timeIso, kp} pairs, or null on ANY failure (network, non-2xx, unparseable
 * payload). Never throws, following sources.ts's resilient-source-call
 * discipline. Kept separate from a per-night helper so a single fetch can be
 * shared across every pending night considered in one maybeRecordObservedOutcome
 * call (see below) rather than re-fetching the same payload per night. */
async function fetchObservedKpEntries(fetchImpl: FetchLike): Promise<Array<{ timeIso: string; kp: number }> | null> {
  try {
    const response = await fetchWithTimeout(fetchImpl, KP_OBSERVED_URL);
    if (!response.ok) {
      throw new Error(`NOAA observed Kp fetch failed (${response.status})`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Unexpected observed Kp response format.');
    }

    return payload
      .map((entry) => parseObservedKpEntry(entry))
      .filter((entry): entry is { timeIso: string; kp: number } => entry !== null);
  } catch {
    return null;
  }
}

/** Convenience single-night wrapper around fetchObservedKpEntries +
 * computeObservedMaxKp -- exported for direct testability/reuse, not used by
 * maybeRecordObservedOutcome itself (which shares one fetch across every
 * pending night it processes). */
export async function fetchObservedKpForNight(
  nightKey: string,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<number | null> {
  const entries = await fetchObservedKpEntries(fetchImpl);
  if (entries === null) return null;
  return computeObservedMaxKp(entries, nightKey);
}

/**
 * Once per refresh cycle, once it's past 16:00 Oslo: attempts a backfill for
 * EVERY pending night (`hasPrediction: true`, `observedStatus: 'pending'`)
 * strictly before today (the current/still-open night is never touched here
 * -- its dark hours haven't finished yet), at most one fetch attempt per
 * pending night per Oslo calendar day (`lastAttemptDayKey` guard).
 *
 * Nights within BACKFILL_MAX_AGE_DAYS (6, safely inside NOAA's ~7-day 3-hourly
 * retention -- see KP_OBSERVED_URL): a shared NOAA fetch is made (once per
 * call, reused for every such night) and, on success, each night's own max-Kp
 * is computed from the same payload and recorded; on failure the night stays
 * pending; the `pending` night with no Kp value at all yet in the window
 * (upstream just hasn't caught up) also stays pending. Nights older than 6
 * days give up unconditionally (no network call needed) and get a permanent
 * {maxKp: null, source: 'unknown'} record instead -- worst case (a week-long
 * NOAA outage) this is <=~6 fetches/day, bounded by BACKFILL_MAX_AGE_DAYS.
 *
 * Never reads predictions.jsonl -- "has a prediction" is tracked entirely via
 * validation-state.json (kept up to date by recordPrediction), so this stays
 * cheap even once predictions.jsonl has grown large.
 */
export async function maybeRecordObservedOutcome(
  options: { now?: Clock; fetchImpl?: FetchLike } = {}
): Promise<{ recorded: boolean; nightKey?: string }> {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const nowMs = now();
  const osloParts = getOsloParts(new Date(nowMs));
  if (!osloParts || osloParts.hour < OBSERVED_TRIGGER_HOUR) {
    return { recorded: false };
  }
  const todayDayKey = osloParts.dayKey;

  const state = await getValidationStateSnapshot();
  const pendingNightKeys = Object.entries(state.nights)
    .filter(([nightKey, entry]) => entry.hasPrediction && entry.observedStatus === 'pending' && nightKey < todayDayKey)
    .map(([nightKey]) => nightKey);

  if (pendingNightKeys.length === 0) {
    return { recorded: false };
  }

  let lastRecordedNightKey: string | undefined;

  // Nights past the backfill window: give up permanently, no network call.
  const expiredNightKeys = pendingNightKeys.filter(
    (nightKey) => nightKeyAgeMs(nightKey, nowMs) > BACKFILL_MAX_AGE_DAYS * MS_PER_DAY
  );
  for (const nightKey of expiredNightKeys) {
    await appendJsonlRecord(OBSERVED_PATH, {
      nightKey,
      recordedAt: new Date(nowMs).toISOString(),
      maxKp: null,
      source: 'unknown'
    } satisfies ObservedNightRecord);
    await markNightRecorded(nightKey, todayDayKey);
    lastRecordedNightKey = nightKey;
  }

  // Nights still within the window, not yet attempted today.
  const attemptableNightKeys = pendingNightKeys.filter(
    (nightKey) => !expiredNightKeys.includes(nightKey) && state.nights[nightKey].lastAttemptDayKey !== todayDayKey
  );

  if (attemptableNightKeys.length > 0) {
    const entries = await fetchObservedKpEntries(fetchImpl);

    for (const nightKey of attemptableNightKeys) {
      await markNightAttempted(nightKey, todayDayKey);
      if (entries === null) continue; // fetch failed -- stays pending, retried next Oslo day

      const maxKp = computeObservedMaxKp(entries, nightKey);
      if (maxKp === null) continue; // no reading fell in this night's window yet -- stays pending

      await appendJsonlRecord(OBSERVED_PATH, {
        nightKey,
        recordedAt: new Date(nowMs).toISOString(),
        maxKp,
        source: 'noaa_measured_3h'
      } satisfies ObservedNightRecord);
      await markNightRecorded(nightKey, todayDayKey);
      lastRecordedNightKey = nightKey;
    }
  }

  return lastRecordedNightKey ? { recorded: true, nightKey: lastRecordedNightKey } : { recorded: false };
}

/**
 * The single entry point called from server.ts's refreshSnapshot(), after
 * checkAlertTriggers. Both steps are independently guarded so a failure in
 * one (e.g. a NOAA outage) can never block the other or the refresh itself.
 */
export async function recordValidationTick(
  snapshot: TonightSnapshot,
  options: { now?: Clock; fetchImpl?: FetchLike } = {}
): Promise<void> {
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  try {
    await recordPrediction(snapshot, now);
  } catch (error) {
    console.warn('[validation] recordPrediction failed.', error instanceof Error ? error.message : error);
  }

  try {
    await maybeRecordObservedOutcome({ now, fetchImpl });
  } catch (error) {
    console.warn('[validation] maybeRecordObservedOutcome failed.', error instanceof Error ? error.message : error);
  }
}

// --- Skill report: joins predictions + observed outcomes ---

const CALIBRATION_BANDS: ReadonlyArray<{ label: string; minScore: number; maxScore: number }> = [
  { label: '0-19', minScore: 0, maxScore: 19 },
  { label: '20-39', minScore: 20, maxScore: 39 },
  { label: '40-59', minScore: 40, maxScore: 59 },
  { label: '60-79', minScore: 60, maxScore: 79 },
  { label: '80-100', minScore: 80, maxScore: 100 }
];

export type ValidationCalibrationBand = {
  label: string;
  minScore: number;
  maxScore: number;
  /** Number of nights whose best predicted score fell in this band AND that
   * have a (non-null) observed outcome. */
  nights: number;
  meanObservedMaxKp: number | null;
  /** The observed max-Kp values themselves (one per qualifying night),
   * sorted ascending -- a small enough list per band to double as "the
   * distribution", per the task brief. */
  observedMaxKpValues: number[];
};

export type ValidationHitRate = {
  alertThreshold: number;
  kpHitThreshold: number;
  nightsPredictedAboveThreshold: number;
  nightsWithHit: number;
  hitRate: number | null;
};

export type ValidationReport = {
  generatedAt: string;
  totalNightsWithPrediction: number;
  totalNightsWithObservedOutcome: number;
  bands: ValidationCalibrationBand[];
  hitRate: ValidationHitRate;
};

/**
 * Pure (like scoring.ts / evaluateAlertTriggers): joins prediction ticks and
 * observed-outcome records purely in memory, no I/O. A night's "predicted
 * score" is the best (max) spot score seen across every tick recorded for
 * that night -- the same "best spot tonight" headline the alerts engine and
 * `tonightScore` use, just maximized over the whole night's trajectory
 * rather than a single tick.
 */
export function computeValidationReport(
  predictions: PredictionRecord[],
  observed: ObservedNightRecord[],
  now: Clock = Date.now
): ValidationReport {
  const bestScoreByNight = new Map<string, number>();
  for (const record of predictions) {
    const bestInTick = record.spots.reduce((max, spot) => Math.max(max, spot.score), 0);
    const prior = bestScoreByNight.get(record.nightKey);
    bestScoreByNight.set(record.nightKey, prior === undefined ? bestInTick : Math.max(prior, bestInTick));
  }

  const observedMaxKpByNight = new Map<string, number>();
  for (const record of observed) {
    if (typeof record.maxKp === 'number') {
      observedMaxKpByNight.set(record.nightKey, record.maxKp);
    }
  }

  const bands: ValidationCalibrationBand[] = CALIBRATION_BANDS.map((band) => {
    const values: number[] = [];
    for (const [nightKey, bestScore] of bestScoreByNight.entries()) {
      if (bestScore < band.minScore || bestScore > band.maxScore) continue;
      const observedMaxKp = observedMaxKpByNight.get(nightKey);
      if (observedMaxKp === undefined) continue;
      values.push(observedMaxKp);
    }
    values.sort((a, b) => a - b);
    const mean = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

    return {
      label: band.label,
      minScore: band.minScore,
      maxScore: band.maxScore,
      nights: values.length,
      meanObservedMaxKp: mean === null ? null : Number(mean.toFixed(2)),
      observedMaxKpValues: values
    };
  });

  let nightsPredictedAboveThreshold = 0;
  let nightsWithHit = 0;
  for (const [nightKey, bestScore] of bestScoreByNight.entries()) {
    if (bestScore < ALERT_SCORE_THRESHOLD) continue;
    const observedMaxKp = observedMaxKpByNight.get(nightKey);
    if (observedMaxKp === undefined) continue;
    nightsPredictedAboveThreshold += 1;
    if (observedMaxKp >= KP_HIT_THRESHOLD) nightsWithHit += 1;
  }

  return {
    generatedAt: new Date(now()).toISOString(),
    totalNightsWithPrediction: bestScoreByNight.size,
    totalNightsWithObservedOutcome: observedMaxKpByNight.size,
    bands,
    hitRate: {
      alertThreshold: ALERT_SCORE_THRESHOLD,
      kpHitThreshold: KP_HIT_THRESHOLD,
      nightsPredictedAboveThreshold,
      nightsWithHit,
      hitRate:
        nightsPredictedAboveThreshold > 0 ? Number((nightsWithHit / nightsPredictedAboveThreshold).toFixed(3)) : null
    }
  };
}

/** Read side, gated by the SAME admin-token check as POST /v1/admin/refresh
 * and GET /v1/stats/usage. Aggregates only -- see the file header's PRIVACY
 * note. */
export function registerValidationRoutes(app: FastifyInstance, adminToken: string): void {
  app.get('/v1/admin/validation', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!adminToken || request.headers['x-admin-token'] !== adminToken) {
      reply.code(401);
      return { ok: false, message: 'Unauthorized' };
    }

    const [predictions, observed] = await Promise.all([readPredictionRecords(), readObservedRecords()]);
    return computeValidationReport(predictions, observed);
  });
}
