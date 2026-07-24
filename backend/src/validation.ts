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

export type PredictionSpotRecord = {
  spotId: string;
  score: number;
  bestWindowStart: string;
  bestWindowEnd: string;
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
  dataQuality: DataQuality;
  seasonClosed: boolean;
};

// --- Observed-outcome records (backend/data/observed.jsonl) ---

/** Per-night observed summary: the max NOAA-measured planetary Kp during
 * that Oslo night's dark hours (18:00 -> 06:00 local, matching sources.ts's
 * parseTonightPeak window). `maxKp: null` means the fetch/parse failed --
 * recorded as "unknown" rather than never writing a record at all, so a
 * flaky upstream doesn't cause this trigger to retry forever on every
 * refresh tick for the same night. */
export type ObservedNightRecord = {
  nightKey: string;
  recordedAt: string;
  maxKp: number | null;
  source: 'noaa_measured_3h' | 'unknown';
};

const PREDICTIONS_PATH = path.resolve(process.cwd(), 'data/predictions.jsonl');
const OBSERVED_PATH = path.resolve(process.cwd(), 'data/observed.jsonl');

// NOAA's 3-hourly "official" planetary K-index product (a rolling ~7 day
// window at the time this was written), used here as the *measured/observed*
// counterpart to sources.ts's KP_FORECAST_URL. Deliberately NOT
// planetary_k_index_1m.json (also used by sources.ts, for "current" Kp): that
// product only carries a rolling few hours of 1-minute data, nowhere near
// enough lookback for this trigger, which fires once a night is fully over
// (i.e. up to ~24-40h after the data point we need) -- see
// maybeRecordObservedOutcome below.
const KP_OBSERVED_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

const DEFAULT_VALIDATION_RETENTION_DAYS = 400; // one full season plus slack
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "Definitively over" trigger hour (Oslo local) -- reuses alerts.ts's
// quiet-hours-end convention (01:00-16:00 is quiet; 16:00 is safely past both
// the previous night's dark hours (ending ~06:00) and NOAA's own reporting
// lag for the last 3-hour bin of that night.
const OBSERVED_TRIGGER_HOUR = 16;

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

// --- Building + appending prediction records ---

/** Pure: turns a snapshot into the small record we persist. Exported for
 * testability (mirrors alerts.ts's evaluateAlertTriggers being pulled out of
 * the impure checkAlertTriggers). */
export function buildPredictionRecord(snapshot: TonightSnapshot, now: Clock = Date.now): PredictionRecord {
  return {
    recordedAt: new Date(now()).toISOString(),
    nightKey: getNightKey(now()),
    kp: {
      current: snapshot.kp.current,
      tonightPeak: snapshot.kp.tonightPeak,
      peakNext12h: snapshot.kp.peakNext12h
    },
    spots: snapshot.rankings.map((spot) => ({
      spotId: spot.spotId,
      score: spot.score,
      bestWindowStart: spot.bestWindowStart,
      bestWindowEnd: spot.bestWindowEnd
    })),
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
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

async function readJsonlFile<T>(filePath: string, isValid: (value: unknown) => value is T): Promise<T[]> {
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

async function writeLinesAtomic(filePath: string, lines: string[]): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  const content = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);
}

/** epoch-ms age of a "YYYY-MM-DD" night key, treated as UTC midnight for
 * retention purposes only (not used for any dark-hours computation). A
 * malformed key is treated as "infinitely old" so it gets pruned rather than
 * silently kept forever. */
function nightKeyAgeMs(nightKey: string, nowMs: number): number {
  const parsed = Date.parse(`${nightKey}T00:00:00Z`);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : nowMs - parsed;
}

/** Rewrites `filePath` (JSONL, one record per line, every record shape with
 * a `nightKey` field) dropping any line older than VALIDATION_RETENTION_DAYS
 * or whose `nightKey` doesn't parse -- following usageStore.ts's
 * pruneExpiredBuckets pattern, but operating on a JSONL file instead of an
 * in-memory Map. No-ops (no rewrite) when nothing needs pruning. */
async function pruneJsonlFileByNightKey(filePath: string, now: Clock): Promise<void> {
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
  await writeLinesAtomic(filePath, kept);
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
  } catch (error) {
    console.warn(
      '[validation] retention sweep failed; predictions/observed files left as-is.',
      error instanceof Error ? error.message : error
    );
  }
}

/** Appends one prediction record for `snapshot`, then (at most once per
 * calendar day) runs the retention sweep. */
export async function recordPrediction(snapshot: TonightSnapshot, now: Clock = Date.now): Promise<void> {
  const record = buildPredictionRecord(snapshot, now);
  await appendJsonlRecord(PREDICTIONS_PATH, record);
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
 * window (18:00 -> 06:00 the next day, same convention as
 * sources.ts's parseTonightPeak), or null if none fall in the window. */
export function computeObservedMaxKp(entries: Array<{ timeIso: string; kp: number }>, nightKey: string): number | null {
  const nextDayKey = addDaysToDayKey(nightKey, 1);

  const values = entries
    .map((entry) => {
      const parts = getOsloParts(entry.timeIso);
      if (!parts) return null;
      const inWindow = (parts.dayKey === nightKey && parts.hour >= 18) || (parts.dayKey === nextDayKey && parts.hour <= 6);
      return inWindow ? entry.kp : null;
    })
    .filter((value): value is number => value !== null);

  return values.length > 0 ? Math.max(...values) : null;
}

/** Fetches NOAA's measured 3-hourly Kp and returns the max value observed
 * during `nightKey`'s dark hours -- or null on ANY failure (network,
 * non-2xx, unparseable payload). Never throws, following sources.ts's
 * resilient-source-call discipline. */
export async function fetchObservedKpForNight(
  nightKey: string,
  fetchImpl: FetchLike = globalThis.fetch
): Promise<number | null> {
  try {
    const response = await fetchWithTimeout(fetchImpl, KP_OBSERVED_URL);
    if (!response.ok) {
      throw new Error(`NOAA observed Kp fetch failed (${response.status})`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Unexpected observed Kp response format.');
    }

    const entries = payload
      .map((entry) => parseObservedKpEntry(entry))
      .filter((entry): entry is { timeIso: string; kp: number } => entry !== null);

    return computeObservedMaxKp(entries, nightKey);
  } catch {
    return null;
  }
}

/** The Oslo-local night that just ended, relative to `nowMs` -- only
 * meaningful once `nowMs` is past OBSERVED_TRIGGER_HOUR (i.e. definitely
 * daytime, well after the night's dark hours ended around 06:00). */
function getPreviousNightKey(nowMs: number): string | null {
  const parts = getOsloParts(new Date(nowMs));
  if (!parts) return null;
  return addDaysToDayKey(parts.dayKey, -1);
}

/**
 * Once per refresh cycle: if it's past 16:00 Oslo (the previous night is
 * definitively over), the previous night has a prediction recorded but no
 * observed-outcome record yet, fetch + record NOAA's measured Kp for it.
 * Checks the (small, ~1 row/night) observed.jsonl first and only reads the
 * (potentially much larger) predictions.jsonl if there's no observed record
 * yet, so a mid-evening no-op tick stays cheap.
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

  const previousNightKey = getPreviousNightKey(nowMs);
  if (!previousNightKey) {
    return { recorded: false };
  }

  const observed = await readObservedRecords();
  const alreadyObserved = observed.some((record) => record.nightKey === previousNightKey);
  if (alreadyObserved) {
    return { recorded: false };
  }

  const predictions = await readPredictionRecords();
  const hasPrediction = predictions.some((record) => record.nightKey === previousNightKey);
  if (!hasPrediction) {
    return { recorded: false };
  }

  const maxKp = await fetchObservedKpForNight(previousNightKey, fetchImpl);

  const record: ObservedNightRecord = {
    nightKey: previousNightKey,
    recordedAt: new Date(nowMs).toISOString(),
    maxKp,
    source: maxKp === null ? 'unknown' : 'noaa_measured_3h'
  };

  await appendJsonlRecord(OBSERVED_PATH, record);
  return { recorded: true, nightKey: previousNightKey };
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
