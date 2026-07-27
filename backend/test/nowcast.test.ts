import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  BZ_ACTIVE_THRESHOLD_NT,
  BZ_STIRRING_THRESHOLD_NT,
  BZ_STORMING_THRESHOLD_NT,
  OVATION_ACTIVE_THRESHOLD,
  OVATION_STIRRING_THRESHOLD,
  OVATION_STORMING_THRESHOLD,
  computeLeadTimeMinutes,
  deriveNowcastLevel,
  extractLatestBz,
  extractLatestPlasma,
  extractOvationForecastTime,
  extractOvationProbability,
  fetchNowcastSummary,
  fetchOvationWithQuality,
  fetchSolarWindWithQuality,
  fetchTgoDisturbanceWithQuality,
  pickLatestComplete
} from '../src/nowcast.js';
import { buildTonightSnapshot } from '../src/snapshot.js';
import type { FetchLike } from '../src/sources.js';

// nowcast.ts and its callers follow the same "stub globalThis.fetch, restore
// afterwards" discipline as sources.test.ts / snapshot.test.ts -- no network
// I/O ever occurs in this file.
const realFetch = globalThis.fetch;
const originalSourceTimeoutMs = process.env.SOURCE_TIMEOUT_MS;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (originalSourceTimeoutMs === undefined) {
    delete process.env.SOURCE_TIMEOUT_MS;
  } else {
    process.env.SOURCE_TIMEOUT_MS = originalSourceTimeoutMs;
  }
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

const MAG_URL_FRAGMENT = 'rtsw_mag_1m';
const WIND_URL_FRAGMENT = 'rtsw_wind_1m';
const OVATION_URL_FRAGMENT = 'ovation_aurora_latest';

/** A `fetch` stand-in that never resolves on its own, but rejects with an
 * AbortError as soon as its signal is aborted -- mirrors
 * sources-timeout.test.ts's makeHangingFetch, used here to prove the nowcast
 * fetchers can't hang a refresh cycle either. */
function makeHangingFetch(): FetchLike {
  return (async (_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      });
    })) as unknown as FetchLike;
}

// -----------------------------------------------------------------------------
// deriveNowcastLevel: pure threshold logic
// -----------------------------------------------------------------------------

describe('deriveNowcastLevel: threshold boundaries and AND/OR semantics', () => {
  test('storming requires BOTH bz <= -10 AND ovation >= 50 (exact boundary, both satisfied)', () => {
    assert.equal(
      deriveNowcastLevel({ bz: BZ_STORMING_THRESHOLD_NT, ovationProbability: OVATION_STORMING_THRESHOLD }),
      'storming'
    );
  });

  test('bz one hair short of -10 (with ovation >= 50) is NOT storming -- falls to active via bzActive', () => {
    assert.equal(
      deriveNowcastLevel({ bz: BZ_STORMING_THRESHOLD_NT + 0.01, ovationProbability: OVATION_STORMING_THRESHOLD }),
      'active'
    );
  });

  test('ovation one hair short of 50 (with bz <= -10) is NOT storming -- falls to active via bzActive', () => {
    assert.equal(
      deriveNowcastLevel({ bz: BZ_STORMING_THRESHOLD_NT, ovationProbability: OVATION_STORMING_THRESHOLD - 0.01 }),
      'active'
    );
  });

  test('a strongly southward bz ALONE (low/zero ovation) is active, never storming -- AND not OR', () => {
    assert.equal(deriveNowcastLevel({ bz: -25, ovationProbability: 0 }), 'active');
  });

  test('a high ovation ALONE (bz unavailable) is active, never storming -- AND not OR', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: 90 }), 'active');
  });

  test('active: bz <= -5 exact boundary (ovation unavailable)', () => {
    assert.equal(deriveNowcastLevel({ bz: BZ_ACTIVE_THRESHOLD_NT, ovationProbability: null }), 'active');
  });

  test('bz one hair short of -5 (ovation unavailable) is NOT active -- falls to stirring via bzStirring', () => {
    assert.equal(deriveNowcastLevel({ bz: BZ_ACTIVE_THRESHOLD_NT + 0.01, ovationProbability: null }), 'stirring');
  });

  test('active: ovation >= 20 exact boundary (bz unavailable)', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: OVATION_ACTIVE_THRESHOLD }), 'active');
  });

  test('ovation one hair short of 20 (bz unavailable) is NOT active -- falls to stirring via ovationStirring', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: OVATION_ACTIVE_THRESHOLD - 0.01 }), 'stirring');
  });

  test('stirring: bz < 0 (any southward reading at all), ovation unavailable', () => {
    assert.equal(deriveNowcastLevel({ bz: BZ_STIRRING_THRESHOLD_NT - 0.01, ovationProbability: null }), 'stirring');
  });

  test('bz exactly 0 (not southward) is NOT stirring -- quiet when ovation is also unavailable', () => {
    assert.equal(deriveNowcastLevel({ bz: BZ_STIRRING_THRESHOLD_NT, ovationProbability: null }), 'quiet');
  });

  test('stirring: ovation >= 5 exact boundary, bz unavailable', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: OVATION_STIRRING_THRESHOLD }), 'stirring');
  });

  test('ovation one hair short of 5 (bz unavailable) is NOT stirring -- quiet', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: OVATION_STIRRING_THRESHOLD - 0.01 }), 'quiet');
  });

  test('both sources missing (null/null) is quiet -- never throws, never "active by default"', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: null }), 'quiet');
  });

  test('missing bz only: level derived purely from ovation (graceful single-source degradation)', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: OVATION_STORMING_THRESHOLD }), 'active');
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: 0 }), 'quiet');
  });

  test('missing ovation only: level derived purely from bz (graceful single-source degradation)', () => {
    assert.equal(deriveNowcastLevel({ bz: BZ_STORMING_THRESHOLD_NT, ovationProbability: null }), 'active');
    assert.equal(deriveNowcastLevel({ bz: 3, ovationProbability: null }), 'quiet');
  });

  test('a positive (northward) bz never counts as southward coupling regardless of magnitude', () => {
    assert.equal(deriveNowcastLevel({ bz: 15, ovationProbability: null }), 'quiet');
  });

  // NowcastLevelInputs has no `tgo` field at all -- deriveNowcastLevel's own
  // type signature makes it structurally impossible for the (always-null,
  // stubbed) TGO reading to influence the level. fetchTgoDisturbanceWithQuality
  // takes no fetchImpl/parameters, so there's no way to inject a non-null TGO
  // value from a test to double-check this at the fetchNowcastSummary level
  // without touching application source -- flagged as untestable beyond this
  // structural guarantee until TGO is wired up for real.
  test('deriveNowcastLevel has no TGO parameter -- confirmed via fetchTgoDisturbanceWithQuality always stubbing null', async () => {
    const tgo = await fetchTgoDisturbanceWithQuality();
    assert.equal(tgo.tgoDisturbanceNt, null);
    assert.equal(tgo.usingFallback, true);
  });
});

// -----------------------------------------------------------------------------
// RTSW mag/plasma parsers
// -----------------------------------------------------------------------------

describe('pickLatestComplete / extractLatestBz: rtsw_mag_1m-shaped rows', () => {
  test('picks the newest COMPLETE row, skipping a row missing bz_gsm entirely even when it is the latest overall', () => {
    const payload = [
      { time_tag: '2026-07-27T08:20:00', active: true, bz_gsm: 2.0 },
      { time_tag: '2026-07-27T08:25:00', active: true }, // latest overall, but bz_gsm is absent entirely
      { time_tag: '2026-07-27T08:15:00', active: true, bz_gsm: 3.0 }
    ];

    assert.equal(extractLatestBz(payload), 2.0);
  });

  // CONTRACT SURPRISE (see report): isComplete's `Number.isFinite(Number(candidate.bz_gsm))`
  // check does NOT special-case `null` the way sources.ts's parseCloudLayer
  // does. `Number(null) === 0`, a finite number, so an explicit `bz_gsm: null`
  // is treated as a genuine "0 nT" reading (complete, included), while a
  // field that is entirely ABSENT (`Number(undefined) === NaN`) is correctly
  // excluded. These two "missing data" shapes are handled asymmetrically.
  test('CONTRACT NOTE: an explicit bz_gsm: null is coerced to 0 (a real reading), not excluded as missing -- ' +
    'asymmetric with a field that is entirely absent, which IS excluded', () => {
    const explicitNull = [{ time_tag: '2026-07-27T08:25:00', active: true, bz_gsm: null }];
    assert.equal(extractLatestBz(explicitNull), 0);

    const entirelyAbsent = [{ time_tag: '2026-07-27T08:25:00', active: true }];
    assert.equal(extractLatestBz(entirelyAbsent), null);
  });

  test('prefers an active row over a more recent inactive row', () => {
    const payload = [
      { time_tag: '2026-07-27T08:20:00', active: true, bz_gsm: -2 },
      { time_tag: '2026-07-27T08:25:00', active: false, bz_gsm: -8 } // newer, but not active
    ];

    assert.equal(extractLatestBz(payload), -2);
  });

  test('falls back to the newest complete entry when none of the complete rows are marked active', () => {
    const payload = [
      { time_tag: '2026-07-27T08:20:00', active: true }, // active but bz_gsm absent -> excluded pre-filter
      { time_tag: '2026-07-27T08:22:00', active: false, bz_gsm: -3 },
      { time_tag: '2026-07-27T08:25:00', active: false, bz_gsm: -5 } // newest complete row
    ];

    assert.equal(extractLatestBz(payload), -5);
  });

  test('empty array yields null', () => {
    assert.equal(extractLatestBz([]), null);
  });

  test('a non-array (garbage) payload yields null', () => {
    assert.equal(extractLatestBz({ not: 'an array' }), null);
    assert.equal(extractLatestBz(null), null);
    assert.equal(extractLatestBz('garbage'), null);
  });

  test('an array of garbage rows (non-objects, missing fields) yields null', () => {
    assert.equal(extractLatestBz([1, 'x', null, {}, { time_tag: 'not-a-date' }]), null);
  });

  test('pickLatestComplete is generic and reusable with a custom completeness predicate', () => {
    const payload = [
      { time_tag: '2026-07-27T08:00:00', active: true, custom: 5 },
      { time_tag: '2026-07-27T08:05:00', active: true, custom: 'nope' }
    ];
    const result = pickLatestComplete<{ time_tag?: unknown; active?: unknown; custom?: unknown }>(
      payload,
      (entry) => typeof entry.custom === 'number'
    );
    assert.deepEqual(result, { time_tag: '2026-07-27T08:00:00', active: true, custom: 5 });
  });
});

describe('extractLatestPlasma: rtsw_wind_1m-shaped rows', () => {
  test('a complete row (both proton_speed and proton_density finite) is parsed', () => {
    const payload = [{ time_tag: '2026-07-27T08:28:00', active: true, proton_speed: 386.34, proton_density: 1.39 }];
    assert.deepEqual(extractLatestPlasma(payload), { speed: 386.34, density: 1.39 });
  });

  test('a row with proton_density entirely absent is excluded (isComplete requires both fields present+finite)', () => {
    const payload = [{ time_tag: '2026-07-27T08:28:00', active: true, proton_speed: 400 }];
    assert.deepEqual(extractLatestPlasma(payload), { speed: null, density: null });
  });

  test('a row with proton_speed entirely absent is likewise excluded', () => {
    const payload = [{ time_tag: '2026-07-27T08:28:00', active: true, proton_density: 2 }];
    assert.deepEqual(extractLatestPlasma(payload), { speed: null, density: null });
  });

  // Same Number(null)-is-finite quirk as extractLatestBz's CONTRACT NOTE above:
  // an explicit `null` on either field is coerced to 0 (a real reading), not
  // excluded, because isComplete's own finiteness check doesn't special-case
  // null the way sources.ts's parseCloudLayer does.
  test('CONTRACT NOTE: an explicit proton_speed: null is coerced to 0 (not excluded), matching extractLatestBz\'s quirk', () => {
    const payload = [{ time_tag: '2026-07-27T08:28:00', active: true, proton_speed: null, proton_density: 5 }];
    assert.deepEqual(extractLatestPlasma(payload), { speed: 0, density: 5 });
  });

  test('newest complete active row wins among several', () => {
    const payload = [
      { time_tag: '2026-07-27T08:20:00', active: true, proton_speed: 350, proton_density: 1 },
      { time_tag: '2026-07-27T08:28:00', active: true, proton_speed: 400, proton_density: 2 },
      { time_tag: '2026-07-27T08:24:00', active: false, proton_speed: 999, proton_density: 9 }
    ];
    assert.deepEqual(extractLatestPlasma(payload), { speed: 400, density: 2 });
  });

  test('empty array yields nulls', () => {
    assert.deepEqual(extractLatestPlasma([]), { speed: null, density: null });
  });
});

describe('computeLeadTimeMinutes', () => {
  test('375 km/s at the L1 constant (1,500,000 km) rounds to 67 minutes', () => {
    // 1,500,000 / 375 = 4000s = 66.666...min -> rounds to 67.
    assert.equal(computeLeadTimeMinutes(375), 67);
  });

  test('a faster solar wind speed yields a shorter (but still positive) lead time', () => {
    const fast = computeLeadTimeMinutes(800);
    const slow = computeLeadTimeMinutes(300);
    assert.ok(fast !== null && slow !== null && fast < slow);
  });

  test('null is returned for missing/zero/negative speed', () => {
    assert.equal(computeLeadTimeMinutes(null), null);
    assert.equal(computeLeadTimeMinutes(0), null);
    assert.equal(computeLeadTimeMinutes(-100), null);
  });

  test('null is returned for a non-finite speed (NaN/Infinity)', () => {
    assert.equal(computeLeadTimeMinutes(NaN), null);
    assert.equal(computeLeadTimeMinutes(Infinity), null);
  });
});

// -----------------------------------------------------------------------------
// OVATION parser
// -----------------------------------------------------------------------------

describe('extractOvationProbability: Tromso window (lon 16.9-20.9, lat 67.6-71.6)', () => {
  function ovationPayload(coordinates: unknown) {
    return {
      'Observation Time': '2026-07-27T08:27:00Z',
      'Forecast Time': '2026-07-27T09:35:00Z',
      'Data Format': '[Longitude, Latitude, Aurora]',
      coordinates,
      type: 'MultiPoint'
    };
  }

  test('picks the MAX value inside the window, not the mean/first/last', () => {
    const payload = ovationPayload([
      [18, 69, 10], // inside
      [19, 70, 80], // inside, the max
      [18, 69, 40] // inside
    ]);
    assert.equal(extractOvationProbability(payload), 80);
  });

  test('values outside the window are ignored even if numerically larger', () => {
    const payload = ovationPayload([
      [18, 69, 5], // inside
      [100, 69, 999] // way outside lon window -- must not win
    ]);
    assert.equal(extractOvationProbability(payload), 5);
  });

  test('lon boundary: exactly +2 from center (20.9) is inside; a hair beyond (20.91) is outside', () => {
    const inside = ovationPayload([[20.9, 69.6, 7]]);
    const outside = ovationPayload([[20.91, 69.6, 999]]);
    assert.equal(extractOvationProbability(inside), 7);
    assert.equal(extractOvationProbability(outside), null);
  });

  test('lon boundary: exactly -2 from center (16.9) is inside; a hair beyond (16.89) is outside', () => {
    const inside = ovationPayload([[16.9, 69.6, 7]]);
    const outside = ovationPayload([[16.89, 69.6, 999]]);
    assert.equal(extractOvationProbability(inside), 7);
    assert.equal(extractOvationProbability(outside), null);
  });

  test('lat boundary: exactly +2 from center (71.6) is inside; a hair beyond (71.61) is outside', () => {
    const inside = ovationPayload([[18.9, 71.6, 7]]);
    const outside = ovationPayload([[18.9, 71.61, 999]]);
    assert.equal(extractOvationProbability(inside), 7);
    assert.equal(extractOvationProbability(outside), null);
  });

  test('lat boundary: exactly -2 from center (67.6) is inside; a hair beyond (67.59) is outside', () => {
    const inside = ovationPayload([[18.9, 67.6, 7]]);
    const outside = ovationPayload([[18.9, 67.59, 999]]);
    assert.equal(extractOvationProbability(inside), 7);
    assert.equal(extractOvationProbability(outside), null);
  });

  test('empty coordinates array yields null', () => {
    assert.equal(extractOvationProbability(ovationPayload([])), null);
  });

  test('malformed rows (non-array, too short, non-numeric fields) are skipped gracefully', () => {
    const payload = ovationPayload([
      'garbage',
      [18.9],
      [18.9, 69.6],
      [18.9, 69.6, 'not-a-number'],
      ['not-a-number', 69.6, 5],
      [18.9, 69.6, 42] // the only valid row
    ]);
    assert.equal(extractOvationProbability(payload), 42);
  });

  test('coordinates not an array at all yields null', () => {
    assert.equal(extractOvationProbability(ovationPayload('nope')), null);
  });

  test('a completely malformed (non-object) payload yields null', () => {
    assert.equal(extractOvationProbability(null), null);
    assert.equal(extractOvationProbability('garbage'), null);
    assert.equal(extractOvationProbability(42), null);
  });

  test('a custom lat/lon window can be requested (function is not hardcoded to Tromso internally)', () => {
    const payload = ovationPayload([
      [18.9, 69.6, 999], // outside a custom, far-away window
      [50, 10, 15] // inside the custom window
    ]);
    assert.equal(extractOvationProbability(payload, 10, 50), 15);
  });
});

describe('extractOvationForecastTime', () => {
  test('extracts the "Forecast Time" field verbatim', () => {
    assert.equal(
      extractOvationForecastTime({ 'Forecast Time': '2026-07-27T09:35:00Z' }),
      '2026-07-27T09:35:00Z'
    );
  });

  test('missing field yields null', () => {
    assert.equal(extractOvationForecastTime({}), null);
  });

  test('a non-string field yields null', () => {
    assert.equal(extractOvationForecastTime({ 'Forecast Time': 12345 }), null);
  });

  test('an empty-string field yields null (not an empty-but-truthy string)', () => {
    assert.equal(extractOvationForecastTime({ 'Forecast Time': '' }), null);
  });

  test('a non-object payload yields null', () => {
    assert.equal(extractOvationForecastTime(null), null);
    assert.equal(extractOvationForecastTime('garbage'), null);
  });
});

// -----------------------------------------------------------------------------
// fetchSolarWindWithQuality / fetchOvationWithQuality: per-source resilience
// -----------------------------------------------------------------------------

function magPayload(bz: number) {
  return [{ time_tag: '2026-07-27T08:27:00', active: true, bz_gsm: bz, source: 'ACE' }];
}

function windPayload(speed: number, density: number) {
  return [{ time_tag: '2026-07-27T08:28:00', active: true, proton_speed: speed, proton_density: density, source: 'ACE' }];
}

function ovationOkPayload(value: number) {
  return {
    'Observation Time': '2026-07-27T08:27:00Z',
    'Forecast Time': '2026-07-27T09:35:00Z',
    'Data Format': '[Longitude, Latitude, Aurora]',
    coordinates: [[18.9, 69.6, value]],
    type: 'MultiPoint'
  };
}

describe('fetchSolarWindWithQuality: mag + plasma independent resilience', () => {
  test('both mag and plasma succeed -> full reading, usingFallback false', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes(MAG_URL_FRAGMENT)) return jsonResponse(magPayload(-6));
      if (String(url).includes(WIND_URL_FRAGMENT)) return jsonResponse(windPayload(400, 2));
      return jsonResponse({}, false, 500);
    }) as typeof fetch;

    const reading = await fetchSolarWindWithQuality();

    assert.equal(reading.bz, -6);
    assert.equal(reading.solarWindSpeed, 400);
    assert.equal(reading.solarWindDensity, 2);
    assert.equal(reading.leadTimeMinutes, computeLeadTimeMinutes(400));
    assert.equal(reading.usingFallback, false);
  });

  test('mag fails (thrown), plasma succeeds -> partial reading is still "not fallback"', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes(MAG_URL_FRAGMENT)) throw new Error('simulated mag outage');
      if (String(url).includes(WIND_URL_FRAGMENT)) return jsonResponse(windPayload(500, 3));
      return jsonResponse({}, false, 500);
    }) as typeof fetch;

    const reading = await fetchSolarWindWithQuality();

    assert.equal(reading.bz, null);
    assert.equal(reading.solarWindSpeed, 500);
    assert.equal(reading.usingFallback, false);
  });

  test('both mag and plasma fail -> usingFallback true, everything null', async () => {
    globalThis.fetch = (async () => {
      throw new Error('simulated network failure');
    }) as typeof fetch;

    const reading = await fetchSolarWindWithQuality();

    assert.equal(reading.bz, null);
    assert.equal(reading.solarWindSpeed, null);
    assert.equal(reading.solarWindDensity, null);
    assert.equal(reading.leadTimeMinutes, null);
    assert.equal(reading.usingFallback, true);
  });

  test('a non-ok mag response (but ok plasma) leaves bz null without touching plasma', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      if (String(url).includes(MAG_URL_FRAGMENT)) return jsonResponse({}, false, 500);
      if (String(url).includes(WIND_URL_FRAGMENT)) return jsonResponse(windPayload(450, 1.5));
      return jsonResponse({}, false, 500);
    }) as typeof fetch;

    const reading = await fetchSolarWindWithQuality();

    assert.equal(reading.bz, null);
    assert.equal(reading.solarWindSpeed, 450);
    assert.equal(reading.usingFallback, false);
  });
});

describe('fetchOvationWithQuality', () => {
  test('a valid payload is parsed, usingFallback false', async () => {
    globalThis.fetch = (async () => jsonResponse(ovationOkPayload(33))) as typeof fetch;

    const reading = await fetchOvationWithQuality();

    assert.equal(reading.ovationProbability, 33);
    assert.equal(reading.ovationForecastTime, '2026-07-27T09:35:00Z');
    assert.equal(reading.usingFallback, false);
  });

  test('a non-ok response falls back to null/usingFallback true', async () => {
    globalThis.fetch = (async () => jsonResponse({}, false, 500)) as typeof fetch;

    const reading = await fetchOvationWithQuality();

    assert.equal(reading.ovationProbability, null);
    assert.equal(reading.ovationForecastTime, null);
    assert.equal(reading.usingFallback, true);
  });

  test('a thrown/rejected fetch falls back to null/usingFallback true', async () => {
    globalThis.fetch = (async () => {
      throw new Error('simulated network failure');
    }) as typeof fetch;

    const reading = await fetchOvationWithQuality();

    assert.equal(reading.ovationProbability, null);
    assert.equal(reading.usingFallback, true);
  });
});

// -----------------------------------------------------------------------------
// fetchNowcastSummary: full pipeline
// -----------------------------------------------------------------------------

describe('fetchNowcastSummary', () => {
  const fixedNow = () => new Date('2026-07-27T08:30:00Z').getTime();

  test('all sources OK -> full summary with sourcesAvailable and a derived level', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes(MAG_URL_FRAGMENT)) return jsonResponse(magPayload(-6));
      if (u.includes(WIND_URL_FRAGMENT)) return jsonResponse(windPayload(400, 2));
      if (u.includes(OVATION_URL_FRAGMENT)) return jsonResponse(ovationOkPayload(25));
      return jsonResponse({}, false, 500);
    }) as typeof fetch;

    const summary = await fetchNowcastSummary(globalThis.fetch, fixedNow);

    assert.ok(summary);
    assert.equal(summary?.updatedAt, new Date(fixedNow()).toISOString());
    assert.equal(summary?.bz, -6);
    assert.equal(summary?.solarWindSpeed, 400);
    assert.equal(summary?.solarWindDensity, 2);
    assert.equal(summary?.ovationProbability, 25);
    assert.equal(summary?.ovationForecastTime, '2026-07-27T09:35:00Z');
    // bz <= -5 (bzActive) -> 'active' (not 'storming': ovation 25 < 50, and
    // storming needs both anyway).
    assert.equal(summary?.level, 'active');
    assert.deepEqual(summary?.sourcesAvailable.sort(), ['ovation', 'solar_wind']);
    // TGO is a deliberate always-null stub (see nowcast.ts) -- it can never
    // appear in sourcesAvailable today. This is the current, correct contract,
    // not a gap in this test: there is no way to make fetchTgoDisturbanceWithQuality
    // return non-null without a source change.
    assert.ok(!summary?.sourcesAvailable.includes('tgo_magnetometer'));
    assert.equal(summary?.tgoDisturbanceNt, null);
  });

  test('mag fails but wind succeeds -> partial reading, "solar_wind" still credited in sourcesAvailable', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes(MAG_URL_FRAGMENT)) throw new Error('simulated mag outage');
      if (u.includes(WIND_URL_FRAGMENT)) return jsonResponse(windPayload(500, 3));
      if (u.includes(OVATION_URL_FRAGMENT)) throw new Error('simulated ovation outage');
      return jsonResponse({}, false, 500);
    }) as typeof fetch;

    const summary = await fetchNowcastSummary(globalThis.fetch, fixedNow);

    assert.ok(summary);
    assert.equal(summary?.bz, null);
    assert.equal(summary?.solarWindSpeed, 500);
    assert.deepEqual(summary?.sourcesAvailable, ['solar_wind']);
    // bz null, ovation null -> quiet (graceful degradation, not a crash/throw).
    assert.equal(summary?.level, 'quiet');
  });

  test('ALL sources fail -> returns undefined (total nowcast failure)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('simulated total outage');
    }) as typeof fetch;

    const summary = await fetchNowcastSummary(globalThis.fetch, fixedNow);

    assert.equal(summary, undefined);
  });

  test('a hung upstream is aborted at SOURCE_TIMEOUT_MS and does not hang the summary past a couple of seconds', async () => {
    process.env.SOURCE_TIMEOUT_MS = '50';
    const started = Date.now();

    const summary = await fetchNowcastSummary(makeHangingFetch(), fixedNow);

    assert.ok(Date.now() - started < 2000, 'expected fetchNowcastSummary to resolve promptly, not hang');
    assert.equal(summary, undefined);
  });
});

// -----------------------------------------------------------------------------
// Snapshot integration (buildTonightSnapshot): the additive/optional-field
// contract on TonightSnapshot.nowcast, and dataQuality.usingFallbackNowcast.
// -----------------------------------------------------------------------------

describe('buildTonightSnapshot: nowcast integration', () => {
  test('every upstream (including nowcast) failing still builds a full snapshot, with nowcast undefined ' +
    'and dataQuality.usingFallbackNowcast true', async () => {
    globalThis.fetch = (async () => {
      throw new Error('simulated total outage');
    }) as typeof fetch;

    const snapshot = await buildTonightSnapshot();

    assert.equal(snapshot.nowcast, undefined);
    assert.equal(snapshot.dataQuality.usingFallbackNowcast, true);
    // The rest of the snapshot is unaffected by the nowcast outage.
    assert.equal(snapshot.rankings.length, 28);
    assert.equal(snapshot.dataQuality.usingFallbackKp, true);
  });

  test('nowcast sources succeeding while every other source fails still yields a real nowcast summary ' +
    '-- nowcast is independent of the weather/KP planning pipeline', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes(MAG_URL_FRAGMENT)) return jsonResponse(magPayload(-12));
      if (u.includes(WIND_URL_FRAGMENT)) return jsonResponse(windPayload(600, 4));
      if (u.includes(OVATION_URL_FRAGMENT)) return jsonResponse(ovationOkPayload(60));
      // Every other source (MET weather, NOAA Kp, MET sunrise) fails.
      throw new Error('simulated non-nowcast outage');
    }) as typeof fetch;

    const snapshot = await buildTonightSnapshot();

    assert.ok(snapshot.nowcast);
    assert.equal(snapshot.nowcast?.bz, -12);
    assert.equal(snapshot.nowcast?.ovationProbability, 60);
    assert.equal(snapshot.nowcast?.level, 'storming');
    assert.equal(snapshot.dataQuality.usingFallbackNowcast, false);
    // Everything else still correctly reports fallback usage, unaffected by
    // the nowcast pipeline's success.
    assert.equal(snapshot.dataQuality.usingFallbackKp, true);
    assert.equal(snapshot.dataQuality.usingFallbackSighting, true);
    assert.ok(snapshot.dataQuality.fallbackWeatherSpotIds.length > 0);
    // The rest of the snapshot still builds normally.
    assert.equal(snapshot.rankings.length, 28);
  });
});
