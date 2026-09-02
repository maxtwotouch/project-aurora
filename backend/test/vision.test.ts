// Tests for backend/src/visionHeuristics.ts (pure math + state machines) and
// backend/src/vision.ts (config, JSONL persistence, frame pruning, the
// darkness/enabled gates, and the admin route). Runs in a temp cwd (never
// backend/data/), same chdir-before-dynamic-import pattern as
// test/validation-integration.test.ts / test/store.test.ts, since vision.ts
// resolves its data paths from `process.cwd()` at call time.
import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import * as jpegjs from 'jpeg-js';

import {
  ANALYSIS_TARGET_WIDTH,
  DARKNESS_ELEVATION_DEG,
  DEFAULT_GREEN_THRESHOLD,
  GREEN_EXCESS_MIN,
  PERSISTENCE_REQUIRED,
  PERSISTENCE_WINDOW,
  computeFrameStats,
  computeVisionSummary,
  downsampleByStride,
  evaluateDetectionState,
  isAboveThreshold,
  isDarkEnough,
  pushDetectionHistory,
  selectFilesToPrune,
  shouldSampleNegative,
  skyRowCount
} from '../src/visionHeuristics.js';
import type { RawFrame, VisionDetectionRecord, VisionStatsRecord } from '../src/visionHeuristics.js';

type VisionModule = typeof import('../src/vision.js');

let vision: VisionModule;
let tmpDir: string;
let originalCwd: string;
let statsPath: string;
let detectionsPath: string;
let framesDir: string;

before(async () => {
  originalCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-vision-test-'));
  process.chdir(tmpDir);
  vision = await import('../src/vision.js');
  statsPath = path.join(tmpDir, 'data', 'vision-stats.jsonl');
  detectionsPath = path.join(tmpDir, 'data', 'vision-detections.jsonl');
  framesDir = path.join(tmpDir, 'data', 'vision-frames');
});

after(async () => {
  vision.stopVisionForTests();
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

afterEach(async () => {
  vision.stopVisionForTests();
  vision.resetVisionRuntimeStateForTests();
  await fs.rm(statsPath, { force: true });
  await fs.rm(detectionsPath, { force: true });
  await fs.rm(framesDir, { recursive: true, force: true });
});

// --- Fixture helpers ---

/** Builds a flat-color RawFrame (RGBA) of the given size -- no JPEG
 * round-trip, for pure-math unit tests that want exact pixel values. */
function makeSolidFrame(width: number, height: number, [r, g, b]: [number, number, number]): RawFrame {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Two-band frame: top `topFraction` of rows are `topColor`, the rest
 * `bottomColor` -- used to exercise the sky mask. */
function makeTwoBandFrame(width: number, height: number, topFraction: number, topColor: [number, number, number], bottomColor: [number, number, number]): RawFrame {
  const data = new Uint8Array(width * height * 4);
  const splitRow = Math.round(height * topFraction);
  for (let y = 0; y < height; y++) {
    const [r, g, b] = y < splitRow ? topColor : bottomColor;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Real synthetic JPEG bytes (via jpeg-js encode) for a solid-color image --
 * exercises the actual decode path, not just the pure pixel math, per the
 * task brief ("generate tiny synthetic JPEGs in tests via jpeg-js encode"). */
function encodeSolidJpeg(width: number, height: number, color: [number, number, number], quality = 90): Buffer {
  const frame = makeSolidFrame(width, height, color);
  return jpegjs.encode({ width: frame.width, height: frame.height, data: frame.data }, quality).data;
}

function makeFakeResponse(bytes: Buffer, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  } as unknown as Response;
}

// =====================================================================
// Pure math: green-excess / stats
// =====================================================================

describe('computeFrameStats -- green-excess heuristic', () => {
  test('pure green sky (0,255,0) scores a high green-excess fraction', () => {
    const frame = makeSolidFrame(10, 10, [0, 255, 0]);
    const stats = computeFrameStats(frame, frame.height);
    assert.equal(stats.greenExcessFraction, 1);
    assert.equal(stats.pixelCount, 100);
  });

  test('gray sky (moonlit clouds / white-balance drift) scores zero -- ratio test, not absolute green', () => {
    // G is "high" in absolute terms (200) but R and B match it exactly, so
    // the ratio test (G > 1.25*R && G > 1.25*B) correctly rejects it.
    const frame = makeSolidFrame(10, 10, [200, 200, 200]);
    const stats = computeFrameStats(frame, frame.height);
    assert.equal(stats.greenExcessFraction, 0);
  });

  test('dark/near-black frame (auto-exposure night noise) scores zero -- G > 40 floor', () => {
    const frame = makeSolidFrame(10, 10, [5, 39, 5]); // green ratio would pass, but G=39 < 40 floor
    const stats = computeFrameStats(frame, frame.height);
    assert.equal(stats.greenExcessFraction, 0);
  });

  test('green-excess ratio boundary: G just above 1.25*R/B counts, just at/below does not', () => {
    // R=B=100 -> threshold is G > 125.
    const justAbove = makeSolidFrame(2, 2, [100, 126, 100]);
    const atBoundary = makeSolidFrame(2, 2, [100, 125, 100]);
    const justBelow = makeSolidFrame(2, 2, [100, 124, 100]);

    assert.equal(computeFrameStats(justAbove, 2).greenExcessFraction, 1);
    assert.equal(computeFrameStats(atBoundary, 2).greenExcessFraction, 0);
    assert.equal(computeFrameStats(justBelow, 2).greenExcessFraction, 0);
  });

  test('G > 40 floor boundary: exactly 40 does not count, 41 does (with a passing ratio)', () => {
    const at40 = makeSolidFrame(2, 2, [1, GREEN_EXCESS_MIN, 1]);
    const at41 = makeSolidFrame(2, 2, [1, GREEN_EXCESS_MIN + 1, 1]);
    assert.equal(computeFrameStats(at40, 2).greenExcessFraction, 0);
    assert.equal(computeFrameStats(at41, 2).greenExcessFraction, 1);
  });

  test('mean RGB / luminance are exact for a flat-color frame', () => {
    const frame = makeSolidFrame(4, 4, [10, 20, 30]);
    const stats = computeFrameStats(frame, frame.height);
    assert.equal(stats.meanR, 10);
    assert.equal(stats.meanG, 20);
    assert.equal(stats.meanB, 30);
    assert.ok(Math.abs(stats.meanLuminance - (0.299 * 10 + 0.587 * 20 + 0.114 * 30)) < 1e-9);
  });

  test('skyRowEnd of 0 (no sky rows scored) returns zeroed stats, not a crash', () => {
    const frame = makeSolidFrame(10, 10, [0, 255, 0]);
    const stats = computeFrameStats(frame, 0);
    assert.equal(stats.pixelCount, 0);
    assert.equal(stats.greenExcessFraction, 0);
  });

  test('city-lights-in-rooftop-band case: green excess confined to below the sky mask is excluded', () => {
    // Top 60% gray sky, bottom 40% pure green (simulating green rooftop
    // lights) -- masking to the top band must exclude the green pixels.
    const frame = makeTwoBandFrame(10, 10, 0.6, [200, 200, 200], [0, 255, 0]);
    const maskedRowEnd = skyRowCount(frame.height, 0.6);
    const stats = computeFrameStats(frame, maskedRowEnd);
    assert.equal(stats.greenExcessFraction, 0);

    // Sanity: scoring the WHOLE frame (no mask) would have picked up the
    // green band, proving the mask is actually doing something.
    const unmasked = computeFrameStats(frame, frame.height);
    assert.ok(unmasked.greenExcessFraction > 0);
  });
});

describe('skyRowCount', () => {
  test('rounds height*fraction and clamps fraction to [0,1]', () => {
    assert.equal(skyRowCount(100, 0.6), 60);
    assert.equal(skyRowCount(100, 1.5), 100);
    assert.equal(skyRowCount(100, -0.5), 0);
  });
});

describe('isAboveThreshold', () => {
  test('strictly greater-than semantics at the exact threshold', () => {
    assert.equal(isAboveThreshold(0.03, 0.03), false);
    assert.equal(isAboveThreshold(0.0301, 0.03), true);
    assert.equal(isAboveThreshold(0.0299, 0.03), false);
  });
});

// =====================================================================
// Pure math: striding downsample
// =====================================================================

describe('downsampleByStride', () => {
  test('is a no-op when already at/below the target width', () => {
    const frame = makeSolidFrame(200, 100, [1, 2, 3]);
    const result = downsampleByStride(frame, 384);
    assert.equal(result, frame); // same reference -- literal no-op
  });

  test('reduces width close to the target and preserves aspect ratio', () => {
    const frame = makeSolidFrame(3072, 1728, [10, 20, 30]);
    const result = downsampleByStride(frame, ANALYSIS_TARGET_WIDTH);
    assert.ok(result.width <= ANALYSIS_TARGET_WIDTH + 1 && result.width > 0);
    const srcAspect = 3072 / 1728;
    const outAspect = result.width / result.height;
    assert.ok(Math.abs(srcAspect - outAspect) < 0.05);
  });

  test('is deterministic (same input -> byte-identical output every call)', () => {
    const frame = makeSolidFrame(1200, 800, [7, 8, 9]);
    const a = downsampleByStride(frame, 384);
    const b = downsampleByStride(frame, 384);
    assert.deepEqual(Array.from(a.data), Array.from(b.data));
    assert.equal(a.width, b.width);
    assert.equal(a.height, b.height);
  });

  test('samples real pixel values from the source at strided coordinates (not averaged/blurred)', () => {
    // A single bright pixel in an otherwise black 8x8 frame at (4,4);
    // downsampling to width 4 (stride 2) must land on either the bright
    // pixel or a black one -- and the result must contain ONLY colors that
    // existed in the source (proving nearest-sample, not blending).
    const frame = makeSolidFrame(8, 8, [0, 0, 0]);
    const brightIdx = (4 * 8 + 4) * 4;
    frame.data[brightIdx] = 255;
    frame.data[brightIdx + 1] = 255;
    frame.data[brightIdx + 2] = 255;

    const result = downsampleByStride(frame, 4);
    for (let i = 0; i < result.data.length; i += 4) {
      const [r, g, b] = [result.data[i], result.data[i + 1], result.data[i + 2]];
      const isBlack = r === 0 && g === 0 && b === 0;
      const isWhite = r === 255 && g === 255 && b === 255;
      assert.ok(isBlack || isWhite, `unexpected blended color [${r},${g},${b}]`);
    }
  });
});

// =====================================================================
// End-to-end decode sanity check via real (synthetic) JPEG bytes
// =====================================================================

describe('decode -> analysis pipeline, using real jpeg-js-encoded fixtures', () => {
  test('a solid green synthetic JPEG decodes to a high green-excess fraction', () => {
    const bytes = encodeSolidJpeg(64, 64, [10, 240, 10]);
    const decoded = jpegjs.decode(bytes);
    const frame: RawFrame = { width: decoded.width, height: decoded.height, data: decoded.data as Uint8Array };
    const downsampled = downsampleByStride(frame, 32);
    const stats = computeFrameStats(downsampled, downsampled.height);
    // JPEG quantization can nudge a handful of pixels near block edges, but
    // the vast majority of a solid-color image must still read as green-excess.
    assert.ok(stats.greenExcessFraction > 0.9, `expected >0.9, got ${stats.greenExcessFraction}`);
  });

  test('a solid dark-gray synthetic JPEG decodes to zero green-excess', () => {
    const bytes = encodeSolidJpeg(64, 64, [20, 20, 20]);
    const decoded = jpegjs.decode(bytes);
    const frame: RawFrame = { width: decoded.width, height: decoded.height, data: decoded.data as Uint8Array };
    const stats = computeFrameStats(frame, frame.height);
    assert.equal(stats.greenExcessFraction, 0);
  });
});

// =====================================================================
// Persistence rule (3-of-5) state machine
// =====================================================================

describe('pushDetectionHistory + evaluateDetectionState', () => {
  test('caps history at PERSISTENCE_WINDOW entries, dropping oldest first', () => {
    let history: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      history = pushDetectionHistory(history, true);
    }
    assert.equal(history.length, PERSISTENCE_WINDOW);
  });

  test('fires only once >= PERSISTENCE_REQUIRED of the last PERSISTENCE_WINDOW are true', () => {
    // exactly 2 of 5 true -- must NOT fire. Oldest slot (index 0) is
    // deliberately `false` so the next push (below) evicts a false, not a
    // true -- isolating "one more true frame" as the only change.
    let history: boolean[] = [];
    for (const value of [false, true, false, true, false]) {
      history = pushDetectionHistory(history, value);
    }
    let state = evaluateDetectionState(history);
    assert.equal(state.countInWindow, 2);
    assert.equal(state.isDetection, false);

    // one more true -> evicts the oldest `false`, net 3 of 5 -- must fire
    history = pushDetectionHistory(history, true);
    state = evaluateDetectionState(history);
    assert.equal(state.countInWindow, 3);
    assert.equal(state.isDetection, true);
  });

  test('single-frame artifact (one true among many false) never fires', () => {
    let history: boolean[] = [];
    for (const value of [false, false, false, true, false]) {
      history = pushDetectionHistory(history, value);
    }
    assert.equal(evaluateDetectionState(history).isDetection, false);
  });

  test('sustained true frames keep firing as the window slides', () => {
    let history: boolean[] = [];
    for (const value of [true, true, true, true, true, true, true]) {
      history = pushDetectionHistory(history, value);
    }
    const state = evaluateDetectionState(history);
    assert.equal(state.windowSize, PERSISTENCE_WINDOW);
    assert.equal(state.countInWindow, PERSISTENCE_WINDOW);
    assert.equal(state.isDetection, true);
  });

  test('windowSize reflects fewer than 5 frames early in a camera\'s history', () => {
    let history: boolean[] = [];
    history = pushDetectionHistory(history, true);
    history = pushDetectionHistory(history, true);
    const state = evaluateDetectionState(history);
    assert.equal(state.windowSize, 2);
    assert.equal(state.countInWindow, 2);
    assert.equal(state.isDetection, false); // 2 < PERSISTENCE_REQUIRED (3)
  });

  test('custom required/window parameters are honored', () => {
    const history = [true, true, false];
    assert.equal(evaluateDetectionState(history, 2, 3).isDetection, true);
    assert.equal(evaluateDetectionState(history, 3, 3).isDetection, false);
  });
});

// =====================================================================
// Negative-frame sampling
// =====================================================================

describe('shouldSampleNegative', () => {
  test('samples index 0 and every 30th index thereafter, by default', () => {
    assert.equal(shouldSampleNegative(0), true);
    assert.equal(shouldSampleNegative(29), false);
    assert.equal(shouldSampleNegative(30), true);
    assert.equal(shouldSampleNegative(59), false);
    assert.equal(shouldSampleNegative(60), true);
  });

  test('a custom rate is honored', () => {
    assert.equal(shouldSampleNegative(3, 3), true);
    assert.equal(shouldSampleNegative(4, 3), false);
  });
});

// =====================================================================
// Size-based frame-archive pruning
// =====================================================================

describe('selectFilesToPrune', () => {
  test('returns nothing when already within budget', () => {
    const files = [
      { name: 'a.jpg', sizeBytes: 100, mtimeMs: 1 },
      { name: 'b.jpg', sizeBytes: 100, mtimeMs: 2 }
    ];
    assert.deepEqual(selectFilesToPrune(files, 1000), []);
  });

  test('deletes oldest files first until back within budget', () => {
    const files = [
      { name: 'oldest.jpg', sizeBytes: 50, mtimeMs: 1 },
      { name: 'middle.jpg', sizeBytes: 50, mtimeMs: 2 },
      { name: 'newest.jpg', sizeBytes: 50, mtimeMs: 3 }
    ];
    // total 150, budget 80 -> must delete oldest (leaves 100, still over) then middle (leaves 50, under)
    const toDelete = selectFilesToPrune(files, 80);
    assert.deepEqual(toDelete, ['oldest.jpg', 'middle.jpg']);
  });

  test('mtime ordering is used, not array order', () => {
    const files = [
      { name: 'newest.jpg', sizeBytes: 50, mtimeMs: 100 },
      { name: 'oldest.jpg', sizeBytes: 50, mtimeMs: 1 }
    ];
    const toDelete = selectFilesToPrune(files, 50);
    assert.deepEqual(toDelete, ['oldest.jpg']);
  });
});

// =====================================================================
// Darkness gate
// =====================================================================

describe('isDarkEnough', () => {
  test('matches solar.ts/season.ts\'s -6deg civil-twilight convention', () => {
    assert.equal(isDarkEnough(-5.9), false);
    assert.equal(isDarkEnough(-6), false); // exactly at the boundary -- not yet dark
    assert.equal(isDarkEnough(-6.1), true);
    assert.equal(DARKNESS_ELEVATION_DEG, -6);
  });
});

// =====================================================================
// vision.ts: config parsing
// =====================================================================

describe('loadVisionConfig', () => {
  test('defaults to disabled with documented defaults when env is empty', () => {
    const cfg = vision.loadVisionConfig({});
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.pollMs, 120_000);
    assert.equal(cfg.greenThreshold, DEFAULT_GREEN_THRESHOLD);
    assert.equal(cfg.retentionDays, 30);
    assert.equal(cfg.framesBudgetMb, 300);
  });

  test('VISION_ENABLED accepts "true"/"1" case-insensitively, rejects everything else', () => {
    assert.equal(vision.loadVisionConfig({ VISION_ENABLED: 'true' }).enabled, true);
    assert.equal(vision.loadVisionConfig({ VISION_ENABLED: 'TRUE' }).enabled, true);
    assert.equal(vision.loadVisionConfig({ VISION_ENABLED: '1' }).enabled, true);
    assert.equal(vision.loadVisionConfig({ VISION_ENABLED: 'false' }).enabled, false);
    assert.equal(vision.loadVisionConfig({ VISION_ENABLED: 'yes' }).enabled, false);
    assert.equal(vision.loadVisionConfig({ VISION_ENABLED: '' }).enabled, false);
  });

  test('rejects a clearly-invalid VISION_POLL_MS', () => {
    assert.throws(() => vision.loadVisionConfig({ VISION_POLL_MS: '-5' }));
    assert.throws(() => vision.loadVisionConfig({ VISION_POLL_MS: 'abc' }));
  });

  test('rejects an out-of-range VISION_GREEN_THRESHOLD', () => {
    assert.throws(() => vision.loadVisionConfig({ VISION_GREEN_THRESHOLD: '1.5' }));
    assert.throws(() => vision.loadVisionConfig({ VISION_GREEN_THRESHOLD: '-0.1' }));
  });

  test('accepts a valid full override set', () => {
    const cfg = vision.loadVisionConfig({
      VISION_ENABLED: 'true',
      VISION_POLL_MS: '60000',
      VISION_GREEN_THRESHOLD: '0.05',
      VISION_RETENTION_DAYS: '10',
      VISION_FRAMES_BUDGET_MB: '50'
    });
    assert.deepEqual(cfg, { enabled: true, pollMs: 60000, greenThreshold: 0.05, retentionDays: 10, framesBudgetMb: 50 });
  });
});

// =====================================================================
// runVisionCycle: disabled-by-default + darkness gating (injectable
// fetch/clock -- proves zero live network calls in every test in this file)
// =====================================================================

describe('runVisionCycle gating', () => {
  test('VISION_ENABLED absent -> zero fetch calls', async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount += 1;
      throw new Error('fetch must never be called while VISION_ENABLED is unset');
    }) as unknown as typeof fetch;

    await vision.runVisionCycle({ env: {}, fetchImpl });
    assert.equal(callCount, 0);
  });

  test('VISION_ENABLED=false -> zero fetch calls', async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount += 1;
      throw new Error('must not be called');
    }) as unknown as typeof fetch;

    await vision.runVisionCycle({ env: { VISION_ENABLED: 'false' }, fetchImpl });
    assert.equal(callCount, 0);
  });

  test('VISION_ENABLED=true but daylight (noon UTC, midsummer) -> zero fetch calls', async () => {
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount += 1;
      throw new Error('must not be called in daylight');
    }) as unknown as typeof fetch;

    // Midsummer noon UTC -- Tromso is well above the horizon (midnight sun
    // season), nowhere near the -6deg darkness gate.
    const noonMidsummer = Date.parse('2026-06-21T12:00:00.000Z');

    await vision.runVisionCycle({ env: { VISION_ENABLED: 'true' }, fetchImpl, now: () => noonMidsummer });
    assert.equal(callCount, 0);
  });

  test('VISION_ENABLED=true AND dark (midwinter midnight UTC) -> fetches all 4 cameras', async () => {
    const calledUrls: string[] = [];
    const bytes = encodeSolidJpeg(32, 32, [20, 20, 20]);
    const fetchImpl = (async (url: string) => {
      calledUrls.push(url);
      return makeFakeResponse(bytes);
    }) as unknown as typeof fetch;

    const midwinterMidnight = Date.parse('2026-01-10T00:00:00.000Z');

    await vision.runVisionCycle({ env: { VISION_ENABLED: 'true' }, fetchImpl, now: () => midwinterMidnight });
    assert.equal(calledUrls.length, 4);
    assert.ok(calledUrls.every((url) => url.startsWith('https://weather.cs.uit.no/cam/')));
  });

  test('User-Agent header identifies the app + contact, only sent when enabled', async () => {
    let capturedHeaders: Record<string, string> | undefined;
    const bytes = encodeSolidJpeg(32, 32, [20, 20, 20]);
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return makeFakeResponse(bytes);
    }) as unknown as typeof fetch;

    const midwinterMidnight = Date.parse('2026-01-10T00:00:00.000Z');
    await vision.runVisionCycle({ env: { VISION_ENABLED: 'true' }, fetchImpl, now: () => midwinterMidnight });

    assert.equal(capturedHeaders?.['User-Agent'], vision.VISION_USER_AGENT);
    assert.match(vision.VISION_USER_AGENT, /project-aurora-vision/);
  });
});

// =====================================================================
// runVisionCycle: per-camera isolation, persistence, JSONL round-trip
// =====================================================================

describe('runVisionCycle: persistence + per-camera isolation', () => {
  const midwinterMidnight = Date.parse('2026-01-10T00:00:00.000Z');

  test('one camera failing never blocks the others (per-camera isolation)', async () => {
    const greenBytes = encodeSolidJpeg(32, 32, [10, 240, 10]);
    const fetchImpl = (async (url: string) => {
      if (url.includes('cam_east')) {
        throw new Error('simulated network failure for this camera only');
      }
      return makeFakeResponse(greenBytes);
    }) as unknown as typeof fetch;

    await assert.doesNotReject(vision.runVisionCycle({ env: { VISION_ENABLED: 'true' }, fetchImpl, now: () => midwinterMidnight }));

    const stats = await vision.readVisionStats();
    const cameraIds = new Set(stats.map((record) => record.cameraId));
    // 3 of 4 cameras succeeded and recorded a stats line; the failing one did not.
    assert.equal(cameraIds.size, 3);
    assert.ok(!cameraIds.has('uit-cs-wcam1')); // east == cam_east
  });

  test('a non-2xx response is treated as a per-camera failure, not a crash', async () => {
    const bytes = encodeSolidJpeg(32, 32, [20, 20, 20]);
    const fetchImpl = (async () => makeFakeResponse(bytes, false, 503)) as unknown as typeof fetch;

    await assert.doesNotReject(vision.runVisionCycle({ env: { VISION_ENABLED: 'true' }, fetchImpl, now: () => midwinterMidnight }));
    const stats = await vision.readVisionStats();
    assert.equal(stats.length, 0);
  });

  test('stats JSONL round-trip: one record per camera, correct fields', async () => {
    const greenBytes = encodeSolidJpeg(32, 32, [10, 240, 10]);
    const fetchImpl = (async () => makeFakeResponse(greenBytes)) as unknown as typeof fetch;

    await vision.runVisionCycle({ env: { VISION_ENABLED: 'true', VISION_GREEN_THRESHOLD: '0.03' }, fetchImpl, now: () => midwinterMidnight });

    const stats = await vision.readVisionStats();
    assert.equal(stats.length, 4);
    for (const record of stats) {
      assert.equal(typeof record.ts, 'string');
      assert.ok(['uit-cs-wcam0', 'uit-cs-wcam1', 'uit-cs-wcam2', 'uit-cs-wcam3'].includes(record.cameraId));
      assert.ok(record.greenExcessFraction > 0.9);
      assert.equal(record.aboveThreshold, true);
      assert.equal(record.threshold, 0.03);
    }
  });

  test('a detection record + positive saved frame appear after 3 of 5 above-threshold ticks on one camera', async () => {
    const greenBytes = encodeSolidJpeg(32, 32, [10, 240, 10]);
    const grayBytes = encodeSolidJpeg(32, 32, [20, 20, 20]);
    let tick = 0;
    // south camera (wcam0): green, gray, green, green -- 4th tick reaches 3-of-(so-far-4) -> detection.
    const pattern = [true, false, true, true, true];

    const fetchImpl = (async (url: string) => {
      if (!url.includes('cam_south')) {
        return makeFakeResponse(grayBytes); // other cameras stay quiet throughout
      }
      const isGreen = pattern[Math.min(tick, pattern.length - 1)];
      return makeFakeResponse(isGreen ? greenBytes : grayBytes);
    }) as unknown as typeof fetch;

    for (; tick < 4; tick++) {
      await vision.runVisionCycle({
        env: { VISION_ENABLED: 'true' },
        fetchImpl,
        now: () => midwinterMidnight + tick * 120_000
      });
    }

    const detections = await vision.readVisionDetections();
    const southDetections = detections.filter((record) => record.cameraId === 'uit-cs-wcam0');
    assert.equal(southDetections.length, 1);
    assert.equal(southDetections[0].consecutiveCount, 3); // 3 greens (ticks 0,2,3) among the 4 seen so far
    assert.equal(southDetections[0].windowSize, 4);

    const frameFiles = await fs.readdir(framesDir).catch(() => []);
    assert.ok(frameFiles.some((name) => name.includes('uit-cs-wcam0') && name.endsWith('_pos.jpg')));
  });

  test('non-detection frames are saved only 1-in-30 (negative sampling), not every tick', async () => {
    const grayBytes = encodeSolidJpeg(32, 32, [20, 20, 20]);
    const fetchImpl = (async () => makeFakeResponse(grayBytes)) as unknown as typeof fetch;

    // First tick (sampleIndex 0) is always sampled; the next few should not be.
    for (let tick = 0; tick < 3; tick++) {
      await vision.runVisionCycle({
        env: { VISION_ENABLED: 'true' },
        fetchImpl,
        now: () => midwinterMidnight + tick * 120_000
      });
    }

    const frameFiles = await fs.readdir(framesDir).catch(() => []);
    const southNegatives = frameFiles.filter((name) => name.includes('uit-cs-wcam0') && name.endsWith('_neg.jpg'));
    assert.equal(southNegatives.length, 1); // only the tick-0 sample, not ticks 1/2
  });
});

// =====================================================================
// Frame-archive size pruning (via the real fs, in the temp cwd)
// =====================================================================

describe('pruneFrameArchive (impure wrapper over selectFilesToPrune)', () => {
  test('deletes oldest frame files down to the configured budget', async () => {
    await fs.mkdir(framesDir, { recursive: true });
    const names = ['a.jpg', 'b.jpg', 'c.jpg'];
    for (const name of names) {
      await fs.writeFile(path.join(framesDir, name), Buffer.alloc(1024 * 1024)); // 1MB each
    }
    // Force distinguishable mtimes, oldest to newest.
    const base = Date.now() - 10_000;
    for (let i = 0; i < names.length; i++) {
      const t = new Date(base + i * 1000);
      await fs.utimes(path.join(framesDir, names[i]), t, t);
    }

    const cfg = vision.loadVisionConfig({ VISION_FRAMES_BUDGET_MB: '2' }); // 2MB budget, 3MB present
    await vision.pruneFrameArchive(cfg);

    const remaining = await fs.readdir(framesDir);
    assert.equal(remaining.length, 2);
    assert.ok(!remaining.includes('a.jpg')); // oldest deleted first
    assert.ok(remaining.includes('b.jpg'));
    assert.ok(remaining.includes('c.jpg'));
  });

  test('no-ops (and never throws) when the frames directory does not exist yet', async () => {
    await fs.rm(framesDir, { recursive: true, force: true });
    const cfg = vision.loadVisionConfig({ VISION_FRAMES_BUDGET_MB: '1' });
    await assert.doesNotReject(vision.pruneFrameArchive(cfg));
  });
});

// =====================================================================
// computeVisionSummary (pure join)
// =====================================================================

describe('computeVisionSummary', () => {
  const CAMERA_IDS = ['uit-cs-wcam0', 'uit-cs-wcam1'];

  function makeStat(overrides: Partial<VisionStatsRecord> = {}): VisionStatsRecord {
    return {
      ts: '2026-01-10T20:00:00.000Z',
      cameraId: 'uit-cs-wcam0',
      greenExcessFraction: 0.01,
      meanLuminance: 50,
      meanR: 40,
      meanG: 50,
      meanB: 40,
      aboveThreshold: false,
      threshold: 0.03,
      ...overrides
    };
  }

  test('only counts records within the trailing hour, per camera', () => {
    const now = () => Date.parse('2026-01-10T21:00:00.000Z');
    const stats = [
      makeStat({ ts: '2026-01-10T20:30:00.000Z', greenExcessFraction: 0.1 }), // within last hour
      makeStat({ ts: '2026-01-10T19:00:00.000Z', greenExcessFraction: 0.9 }) // too old -- excluded
    ];
    const summary = computeVisionSummary(stats, [], CAMERA_IDS, now);
    const south = summary.cameras.find((c) => c.cameraId === 'uit-cs-wcam0');
    assert.equal(south?.framesLastHour, 1);
    assert.equal(south?.meanGreenExcessFractionLastHour, 0.1);
  });

  test('cameras with no recent frames report null means, not NaN/0', () => {
    const now = () => Date.parse('2026-01-10T21:00:00.000Z');
    const summary = computeVisionSummary([], [], CAMERA_IDS, now);
    for (const camera of summary.cameras) {
      assert.equal(camera.framesLastHour, 0);
      assert.equal(camera.meanGreenExcessFractionLastHour, null);
      assert.equal(camera.lastFrameTs, null);
    }
  });

  test('detectionsToday counts only records on the current Oslo calendar day', () => {
    const now = () => Date.parse('2026-01-10T12:00:00.000Z'); // 13:00 Oslo (winter, UTC+1)
    const detections: VisionDetectionRecord[] = [
      { ts: '2026-01-10T10:00:00.000Z', cameraId: 'uit-cs-wcam0', fraction: 0.1, consecutiveCount: 3, windowSize: 5 }, // today (11:00 Oslo)
      { ts: '2026-01-08T20:00:00.000Z', cameraId: 'uit-cs-wcam0', fraction: 0.1, consecutiveCount: 3, windowSize: 5 } // two days before (21:00 Oslo, Jan 8)
    ];
    const summary = computeVisionSummary([], detections, CAMERA_IDS, now);
    assert.equal(summary.detectionsToday, 1);
  });
});

// =====================================================================
// Admin route: GET /v1/admin/vision (token-gated, same pattern as the
// other admin routes)
// =====================================================================

describe('GET /v1/admin/vision', () => {
  const ADMIN_TOKEN = 'test-admin-token';
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    vision.registerVisionRoutes(app, ADMIN_TOKEN);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  test('rejects a request with no token', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/admin/vision' });
    assert.equal(response.statusCode, 401);
  });

  test('rejects a request with the wrong token', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/admin/vision', headers: { 'x-admin-token': 'nope' } });
    assert.equal(response.statusCode, 401);
  });

  test('rejects every request when adminToken is configured empty (fail-closed)', async () => {
    const openApp = Fastify({ logger: false });
    vision.registerVisionRoutes(openApp, '');
    await openApp.ready();
    const response = await openApp.inject({ method: 'GET', url: '/v1/admin/vision', headers: { 'x-admin-token': '' } });
    assert.equal(response.statusCode, 401);
    await openApp.close();
  });

  test('accepts the correct token and returns a summary shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/admin/vision', headers: { 'x-admin-token': ADMIN_TOKEN } });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(typeof body.generatedAt, 'string');
    assert.ok(Array.isArray(body.cameras));
    assert.equal(typeof body.detectionsToday, 'number');
  });
});

// =====================================================================
// startVisionPipeline: no timer at all while disabled
// =====================================================================

describe('startVisionPipeline', () => {
  test('does not throw, and stopVisionForTests is safe to call, when disabled', () => {
    assert.doesNotThrow(() => vision.startVisionPipeline({ env: {} }));
    assert.doesNotThrow(() => vision.stopVisionForTests());
  });

  test('calling stopVisionForTests when nothing was started is a safe no-op', () => {
    vision.stopVisionForTests();
    assert.doesNotThrow(() => vision.stopVisionForTests());
  });

  test('when enabled, the interval actually drives runVisionCycle (fetch observed after advancing fake time)', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    let callCount = 0;
    const bytes = encodeSolidJpeg(8, 8, [20, 20, 20]);
    const fetchImpl = (async () => {
      callCount += 1;
      return makeFakeResponse(bytes);
    }) as unknown as typeof fetch;

    const midwinterMidnight = Date.parse('2026-01-10T00:00:00.000Z');
    vision.startVisionPipeline({
      env: { VISION_ENABLED: 'true', VISION_POLL_MS: '1000' },
      fetchImpl,
      now: () => midwinterMidnight
    });

    t.mock.timers.tick(1000);
    vision.stopVisionForTests(); // no further ticks -- only this one cycle's async work is in flight

    // The interval callback fires synchronously w.r.t. the mock clock, but
    // the work inside (fetch/decode/fs writes) is real async I/O -- wait on
    // real (unmocked) timers long enough for it to fully settle before this
    // test (and the file's outer after() temp-dir cleanup) proceeds, so a
    // straggler fs write can never race a directory removal.
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.ok(callCount >= 4); // all 4 cameras polled at least once
  });
});
