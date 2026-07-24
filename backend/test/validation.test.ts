// Tests for the PURE logic in backend/src/validation.ts: no filesystem, no
// network, no chdir needed here (contrast with test/validation-integration.test.ts,
// which covers the impure read/write/fetch/route side of this module).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { getOsloOffset } from '../src/sources.js';
import {
  buildPredictionRecord,
  computeObservedMaxKp,
  computeValidationReport,
  parseObservedKpEntry
} from '../src/validation.js';
import type { ObservedNightRecord, PredictionRecord, PredictionSpotRecord } from '../src/validation.js';
import type { DarknessSeasonState, KpTrend, SpotScoreResult, TonightSnapshot } from '../src/types.js';

// --- Fixture helpers ---

/** Mirrors the equivalent helper in test/alerts.test.ts: converts an Oslo
 * wall-clock (dayKey, hour) into the epoch ms that corresponds to it, so
 * fixtures can be phrased in local time instead of raw UTC arithmetic. */
function osloLocalToIso(dayKey: string, hour: number, minute = 0): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getOsloOffset(guess);
  const sign = offset[0] === '-' ? -1 : 1;
  const [offsetHours, offsetMinutes] = offset.slice(1).split(':').map(Number);
  const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;
  return new Date(guess.getTime() - offsetMs).toISOString();
}

function makeSpotRecord(overrides: Partial<PredictionSpotRecord> = {}): PredictionSpotRecord {
  return {
    spotId: 'ersfjordbotn',
    score: 50,
    bestWindowStart: '2026-01-10T20:00:00.000Z',
    bestWindowEnd: '2026-01-10T23:00:00.000Z',
    ...overrides
  };
}

function makePredictionRecord(nightKey: string, spotScores: number[], recordedAt = '2026-01-10T20:00:00.000Z'): PredictionRecord {
  return {
    recordedAt,
    nightKey,
    kp: { current: 3, tonightPeak: 4, peakNext12h: 4 },
    spots: spotScores.map((score, index) => makeSpotRecord({ spotId: `spot-${index}`, score })),
    dataQuality: { usingFallbackKp: false, fallbackWeatherSpotIds: [] },
    seasonClosed: false
  };
}

function makeObservedRecord(nightKey: string, maxKp: number | null, source: ObservedNightRecord['source'] = 'noaa_measured_3h'): ObservedNightRecord {
  return { nightKey, recordedAt: `${nightKey}T16:00:00.000Z`, maxKp, source };
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

function makeSnapshot(score: number, overrides: Partial<TonightSnapshot> = {}): TonightSnapshot {
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
    darkness: OPEN_DARKNESS,
    ...overrides
  };
}

// --- buildPredictionRecord ---

describe('buildPredictionRecord', () => {
  test('maps snapshot fields into the compact record shape, including nightKey derived from `now`', () => {
    const nowMs = new Date(osloLocalToIso('2026-01-10', 20)).getTime();
    const snapshot = makeSnapshot(63, {
      kp: { current: 2, peakNext12h: 6, tonightPeak: 5, hourly: [2, 3, 4] },
      dataQuality: { usingFallbackKp: true, fallbackWeatherSpotIds: ['ersfjordbotn'] }
    });

    const record = buildPredictionRecord(snapshot, () => nowMs);

    assert.equal(record.recordedAt, new Date(nowMs).toISOString());
    assert.equal(record.nightKey, '2026-01-10');
    assert.deepEqual(record.kp, { current: 2, tonightPeak: 5, peakNext12h: 6 });
    assert.equal(record.spots.length, 1);
    assert.deepEqual(record.spots[0], {
      spotId: 'ersfjordbotn',
      score: 63,
      bestWindowStart: '2026-01-10T20:00:00.000Z',
      bestWindowEnd: '2026-01-10T23:00:00.000Z'
    });
    assert.deepEqual(record.dataQuality, { usingFallbackKp: true, fallbackWeatherSpotIds: ['ersfjordbotn'] });
    assert.equal(record.seasonClosed, false);
  });

  test('seasonClosed reflects snapshot.darkness.seasonClosed, not dataQuality', () => {
    const nowMs = new Date(osloLocalToIso('2026-01-10', 20)).getTime();
    const snapshot = makeSnapshot(10, { darkness: { seasonClosed: true, seasonReturns: '2026-08-01' } });

    const record = buildPredictionRecord(snapshot, () => nowMs);
    assert.equal(record.seasonClosed, true);
  });

  test('an 02:00 Oslo timestamp rolls the nightKey back to the previous calendar day', () => {
    const nowMs = new Date(osloLocalToIso('2026-01-11', 2)).getTime();
    const record = buildPredictionRecord(makeSnapshot(50), () => nowMs);
    assert.equal(record.nightKey, '2026-01-10');
  });
});

// --- parseObservedKpEntry ---

describe('parseObservedKpEntry', () => {
  test('parses the live object shape ({time_tag, Kp})', () => {
    const parsed = parseObservedKpEntry({ time_tag: '2026-01-10 15:00:00.000', Kp: 5, a_running: 4.33 });
    assert.deepEqual(parsed, { timeIso: '2026-01-10 15:00:00.000Z', kp: 5 });
  });

  test('accepts alternate Kp key casings (kp, kp_index, kP)', () => {
    assert.deepEqual(parseObservedKpEntry({ time_tag: '2026-01-10T15:00:00Z', kp: 6 }), {
      timeIso: '2026-01-10T15:00:00Z',
      kp: 6
    });
    assert.deepEqual(parseObservedKpEntry({ time_tag: '2026-01-10T15:00:00Z', kp_index: 7 }), {
      timeIso: '2026-01-10T15:00:00Z',
      kp: 7
    });
    assert.deepEqual(parseObservedKpEntry({ time_tag: '2026-01-10T15:00:00Z', kP: 8 }), {
      timeIso: '2026-01-10T15:00:00Z',
      kp: 8
    });
  });

  test('does not add a trailing Z when the time already carries an explicit offset', () => {
    const parsed = parseObservedKpEntry({ time_tag: '2026-01-10T15:00:00+02:00', Kp: 3 });
    assert.deepEqual(parsed, { timeIso: '2026-01-10T15:00:00+02:00', kp: 3 });
  });

  test('parses the legacy array shape ([time, kp, ...])', () => {
    const parsed = parseObservedKpEntry(['2026-01-10 15:00:00', '5', 'observed']);
    assert.deepEqual(parsed, { timeIso: '2026-01-10 15:00:00Z', kp: 5 });
  });

  test('garbage rows are rejected without throwing', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      42,
      'a plain string',
      {},
      { time_tag: 'not a real field on its own' }, // no Kp-like field at all
      { Kp: 5 }, // missing time
      ['2026-01-10T15:00:00Z'], // missing kp value
      ['2026-01-10T15:00:00Z', 'not-a-number'],
      [123, 5] // time isn't a string
    ];

    for (const entry of garbage) {
      assert.doesNotThrow(() => parseObservedKpEntry(entry));
      assert.equal(parseObservedKpEntry(entry), null);
    }
  });
});

// --- computeObservedMaxKp ---

describe('computeObservedMaxKp', () => {
  test('takes the max Kp among entries inside the 18:00->06:00 Oslo dark-hours window, excluding daytime entries (winter date)', () => {
    const nightKey = '2026-01-10'; // winter: Oslo standard time, UTC+1, DST-agnostic
    const entries = [
      { timeIso: osloLocalToIso('2026-01-10', 20), kp: 6 }, // in window (evening)
      { timeIso: osloLocalToIso('2026-01-11', 3), kp: 7 }, // in window (early morning, next calendar day)
      { timeIso: osloLocalToIso('2026-01-10', 12), kp: 9 }, // excluded: broad daylight
      { timeIso: osloLocalToIso('2026-01-11', 10), kp: 9 } // excluded: well after the window's 06:00 cutoff
    ];

    assert.equal(computeObservedMaxKp(entries, nightKey), 7);
  });

  test('boundary hours 18 and 6 are included, 17 and 7 are not', () => {
    const nightKey = '2026-01-10';
    const entries = [
      { timeIso: osloLocalToIso('2026-01-10', 18), kp: 4 },
      { timeIso: osloLocalToIso('2026-01-11', 6), kp: 4 },
      { timeIso: osloLocalToIso('2026-01-10', 17), kp: 9 },
      { timeIso: osloLocalToIso('2026-01-11', 7), kp: 9 }
    ];

    assert.equal(computeObservedMaxKp(entries, nightKey), 4);
  });

  test('empty entry list returns null', () => {
    assert.equal(computeObservedMaxKp([], '2026-01-10'), null);
  });

  test('entries entirely outside the window return null even if non-empty', () => {
    const entries = [{ timeIso: osloLocalToIso('2026-01-10', 12), kp: 9 }];
    assert.equal(computeObservedMaxKp(entries, '2026-01-10'), null);
  });
});

// --- computeValidationReport ---

describe('computeValidationReport', () => {
  test('empty predictions and observed produce a zeroed-out report', () => {
    const report = computeValidationReport([], [], () => new Date('2026-01-15T00:00:00.000Z').getTime());

    assert.equal(report.totalNightsWithPrediction, 0);
    assert.equal(report.totalNightsWithObservedOutcome, 0);
    assert.equal(report.bands.length, 5);
    for (const band of report.bands) {
      assert.equal(band.nights, 0);
      assert.equal(band.meanObservedMaxKp, null);
      assert.deepEqual(band.observedMaxKpValues, []);
    }
    assert.deepEqual(report.hitRate, {
      alertThreshold: 45,
      kpHitThreshold: 4,
      nightsPredictedAboveThreshold: 0,
      nightsWithHit: 0,
      hitRate: null
    });
    assert.equal(report.generatedAt, '2026-01-15T00:00:00.000Z');
  });

  test('a night is banded by its MAX score across ticks, not the first or last tick', () => {
    // Two ticks the same night: 30, then later 55. The per-night best (55)
    // must land the night in the 40-59 band, not 20-39.
    const predictions = [makePredictionRecord('2026-01-10', [30]), makePredictionRecord('2026-01-10', [55])];
    const observed = [makeObservedRecord('2026-01-10', 3)];

    const report = computeValidationReport(predictions, observed);

    const band4059 = report.bands.find((b) => b.label === '40-59');
    const band2039 = report.bands.find((b) => b.label === '20-39');
    assert.equal(band4059?.nights, 1);
    assert.deepEqual(band4059?.observedMaxKpValues, [3]);
    assert.equal(band2039?.nights, 0);
  });

  test('a tick with multiple spots uses the best (max) spot score for that tick', () => {
    const predictions = [makePredictionRecord('2026-01-10', [10, 85, 40])];
    const observed = [makeObservedRecord('2026-01-10', 6)];

    const report = computeValidationReport(predictions, observed);
    const band80100 = report.bands.find((b) => b.label === '80-100');
    assert.equal(band80100?.nights, 1);
  });

  test('boundary scores land in the correct band (19/20 and 79/80 edges)', () => {
    const predictions = [
      makePredictionRecord('2026-01-01', [19]),
      makePredictionRecord('2026-01-02', [20]),
      makePredictionRecord('2026-01-03', [79]),
      makePredictionRecord('2026-01-04', [80])
    ];
    const observed = [
      makeObservedRecord('2026-01-01', 1),
      makeObservedRecord('2026-01-02', 1),
      makeObservedRecord('2026-01-03', 1),
      makeObservedRecord('2026-01-04', 1)
    ];

    const report = computeValidationReport(predictions, observed);
    assert.equal(report.bands.find((b) => b.label === '0-19')?.nights, 1);
    assert.equal(report.bands.find((b) => b.label === '20-39')?.nights, 1);
    assert.equal(report.bands.find((b) => b.label === '60-79')?.nights, 1);
    assert.equal(report.bands.find((b) => b.label === '80-100')?.nights, 1);
  });

  test('nights with a prediction but no matching observed record are excluded from calibration bands, but still counted in totalNightsWithPrediction', () => {
    const predictions = [makePredictionRecord('2026-01-10', [90]), makePredictionRecord('2026-01-11', [90])];
    const observed = [makeObservedRecord('2026-01-10', 5)]; // 2026-01-11 has no observed record at all

    const report = computeValidationReport(predictions, observed);

    assert.equal(report.totalNightsWithPrediction, 2);
    assert.equal(report.totalNightsWithObservedOutcome, 1);
    const band80100 = report.bands.find((b) => b.label === '80-100');
    assert.equal(band80100?.nights, 1, 'only the night WITH an observed outcome counts toward calibration');
  });

  test('an observed record with maxKp: null (fetch failed) is excluded from calibration and from totalNightsWithObservedOutcome', () => {
    const predictions = [makePredictionRecord('2026-01-10', [90])];
    const observed = [makeObservedRecord('2026-01-10', null, 'unknown')];

    const report = computeValidationReport(predictions, observed);

    assert.equal(report.totalNightsWithPrediction, 1);
    assert.equal(report.totalNightsWithObservedOutcome, 0, 'a null-maxKp observed record must not count as an observed outcome');
    const band80100 = report.bands.find((b) => b.label === '80-100');
    assert.equal(band80100?.nights, 0);
  });

  test('meanObservedMaxKp averages (rounded to 2dp) and observedMaxKpValues is sorted ascending', () => {
    const predictions = [
      makePredictionRecord('2026-01-01', [50]),
      makePredictionRecord('2026-01-02', [55]),
      makePredictionRecord('2026-01-03', [58])
    ];
    const observed = [
      makeObservedRecord('2026-01-01', 5),
      makeObservedRecord('2026-01-02', 2),
      makeObservedRecord('2026-01-03', 8)
    ];

    const report = computeValidationReport(predictions, observed);
    const band = report.bands.find((b) => b.label === '40-59');
    assert.deepEqual(band?.observedMaxKpValues, [2, 5, 8]);
    assert.equal(band?.meanObservedMaxKp, Number(((5 + 2 + 8) / 3).toFixed(2)));
  });

  test('hit-rate numerator/denominator: only nights predicted >=45 WITH an observed outcome count toward the denominator', () => {
    const predictions = [
      makePredictionRecord('2026-01-01', [80]), // >=45, observed kp>=4 -> hit
      makePredictionRecord('2026-01-02', [50]), // >=45, observed kp<4 -> predicted-but-miss
      makePredictionRecord('2026-01-03', [30]), // <45 -> not counted at all
      makePredictionRecord('2026-01-04', [90]) // >=45 but NO observed record -> excluded from denominator
    ];
    const observed = [makeObservedRecord('2026-01-01', 6), makeObservedRecord('2026-01-02', 2)];

    const report = computeValidationReport(predictions, observed);

    assert.equal(report.hitRate.nightsPredictedAboveThreshold, 2);
    assert.equal(report.hitRate.nightsWithHit, 1);
    assert.equal(report.hitRate.hitRate, 0.5);
  });

  test('hitRate is null when nightsPredictedAboveThreshold is 0 (avoids divide-by-zero)', () => {
    const predictions = [makePredictionRecord('2026-01-01', [20])];
    const observed = [makeObservedRecord('2026-01-01', 6)];

    const report = computeValidationReport(predictions, observed);
    assert.equal(report.hitRate.nightsPredictedAboveThreshold, 0);
    assert.equal(report.hitRate.hitRate, null);
  });

  test('a score of exactly the alert threshold (45) counts toward the hit-rate denominator', () => {
    const predictions = [makePredictionRecord('2026-01-01', [45])];
    const observed = [makeObservedRecord('2026-01-01', 4)];

    const report = computeValidationReport(predictions, observed);
    assert.equal(report.hitRate.nightsPredictedAboveThreshold, 1);
    assert.equal(report.hitRate.nightsWithHit, 1, 'observed kp of exactly 4 (the hit threshold) must count as a hit');
  });
});
