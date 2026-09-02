import { getOsloDayKey } from './sources.js';
import type { Clock } from './sources.js';

/**
 * Pure math for the vision (camera-based aurora detection) Phase-0
 * heuristic -- docs/design-vision-alerts.md, section 3. Every function here
 * takes plain data in and returns plain data out (no fs, no network, no
 * clock reads except via an injected `Clock`), so it's exhaustively testable
 * with synthetic fixtures. The impure orchestration (fetching, decoding via
 * jpeg-js, file I/O, the polling loop, the admin route) lives in vision.ts.
 *
 * STATUS: Phase 0, flag-gated behind VISION_ENABLED (default OFF -- see
 * vision.ts's loadVisionConfig). This module never touches a network or
 * filesystem call itself.
 */

// --- Constants (Phase-0 approximations -- see docs/design-vision-alerts.md
// section 3/4; all tunable once real shadow-mode frames are collected) ---

/** Green-excess pixel test (aurora's 557.7nm oxygen line dominates the green
 * channel on a consumer camera sensor): G > ratio*R && G > ratio*B && G >
 * minGreen. */
export const GREEN_EXCESS_RATIO = 1.25;
export const GREEN_EXCESS_MIN = 40;

/** Downsample target width for the analysis path (decoded frames are
 * ~3072px wide; striding down to ~384px keeps per-frame decode+analysis
 * well under the 2-minute poll budget). */
export const ANALYSIS_TARGET_WIDTH = 384;

/** Persistence rule (docs/design-vision-alerts.md section 3, item 4): a
 * detection requires >= PERSISTENCE_REQUIRED of the last PERSISTENCE_WINDOW
 * frames above threshold, on any one camera. Kills single-frame artifacts
 * (headlights, JPEG noise, birds). */
export const PERSISTENCE_WINDOW = 5;
export const PERSISTENCE_REQUIRED = 3;

/** Default green-excess fraction threshold -- env-tunable via
 * VISION_GREEN_THRESHOLD, see vision.ts's loadVisionConfig. */
export const DEFAULT_GREEN_THRESHOLD = 0.03;

/** Darkness gate: solar elevation must be below this (degrees) at Tromso
 * center for the pipeline to poll at all -- reuses solar.ts's
 * solarElevationDeg, same -6deg (civil twilight) cutoff scoring.ts/season.ts
 * already use for "definitely not dark enough yet". */
export const DARKNESS_ELEVATION_DEG = -6;

/** Retained training frames: downscaled to at most this width before
 * re-encoding (jpeg-js encode, quality ~70) -- keeps per-frame size to
 * roughly 60-100KB (~80KB assumed for the budget estimate in vision.ts),
 * vs. ~550KB for a raw camera JPEG. */
export const FRAME_SAVE_MAX_WIDTH = 1024;
export const FRAME_SAVE_JPEG_QUALITY = 70;

/** Save every detection-positive frame, but only 1 in this many
 * non-detection ("negative") frames -- keeps the training archive
 * dominated by the rare, valuable positive class while still keeping a
 * representative negative sample. */
export const NEGATIVE_SAMPLE_RATE = 30;

/**
 * Per-camera sky-mask top fraction: the fraction of each downsampled
 * frame's rows (counted from the top) treated as "sky" for scoring. Phase-0
 * APPROXIMATIONS ONLY -- docs/design-vision-alerts.md notes the real frames
 * have "a large clean sky region (~upper 60%)"; these four are hand-guessed
 * per camera (south/east/west/north point at slightly different rooflines)
 * and are meant to be tuned once real shadow-mode frames are reviewed. Keys
 * match VISION_CAMERAS ids in vision.ts (hand-mirrored from
 * src/data/liveCameras.ts, see that file's header comment).
 */
export const SKY_MASK_TOP_FRACTION: Readonly<Record<string, number>> = {
  'uit-cs-wcam0': 0.6, // south
  'uit-cs-wcam1': 0.58, // east
  'uit-cs-wcam2': 0.62, // west
  'uit-cs-wcam3': 0.55 // north
};

/** Fallback top fraction for any camera id not in SKY_MASK_TOP_FRACTION
 * (shouldn't happen with the fixed 4-camera list, but keeps this function
 * total rather than partial). */
export const DEFAULT_SKY_MASK_TOP_FRACTION = 0.6;

export function getSkyMaskTopFraction(cameraId: string): number {
  return SKY_MASK_TOP_FRACTION[cameraId] ?? DEFAULT_SKY_MASK_TOP_FRACTION;
}

// --- Frame representation ---

/** Decoded raw pixel buffer -- what jpeg-js's `decode()` (formatAsRGBA
 * default) hands back: width*height RGBA pixels, 4 bytes each, row-major. */
export type RawFrame = {
  width: number;
  height: number;
  data: Uint8Array;
};

/**
 * Downsamples `frame` by nearest-pixel striding (NOT averaging -- cheap,
 * deterministic, and plenty for a coarse color-fraction heuristic) so its
 * width is close to `targetWidth`. A no-op (returns `frame` unchanged) when
 * it's already at or below `targetWidth`. `stride` is derived from the
 * WIDTH ratio only and applied to both axes, so aspect ratio is preserved.
 */
export function downsampleByStride(frame: RawFrame, targetWidth: number): RawFrame {
  if (targetWidth <= 0 || frame.width <= targetWidth) {
    return frame;
  }

  const stride = Math.max(1, Math.round(frame.width / targetWidth));
  const outWidth = Math.max(1, Math.floor(frame.width / stride));
  const outHeight = Math.max(1, Math.floor(frame.height / stride));
  const out = new Uint8Array(outWidth * outHeight * 4);

  for (let y = 0; y < outHeight; y++) {
    const srcY = y * stride;
    for (let x = 0; x < outWidth; x++) {
      const srcX = x * stride;
      const srcIdx = (srcY * frame.width + srcX) * 4;
      const dstIdx = (y * outWidth + x) * 4;
      out[dstIdx] = frame.data[srcIdx];
      out[dstIdx + 1] = frame.data[srcIdx + 1];
      out[dstIdx + 2] = frame.data[srcIdx + 2];
      out[dstIdx + 3] = frame.data[srcIdx + 3];
    }
  }

  return { width: outWidth, height: outHeight, data: out };
}

/** Number of rows (from the top) that count as "sky" for a frame of the
 * given height, given a [0,1] top fraction (clamped defensively). */
export function skyRowCount(height: number, topFraction: number): number {
  const clamped = Math.max(0, Math.min(1, topFraction));
  return Math.round(height * clamped);
}

export type FrameStats = {
  greenExcessFraction: number;
  meanLuminance: number;
  meanR: number;
  meanG: number;
  meanB: number;
  /** Number of pixels the sky mask actually covered (0 if skyRowEnd <= 0 or
   * the frame is empty) -- exposed so callers/tests can distinguish "0%
   * green" from "no sky pixels were scored at all". */
   pixelCount: number;
};

/**
 * Scores `frame`'s sky region (rows [0, skyRowEnd)) for green-channel
 * excess (docs/design-vision-alerts.md section 3, item 3) plus basic
 * exposure stats (mean luminance/RGB), which double as camera-health/
 * white-balance signals for later tuning. Pure: no I/O, no randomness.
 */
export function computeFrameStats(
  frame: RawFrame,
  skyRowEnd: number,
  options: { greenExcessRatio?: number; greenExcessMin?: number } = {}
): FrameStats {
  const ratio = options.greenExcessRatio ?? GREEN_EXCESS_RATIO;
  const minGreen = options.greenExcessMin ?? GREEN_EXCESS_MIN;
  const rowEnd = Math.max(0, Math.min(frame.height, Math.round(skyRowEnd)));

  let pixelCount = 0;
  let greenExcessCount = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumLuminance = 0;

  for (let y = 0; y < rowEnd; y++) {
    for (let x = 0; x < frame.width; x++) {
      const idx = (y * frame.width + x) * 4;
      const r = frame.data[idx];
      const g = frame.data[idx + 1];
      const b = frame.data[idx + 2];

      pixelCount += 1;
      sumR += r;
      sumG += g;
      sumB += b;
      sumLuminance += 0.299 * r + 0.587 * g + 0.114 * b;

      if (g > ratio * r && g > ratio * b && g > minGreen) {
        greenExcessCount += 1;
      }
    }
  }

  if (pixelCount === 0) {
    return { greenExcessFraction: 0, meanLuminance: 0, meanR: 0, meanG: 0, meanB: 0, pixelCount: 0 };
  }

  return {
    greenExcessFraction: greenExcessCount / pixelCount,
    meanLuminance: sumLuminance / pixelCount,
    meanR: sumR / pixelCount,
    meanG: sumG / pixelCount,
    meanB: sumB / pixelCount,
    pixelCount
  };
}

/** `fraction` counts as "above threshold" iff strictly greater -- a frame
 * scoring exactly at the threshold is treated as not-yet-a-hit (documented
 * judgment call; the boundary is exercised explicitly in tests). */
export function isAboveThreshold(fraction: number, threshold: number): boolean {
  return fraction > threshold;
}

/** Solar elevation must be strictly below `thresholdDeg` (default -6, civil
 * twilight -- see DARKNESS_ELEVATION_DEG) for the pipeline to consider it
 * dark enough to poll. */
export function isDarkEnough(elevationDeg: number, thresholdDeg: number = DARKNESS_ELEVATION_DEG): boolean {
  return elevationDeg < thresholdDeg;
}

// --- Persistence rule (3-of-5) state machine ---

/** Appends `value` to `history`, capping it at `maxLen` entries (drops from
 * the front -- oldest first) so per-camera history never grows unbounded in
 * memory. */
export function pushDetectionHistory(history: readonly boolean[], value: boolean, maxLen: number = PERSISTENCE_WINDOW): boolean[] {
  const next = [...history, value];
  return next.length > maxLen ? next.slice(next.length - maxLen) : next;
}

export type DetectionState = {
  isDetection: boolean;
  /** Count of above-threshold frames within the trailing window considered
   * (NOT required to be strictly consecutive -- "N of the last M frames",
   * docs/design-vision-alerts.md section 3 item 4; the persisted detection
   * record's `consecutiveCount` field uses this same count). */
  countInWindow: number;
  /** Actual window size considered (<= `window`; smaller only during the
   * first few frames of a camera's history). */
  windowSize: number;
};

export function evaluateDetectionState(
  history: readonly boolean[],
  required: number = PERSISTENCE_REQUIRED,
  window: number = PERSISTENCE_WINDOW
): DetectionState {
  const recent = history.slice(-window);
  const countInWindow = recent.filter(Boolean).length;
  return { isDetection: countInWindow >= required, countInWindow, windowSize: recent.length };
}

// --- Negative-frame sampling ---

/** Deterministic 1-in-`every` sample (index-modulo, not random -- keeps
 * this pure/testable): true on index 0, `every`, 2*`every`, ... */
export function shouldSampleNegative(sampleIndex: number, every: number = NEGATIVE_SAMPLE_RATE): boolean {
  return sampleIndex % every === 0;
}

// --- Size-based frame-archive pruning ---

export type PrunableFile = {
  name: string;
  sizeBytes: number;
  /** mtime in epoch ms, used purely as an age ordering key (oldest first). */
  mtimeMs: number;
};

/**
 * Given the current frame archive's files, returns the names to delete
 * (oldest-first) so the remaining total fits within `budgetBytes`. Pure:
 * takes/returns plain data, no fs access (vision.ts's impure wrapper does
 * the readdir/stat/unlink). Returns `[]` when already within budget.
 */
export function selectFilesToPrune(files: readonly PrunableFile[], budgetBytes: number): string[] {
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (totalBytes <= budgetBytes) return [];

  const oldestFirst = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs);
  const toDelete: string[] = [];
  let remaining = totalBytes;

  for (const file of oldestFirst) {
    if (remaining <= budgetBytes) break;
    toDelete.push(file.name);
    remaining -= file.sizeBytes;
  }

  return toDelete;
}

// --- Admin summary (pure join over already-loaded JSONL records) ---

export type VisionStatsRecord = {
  ts: string;
  cameraId: string;
  greenExcessFraction: number;
  meanLuminance: number;
  meanR: number;
  meanG: number;
  meanB: number;
  aboveThreshold: boolean;
  threshold: number;
};

export type VisionDetectionRecord = {
  ts: string;
  cameraId: string;
  fraction: number;
  consecutiveCount: number;
  windowSize: number;
};

export type VisionCameraSummary = {
  cameraId: string;
  framesLastHour: number;
  meanGreenExcessFractionLastHour: number | null;
  meanLuminanceLastHour: number | null;
  lastFrameTs: string | null;
};

export type VisionSummary = {
  generatedAt: string;
  cameras: VisionCameraSummary[];
  detectionsToday: number;
};

/**
 * Joins already-loaded stats/detection records into the admin route's
 * summary shape: per-camera last-hour rollup, plus today's (Oslo calendar
 * day) total detection count across all cameras. Pure -- vision.ts's route
 * handler does the file reads, then calls this.
 */
export function computeVisionSummary(
  stats: readonly VisionStatsRecord[],
  detections: readonly VisionDetectionRecord[],
  cameraIds: readonly string[],
  now: Clock = Date.now
): VisionSummary {
  const nowMs = now();
  const oneHourAgoMs = nowMs - 60 * 60 * 1000;
  const todayDayKey = getOsloDayKey(new Date(nowMs));

  const cameras = cameraIds.map((cameraId) => {
    const recent = stats
      .filter((record) => record.cameraId === cameraId)
      .filter((record) => {
        const ts = Date.parse(record.ts);
        return Number.isFinite(ts) && ts >= oneHourAgoMs && ts <= nowMs;
      })
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

    const framesLastHour = recent.length;
    const meanGreenExcessFractionLastHour =
      framesLastHour > 0 ? recent.reduce((sum, record) => sum + record.greenExcessFraction, 0) / framesLastHour : null;
    const meanLuminanceLastHour =
      framesLastHour > 0 ? recent.reduce((sum, record) => sum + record.meanLuminance, 0) / framesLastHour : null;
    const lastFrameTs = framesLastHour > 0 ? recent[recent.length - 1].ts : null;

    return { cameraId, framesLastHour, meanGreenExcessFractionLastHour, meanLuminanceLastHour, lastFrameTs };
  });

  const detectionsToday = detections.filter((record) => {
    const ts = Date.parse(record.ts);
    return Number.isFinite(ts) && getOsloDayKey(new Date(ts)) === todayDayKey;
  }).length;

  return { generatedAt: new Date(nowMs).toISOString(), cameras, detectionsToday };
}
