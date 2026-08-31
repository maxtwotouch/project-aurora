import { promises as fs } from 'node:fs';
import path from 'node:path';

import * as jpegjs from 'jpeg-js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { fetchWithTimeout, getOsloDayKey } from './sources.js';
import type { Clock, FetchLike } from './sources.js';
import { solarElevationDeg } from './solar.js';
import {
  ANALYSIS_TARGET_WIDTH,
  DARKNESS_ELEVATION_DEG,
  DEFAULT_GREEN_THRESHOLD,
  FRAME_SAVE_JPEG_QUALITY,
  FRAME_SAVE_MAX_WIDTH,
  computeFrameStats,
  computeVisionSummary,
  downsampleByStride,
  evaluateDetectionState,
  getSkyMaskTopFraction,
  isAboveThreshold,
  isDarkEnough,
  pushDetectionHistory,
  selectFilesToPrune,
  shouldSampleNegative,
  skyRowCount
} from './visionHeuristics.js';
import type { PrunableFile, VisionDetectionRecord, VisionStatsRecord, VisionSummary } from './visionHeuristics.js';

/**
 * Vision (camera-based aurora detection) Phase 0 -- shadow mode.
 * docs/design-vision-alerts.md is the design contract; this module is the
 * "heuristic in shadow mode (no ML, no pushes)" phase described there.
 *
 * HARD GATE: the entire pipeline is inert unless `VISION_ENABLED` is set
 * (see loadVisionConfig below). With it unset/absent, `startVisionPipeline`
 * does not even create a timer, and `runVisionCycle` returns immediately --
 * zero network calls, ever. Camera-polling permission from UiT (the actual
 * camera owner; docs/design-vision-alerts.md section 7 decision 1) gates
 * *activation* (someone flipping the flag), not this code existing.
 *
 * Even when enabled, the pipeline only polls during darkness (solar
 * elevation at Tromso center below DARKNESS_ELEVATION_DEG) -- outside that
 * window every cycle is a single cheap solarElevationDeg call, no fetch, no
 * decode.
 *
 * WIRING NOTE: unlike validation.ts/alerts.ts, this module is deliberately
 * NOT wired into server.ts's bootstrap()/buildApp() by this change --
 * server.ts is CODEOWNERS-protected and, notwithstanding the doc's Phase-0
 * amendment saying that wiring is expected, this PR leaves that specific
 * one-line-ish edit for the owner to add (or a follow-up PR) rather than an
 * agent making it unreviewed. See the PR description for the exact diff.
 * Everything below is fully self-contained and independently testable via
 * `registerVisionRoutes`/`startVisionPipeline`/`runVisionCycle` without
 * touching server.ts at all.
 *
 * PRIVACY: no user/device data anywhere in this pipeline -- frames are
 * public rooftop city camera stills (docs/design-vision-alerts.md section
 * 5). Stats/detection records and saved frames carry only
 * {timestamp, cameraId, pixel-derived numbers}; see the file header notes
 * on predictions.jsonl/observed.jsonl in validation.ts for the same
 * reasoning applied here.
 */

// --- Config (own module, following config.ts's fail-fast-on-clearly-invalid
// / default-on-missing style, but -- like sources.ts's getSourceTimeoutMs
// and validation.ts's getValidationRetentionDays -- read per-call rather
// than cached at import time, so tests can mutate process.env freely and so
// the polling loop always sees the current VISION_ENABLED value without a
// restart). ---

export type VisionConfig = {
  enabled: boolean;
  pollMs: number;
  greenThreshold: number;
  retentionDays: number;
  framesBudgetMb: number;
};

const DEFAULT_POLL_MS = 120_000; // 2 min -- gentler than the cams' own 1-min refresh
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_FRAMES_BUDGET_MB = 300;

function isBlank(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === '';
}

function parsePositiveNumber(raw: string | undefined, fallback: number, name: string): number {
  if (isBlank(raw)) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: "${raw}" (must be a positive number).`);
  }
  return value;
}

function parseFraction(raw: string | undefined, fallback: number, name: string): number {
  if (isBlank(raw)) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Invalid ${name}: "${raw}" (must be a number between 0 and 1).`);
  }
  return value;
}

/** Truthy env values that mean "enabled": mirrors the common
 * `EXPO_PUBLIC_USE_BACKEND`-style boolean-env convention already used
 * elsewhere in this repo (case-insensitive "true"/"1"). Anything else
 * (missing, blank, "false", "0", typos) is OFF -- fail-closed by design,
 * since this is the one flag gating a whole external-fetch pipeline. */
function parseEnabledFlag(raw: string | undefined): boolean {
  if (isBlank(raw)) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

export function loadVisionConfig(env: NodeJS.ProcessEnv = process.env): VisionConfig {
  return {
    enabled: parseEnabledFlag(env.VISION_ENABLED),
    pollMs: parsePositiveNumber(env.VISION_POLL_MS, DEFAULT_POLL_MS, 'VISION_POLL_MS'),
    greenThreshold: parseFraction(env.VISION_GREEN_THRESHOLD, DEFAULT_GREEN_THRESHOLD, 'VISION_GREEN_THRESHOLD'),
    retentionDays: parsePositiveNumber(env.VISION_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, 'VISION_RETENTION_DAYS'),
    framesBudgetMb: parsePositiveNumber(env.VISION_FRAMES_BUDGET_MB, DEFAULT_FRAMES_BUDGET_MB, 'VISION_FRAMES_BUDGET_MB')
  };
}

// --- Camera list ---
//
// MIRROR: hand-duplicated from src/data/liveCameras.ts's four UiT
// weather-camera entries -- same convention as solar.ts's header comment
// ("identical, independently-maintained twin... keep both in sync by
// hand"). A JSON-style cross-package import (like validation.ts's
// `import spots from '../../src/data/spots.json'`) isn't used here because
// liveCameras.ts is a `.ts` module, not JSON, and isn't in this package's
// tsconfig `include` -- keeping a small typed backend-local copy avoids a
// fragile cross-package TS module resolution than duplicating a handful of
// URLs doesn't justify. Keep in sync if liveCameras.ts's URLs ever change.
export type VisionCameraId = 'uit-cs-wcam0' | 'uit-cs-wcam1' | 'uit-cs-wcam2' | 'uit-cs-wcam3';

export type VisionCamera = {
  id: VisionCameraId;
  url: string;
};

export const VISION_CAMERAS: readonly VisionCamera[] = [
  { id: 'uit-cs-wcam0', url: 'https://weather.cs.uit.no/cam/cam_south.jpg' },
  { id: 'uit-cs-wcam1', url: 'https://weather.cs.uit.no/cam/cam_east.jpg' },
  { id: 'uit-cs-wcam2', url: 'https://weather.cs.uit.no/cam/cam_west.jpg' },
  { id: 'uit-cs-wcam3', url: 'https://weather.cs.uit.no/cam/cam_north.jpg' }
];

// Tromso center -- MIRROR of snapshot.ts's TROMSO_CENTER (same hand-sync
// convention as solar.ts). Used only to gate polling on darkness; not
// per-spot, so re-using snapshot.ts's constant isn't worth the coupling.
const TROMSO_CENTER = { lat: 69.6492, lon: 18.9553 };

// Courtesy attribution header (docs/design-vision-alerts.md section 7:
// "attribution in-app is already present on the Live tab") -- identifies
// the app + a contact point on every request, same spirit as sources.ts's
// 'aurora-backend/1.0' User-Agent on MET/NOAA calls, just more specific
// since these are a single small department's cameras, not a public API.
// Only ever sent when VISION_ENABLED is true (see runVisionCycle).
export const VISION_USER_AGENT = 'project-aurora-vision/0.1 (github.com/maxtwotouch/project-aurora)';

// --- Data paths (resolved from process.cwd() at call time via these
// constants, same as validation.ts's PREDICTIONS_PATH/OBSERVED_PATH --
// tests chdir into a temp dir before dynamically importing this module) ---

const VISION_STATS_PATH = path.resolve(process.cwd(), 'data/vision-stats.jsonl');
const VISION_DETECTIONS_PATH = path.resolve(process.cwd(), 'data/vision-detections.jsonl');
const VISION_FRAMES_DIR = path.resolve(process.cwd(), 'data/vision-frames');

// Storage estimate (see task brief): downscaled+re-encoded frames
// (FRAME_SAVE_MAX_WIDTH=1024, quality~70) run roughly 60-100KB each; budget
// here assumes ~80KB/frame. DEFAULT_FRAMES_BUDGET_MB (300MB) / 80KB ~=
// 3,750 frames of headroom -- at 4 cameras x up to 1 saved frame/poll
// (only during darkness, VISION_POLL_MS=120s default) that's many nights of
// archive before the oldest-first size cap below starts pruning.

// --- Per-file write serialization + JSONL helpers ---
//
// Mirrors validation.ts's withFileLock/appendJsonlRecord/readJsonlFile
// pattern exactly (those helpers aren't exported from validation.ts, so
// this is a deliberate mirror, not a shared import -- see the task brief).

const fileMutexes = new Map<string, Promise<unknown>>();

async function withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previousTail = fileMutexes.get(filePath) ?? Promise.resolve();
  const settledPrevious = previousTail.catch(() => {});
  const result = settledPrevious.then(operation);
  fileMutexes.set(filePath, result.catch(() => {}));
  return result;
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
            return null; // torn/malformed write -- skip, don't crash
          }
        })
        .filter((value): value is T => value !== null && isValid(value));
    } catch {
      return []; // missing file (nothing recorded yet) -- start empty
    }
  });
}

async function writeLinesAtomicUnlocked(filePath: string, lines: string[]): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  const content = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function isVisionStatsRecord(value: unknown): value is VisionStatsRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<VisionStatsRecord>;
  return (
    typeof record.ts === 'string' &&
    typeof record.cameraId === 'string' &&
    typeof record.greenExcessFraction === 'number' &&
    typeof record.meanLuminance === 'number'
  );
}

function isVisionDetectionRecord(value: unknown): value is VisionDetectionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<VisionDetectionRecord>;
  return typeof record.ts === 'string' && typeof record.cameraId === 'string' && typeof record.fraction === 'number';
}

export async function readVisionStats(): Promise<VisionStatsRecord[]> {
  return readJsonlFile(VISION_STATS_PATH, isVisionStatsRecord);
}

export async function readVisionDetections(): Promise<VisionDetectionRecord[]> {
  return readJsonlFile(VISION_DETECTIONS_PATH, isVisionDetectionRecord);
}

/** Prunes both JSONL files of records older than `retentionDays`, by `ts`.
 * Mirrors validation.ts's pruneJsonlFileByNightKey, just keyed on a raw ISO
 * timestamp instead of a night key. */
async function pruneJsonlFileByAge(filePath: string, retentionDays: number, now: Clock): Promise<void> {
  await withFileLock(filePath, async () => {
    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      return;
    }

    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const nowMs = now();
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

    const kept = lines.filter((line) => {
      try {
        const parsed = JSON.parse(line) as { ts?: unknown };
        if (typeof parsed?.ts !== 'string') return false;
        const ts = Date.parse(parsed.ts);
        return Number.isFinite(ts) && nowMs - ts <= retentionMs;
      } catch {
        return false;
      }
    });

    if (kept.length === lines.length) return;
    await writeLinesAtomicUnlocked(filePath, kept);
  });
}

// Retention sweeps rewrite the whole file -- throttled to at most once per
// Oslo calendar day, same reasoning/pattern as validation.ts's
// lastRetentionSweepDayKey.
let lastRetentionSweepDayKey: string | null = null;

async function maybeRunRetentionSweep(cfg: VisionConfig, now: Clock): Promise<void> {
  const dayKey = getOsloDayKey(new Date(now()));
  if (lastRetentionSweepDayKey === dayKey) return;
  lastRetentionSweepDayKey = dayKey;

  try {
    await pruneJsonlFileByAge(VISION_STATS_PATH, cfg.retentionDays, now);
    await pruneJsonlFileByAge(VISION_DETECTIONS_PATH, cfg.retentionDays, now);
  } catch (error) {
    console.warn('[vision] retention sweep failed; stats/detections files left as-is.', error instanceof Error ? error.message : error);
  }
}

// --- Frame archive (size-budgeted, oldest-first pruning) ---

async function listFrameFiles(): Promise<PrunableFile[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(VISION_FRAMES_DIR);
  } catch {
    return []; // directory doesn't exist yet -- nothing archived
  }

  const files: PrunableFile[] = [];
  for (const name of entries) {
    if (!name.endsWith('.jpg')) continue;
    try {
      const stat = await fs.stat(path.join(VISION_FRAMES_DIR, name));
      files.push({ name, sizeBytes: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // file vanished between readdir and stat (e.g. concurrent prune) -- skip
    }
  }
  return files;
}

/** Deletes oldest frame files until the archive fits within
 * `cfg.framesBudgetMb`. Safe to call after every save (cheap relative to
 * VISION_POLL_MS's >= few-minute cadence); never throws. */
export async function pruneFrameArchive(cfg: VisionConfig): Promise<void> {
  try {
    const files = await listFrameFiles();
    const budgetBytes = cfg.framesBudgetMb * 1024 * 1024;
    const toDelete = selectFilesToPrune(files, budgetBytes);
    await Promise.all(toDelete.map((name) => fs.rm(path.join(VISION_FRAMES_DIR, name), { force: true })));
  } catch (error) {
    console.warn('[vision] frame archive pruning failed.', error instanceof Error ? error.message : error);
  }
}

function safeTsForFilename(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

/** Downscales+re-encodes and writes one training frame to
 * backend/data/vision-frames/, then runs the size-budgeted prune. `frame`
 * is the FULL-resolution decoded frame (not the 384px analysis
 * downsample) -- re-downsampled here to FRAME_SAVE_MAX_WIDTH, which is
 * intentionally a different (larger) target than the analysis path. */
async function saveFrame(
  cameraId: string,
  frame: { width: number; height: number; data: Uint8Array },
  nowIso: string,
  cfg: VisionConfig,
  label: 'pos' | 'neg'
): Promise<void> {
  try {
    const downscaled = downsampleByStride(frame, FRAME_SAVE_MAX_WIDTH);
    const encoded = jpegjs.encode(
      { width: downscaled.width, height: downscaled.height, data: downscaled.data },
      FRAME_SAVE_JPEG_QUALITY
    );

    await fs.mkdir(VISION_FRAMES_DIR, { recursive: true });
    const fileName = `${cameraId}_${safeTsForFilename(nowIso)}_${label}.jpg`;
    await fs.writeFile(path.join(VISION_FRAMES_DIR, fileName), encoded.data);
    await pruneFrameArchive(cfg);
  } catch (error) {
    console.warn(`[vision] failed to save frame for camera "${cameraId}".`, error instanceof Error ? error.message : error);
  }
}

// --- Per-camera runtime state (detection history, negative-sample counter)
// -- in-memory only, never persisted (a restart just starts a fresh 5-frame
// window, which is fine: worst case is a brief delay before the next
// detection can fire again). ---

const detectionHistoryByCameraId = new Map<string, boolean[]>();
const negativeSampleIndexByCameraId = new Map<string, number>();

/** Test-only hook: clears in-memory per-camera state between test cases. */
export function resetVisionRuntimeStateForTests(): void {
  detectionHistoryByCameraId.clear();
  negativeSampleIndexByCameraId.clear();
}

// --- Per-camera poll ---

/** Fetches, decodes, scores, persists, and (maybe) archives one camera's
 * current frame. Fully isolated: any failure (network, decode, fs) is
 * caught and logged here, never propagated -- one camera's outage must
 * never affect the other three (task brief's "per-camera isolation"). */
async function pollCameraOnce(camera: VisionCamera, cfg: VisionConfig, fetchImpl: FetchLike, now: Clock): Promise<void> {
  try {
    const response = await fetchWithTimeout(fetchImpl, camera.url, {
      headers: { 'User-Agent': VISION_USER_AGENT }
    });
    if (!response.ok) {
      throw new Error(`Camera fetch failed (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const decoded = jpegjs.decode(Buffer.from(arrayBuffer));
    const rawFrame = { width: decoded.width, height: decoded.height, data: decoded.data as Uint8Array };

    const analysisFrame = downsampleByStride(rawFrame, ANALYSIS_TARGET_WIDTH);
    const rowEnd = skyRowCount(analysisFrame.height, getSkyMaskTopFraction(camera.id));
    const stats = computeFrameStats(analysisFrame, rowEnd);

    const nowIso = new Date(now()).toISOString();
    const aboveThreshold = isAboveThreshold(stats.greenExcessFraction, cfg.greenThreshold);

    const statsRecord: VisionStatsRecord = {
      ts: nowIso,
      cameraId: camera.id,
      greenExcessFraction: stats.greenExcessFraction,
      meanLuminance: stats.meanLuminance,
      meanR: stats.meanR,
      meanG: stats.meanG,
      meanB: stats.meanB,
      aboveThreshold,
      threshold: cfg.greenThreshold
    };
    await appendJsonlRecord(VISION_STATS_PATH, statsRecord);

    const priorHistory = detectionHistoryByCameraId.get(camera.id) ?? [];
    const nextHistory = pushDetectionHistory(priorHistory, aboveThreshold);
    detectionHistoryByCameraId.set(camera.id, nextHistory);
    const detectionState = evaluateDetectionState(nextHistory);

    if (detectionState.isDetection) {
      const detectionRecord: VisionDetectionRecord = {
        ts: nowIso,
        cameraId: camera.id,
        fraction: stats.greenExcessFraction,
        consecutiveCount: detectionState.countInWindow,
        windowSize: detectionState.windowSize
      };
      await appendJsonlRecord(VISION_DETECTIONS_PATH, detectionRecord);
      // Shadow mode: detection logging is the ENTIRE effect -- no push, no
      // alert, no user-facing output (docs/design-vision-alerts.md, Phase 0).
      await saveFrame(camera.id, rawFrame, nowIso, cfg, 'pos');
    } else {
      const sampleIndex = negativeSampleIndexByCameraId.get(camera.id) ?? 0;
      negativeSampleIndexByCameraId.set(camera.id, sampleIndex + 1);
      if (shouldSampleNegative(sampleIndex)) {
        await saveFrame(camera.id, rawFrame, nowIso, cfg, 'neg');
      }
    }
  } catch (error) {
    console.warn(`[vision] poll failed for camera "${camera.id}"; other cameras unaffected.`, error instanceof Error ? error.message : error);
  }
}

// --- Top-level cycle + start/stop wiring ---

export type RunVisionCycleOptions = {
  now?: Clock;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
};

/**
 * One polling tick: no-ops (zero fetches) unless VISION_ENABLED is truthy
 * AND it's currently dark enough at Tromso center. Otherwise fans out one
 * fetch+decode+score per camera, isolated via pollCameraOnce, then runs the
 * (throttled) retention sweep.
 */
export async function runVisionCycle(options: RunVisionCycleOptions = {}): Promise<void> {
  const now = options.now ?? Date.now;
  const env = options.env ?? process.env;
  const cfg = loadVisionConfig(env);

  if (!cfg.enabled) return; // disabled -- zero work, zero fetches, by design

  const elevation = solarElevationDeg(now(), TROMSO_CENTER.lat, TROMSO_CENTER.lon);
  if (!isDarkEnough(elevation)) return; // daylight/twilight -- idle, no fetches

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  await Promise.allSettled(VISION_CAMERAS.map((camera) => pollCameraOnce(camera, cfg, fetchImpl, now)));
  await maybeRunRetentionSweep(cfg, now);
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the background polling interval -- but ONLY if VISION_ENABLED is
 * truthy. When it's not, this function does not create a timer at all (not
 * just "an idle timer that no-ops"): the module owns zero background work
 * whatsoever while disabled, matching the task's "module never fetches a
 * single frame while unset" requirement literally, not just in effect.
 */
export function startVisionPipeline(options: { env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike; now?: Clock } = {}): void {
  if (intervalHandle) return; // already running

  const env = options.env ?? process.env;
  const cfg = loadVisionConfig(env);
  if (!cfg.enabled) {
    console.info('[vision] VISION_ENABLED is not set; pipeline stays fully idle (no timer, no fetches).');
    return;
  }

  intervalHandle = setInterval(() => {
    void runVisionCycle({ env, fetchImpl: options.fetchImpl, now: options.now }).catch((error) => {
      console.warn('[vision] runVisionCycle failed unexpectedly.', error instanceof Error ? error.message : error);
    });
  }, cfg.pollMs);
  // Don't keep the process alive on this interval alone -- mirrors the
  // "background maintenance, not core server responsibility" treatment
  // other intervals in this codebase get (none of them call unref() either,
  // since server.ts's own refresh interval is meant to keep the process
  // alive; vision's does too, once wired in -- unref() would be surprising
  // for an interval a human expects to keep the process running).
}

/** Test-only hook: stops the interval (if any) so tests don't leak timers
 * across files -- mirrors usageCounterStore.stop()'s naming/spirit. */
export function stopVisionForTests(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

// --- Admin route ---

/**
 * GET /v1/admin/vision -- token-gated (identical auth check to
 * POST /v1/admin/refresh / GET /v1/admin/validation), returns the last-hour
 * per-camera stats rollup plus today's total detection count. Read-only,
 * aggregates + our own model's derived numbers only -- no user data (see
 * file header PRIVACY note).
 *
 * NOT called from server.ts by this change (see the file header's WIRING
 * NOTE) -- exported so it can be registered with one line
 * (`registerVisionRoutes(app, adminToken)`) once that CODEOWNERS-protected
 * edit is made.
 */
export function registerVisionRoutes(app: FastifyInstance, adminToken: string): void {
  app.get('/v1/admin/vision', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!adminToken || request.headers['x-admin-token'] !== adminToken) {
      reply.code(401);
      return { ok: false, message: 'Unauthorized' };
    }

    const [stats, detections] = await Promise.all([readVisionStats(), readVisionDetections()]);
    const summary: VisionSummary = computeVisionSummary(
      stats,
      detections,
      VISION_CAMERAS.map((camera) => camera.id)
    );
    return summary;
  });
}
