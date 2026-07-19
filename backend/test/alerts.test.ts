// Tests for backend/src/alerts.ts (trigger engine) and backend/src/fcm.ts
// (FCM HTTP v1 topic publisher). Follows the chdir-before-dynamic-import
// pattern from test/store.test.ts / test/usageStore.test.ts, since
// alerts.ts's ALERT_STATE_PATH is resolved from process.cwd() at
// module-load time -- this keeps every test writing to a scratch temp dir,
// never backend/data/.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';

import { getOsloOffset } from '../src/sources.js';
import type { FetchLike } from '../src/sources.js';
import {
  buildServiceAccountJwt,
  loadFcmConfig,
  publishToTopic,
  resetFcmStateForTests
} from '../src/fcm.js';
import type { FcmServiceAccount } from '../src/fcm.js';
import type { AlertRuntimeState } from '../src/alerts.js';
import type { DarknessSeasonState, KpTrend, SpotScoreResult, TonightSnapshot } from '../src/types.js';

type AlertsModule = typeof import('../src/alerts.js');

let alertsModule: AlertsModule;
let tempDir: string;
let originalCwd: string;
let statePath: string;

before(async () => {
  originalCwd = process.cwd();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-alerts-test-'));
  process.chdir(tempDir);
  // Dynamic import (not static) so alerts.ts's top-level
  // `path.resolve(process.cwd(), 'data/alerts-state.json')` binds to the
  // temp dir, not the real backend/data/.
  alertsModule = await import('../src/alerts.js');
  statePath = path.join(tempDir, 'data', 'alerts-state.json');
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true });
});

// --- Fixture builders ---

function localOsloHourToUtcMs(dayKey: string, hour: number): number {
  // Mirrors the private helper of the same shape in season.ts: guess the
  // wall-clock hour as UTC, look up Oslo's real offset at that instant, then
  // correct for it. Accurate outside the DST-transition hour itself, which
  // no test here touches.
  const [year, month, day] = dayKey.split('-').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const offset = getOsloOffset(guess);
  const sign = offset[0] === '-' ? -1 : 1;
  const [offsetHours, offsetMinutes] = offset.slice(1).split(':').map(Number);
  const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;
  return guess.getTime() - offsetMs;
}

const OPEN_DARKNESS: DarknessSeasonState = { seasonClosed: false, seasonReturns: null };
const CLOSED_DARKNESS: DarknessSeasonState = { seasonClosed: true, seasonReturns: '2026-08-01' };

function makeKp(): KpTrend {
  return { current: 3, peakNext12h: 4, tonightPeak: 4, hourly: [3, 3, 4] };
}

function makeRanking(score: number, overrides: Partial<SpotScoreResult> = {}): SpotScoreResult {
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
    dressAdvice: 'Cold: layered top, insulated jacket, gloves, and warm footwear.',
    ...overrides
  };
}

function makeSnapshot(score: number, overrides: Partial<TonightSnapshot> = {}): TonightSnapshot {
  const ranking = makeRanking(score, overrides.rankings?.[0]);
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

// --- evaluateAlertTriggers: pure core ---

describe('evaluateAlertTriggers -- threshold crossing + hysteresis', () => {
  test('crossing upward through a tier threshold fires it once', () => {
    const nightKey = alertsModule.getNightKey(localOsloHourToUtcMs('2026-01-10', 20));
    let state = alertsModule.createInitialAlertState(nightKey);

    const nowFn = () => localOsloHourToUtcMs('2026-01-10', 20);

    const belowTick = alertsModule.evaluateAlertTriggers(makeSnapshot(30), state, nowFn);
    assert.deepEqual(belowTick.toFire, []);
    state = belowTick.state;

    const crossingTick = alertsModule.evaluateAlertTriggers(makeSnapshot(71), state, nowFn);
    assert.equal(crossingTick.toFire.length, 1);
    assert.equal(crossingTick.toFire[0].tierId, 'ge70');
    assert.equal(crossingTick.toFire[0].topic, 'alerts-ge70');
    assert.equal(crossingTick.toFire[0].data.score, '71');
    assert.equal(crossingTick.state.firedTiers.ge70, true);
    assert.equal(crossingTick.state.totalFired, 1);
  });

  test('oscillation around the ge70 threshold fires exactly once, not on every up-crossing', () => {
    // NOTE on the numbers: the doc's illustrative "68 -> 71 -> 69 -> 72"
    // sequence oscillates around the >=70 tier alone, but 68/69 are also
    // >= the >=45 "decent" tier's threshold -- with a real second tier
    // active (as this engine has), a score of 68 on the very first-ever
    // tick would itself be a legitimate first crossing of THAT tier (see
    // the "hard cap" test above for that interaction, tested separately).
    // To isolate ge70's own hysteresis without that cross-tier interference,
    // this sequence starts below both tiers (30), jumps straight to a ge70
    // crossing (75, which fires ge70 first by tier priority -- see
    // ALERT_TIERS' descending order -- so ge45 is never reached that tick),
    // then oscillates below 70 but above the already-fired ge70's own
    // hysteresis band (65) and back above it again (80): the doc's core
    // claim under test is that this dip-and-recross never fires a second
    // time, which is exactly what's asserted below.
    //
    // NOTE: as written, this test would still pass even if `armed` were
    // never actually set back to `false` on fire (a bug flagged in review --
    // `firedTiers.ge70` alone already blocks the 65/80 ticks). It's kept
    // here as the doc's own illustrative scenario, but the REAL proof that
    // hysteresis itself (not just the fired-flag/cap) blocks a refire is the
    // next test below, which deliberately leaves firedTiers/totalFired
    // non-blocking and shows `armed` is what's actually doing the work.
    const nowFn = () => localOsloHourToUtcMs('2026-01-10', 20);
    let state = alertsModule.createInitialAlertState(alertsModule.getNightKey(nowFn()));

    const scores = [30, 75, 65, 80];
    let totalFires = 0;

    for (const score of scores) {
      const result = alertsModule.evaluateAlertTriggers(makeSnapshot(score), state, nowFn);
      totalFires += result.toFire.length;
      state = result.state;
    }

    assert.equal(totalFires, 1, 'only the first (30->75) crossing should fire');
    assert.equal(state.firedTiers.ge70, true);
    assert.equal(state.armed.ge70, false, 'firing must also disarm the tier (the actual hysteresis mechanism)');
  });

  test('hysteresis ALONE (firedTiers/totalFired deliberately left non-blocking) blocks a refire until the score dips below the re-arm gap', () => {
    // Directly constructs a runtime state where the ONLY thing that could
    // block a fire is the `armed` bit: firedTiers is empty (so the
    // "already fired this tier tonight" gate isn't the blocker) and
    // totalFired is 0, well under the 1/night cap (so the cap isn't the
    // blocker either). This isolates exactly the bug flagged in review: if
    // `nextArmed[tier.id]` were only ever set `true` (never `false`), this
    // test would incorrectly fire on the first (score=90) tick, since
    // nothing else in this state would stop it. It also stands in for
    // "temporarily disable the total cap" -- rather than hack a negative
    // totalFired (which would still leave the separate `alreadyFired` gate
    // blocking, telling us nothing about `armed`), this constructs the one
    // state that isolates `armed` as the sole variable under test.
    //
    // ge45 is ALSO disarmed here (not just ge70): ge70/ge45 share the same
    // `totalFired` cap, so if ge45 were left armed it would itself fire on
    // the very first (score=90) tick -- score=90 clears its threshold too,
    // and tier order is descending (ge70 first, then ge45) but ge70 is
    // blocked by its own `armed=false`, leaving ge45 free to fire and spend
    // the shared cap, which would then (incorrectly, for THIS test's
    // purpose) block ge70's later refire via the cap rather than via
    // hysteresis. Keeping ge45 disarmed throughout removes that
    // interference so only ge70's own armed bit is under test.
    const nowFn = () => localOsloHourToUtcMs('2026-01-10', 20);
    const nightKey = alertsModule.getNightKey(nowFn());
    const disarmedState: AlertRuntimeState = {
      nightKey,
      firedTiers: {},
      totalFired: 0,
      armed: { ge70: false, ge45: false }
    };

    const stillDisarmed = alertsModule.evaluateAlertTriggers(makeSnapshot(90), disarmedState, nowFn);
    assert.deepEqual(
      stillDisarmed.toFire.filter((event) => event.tierId === 'ge70'),
      [],
      'armed=false must block ge70 even though score=90, cap is available, and it never fired yet'
    );

    // A dip below threshold - HYSTERESIS_GAP (70 - 10 = 60) re-arms it...
    const dipped = alertsModule.evaluateAlertTriggers(makeSnapshot(50), stillDisarmed.state, nowFn);
    assert.equal(dipped.state.armed.ge70, true, 'dipping below 60 must re-arm ge70');

    // ...and only THEN does crossing back above the threshold fire.
    const refired = alertsModule.evaluateAlertTriggers(makeSnapshot(90), dipped.state, nowFn);
    assert.equal(
      refired.toFire.filter((event) => event.tierId === 'ge70').length,
      1,
      'once re-armed, a fresh crossing above 70 must fire'
    );
  });

  test('hard cap: 1 push per night TOTAL -- a second tier crossing later the same night does not also fire', () => {
    const nowFn = () => localOsloHourToUtcMs('2026-01-10', 20);
    let state = alertsModule.createInitialAlertState(alertsModule.getNightKey(nowFn()));

    // First tick: a big jump crosses BOTH tiers at once. Only the higher
    // (more specific) tier should fire and spend the cap.
    const first = alertsModule.evaluateAlertTriggers(makeSnapshot(75), state, nowFn);
    assert.equal(first.toFire.length, 1);
    assert.equal(first.toFire[0].tierId, 'ge70');
    assert.equal(first.state.firedTiers.ge45, undefined, 'ge45 must not also fire in the same tick');
    state = first.state;

    // Later the same night: score settles to 50 (still >= the ge45
    // threshold, never fired yet, and never disarmed) -- must still not
    // fire, because the per-night cap is already spent.
    const later = alertsModule.evaluateAlertTriggers(makeSnapshot(50), state, nowFn);
    assert.deepEqual(later.toFire, []);
    assert.equal(later.state.firedTiers.ge45, undefined);
    assert.equal(later.state.totalFired, 1);
  });
});

describe('evaluateAlertTriggers -- quiet hours (01:00-16:00 Oslo local)', () => {
  test('a crossing during quiet hours is suppressed, but fires once quiet hours end (still above threshold at 16:00)', () => {
    // Both timestamps below fall on the SAME "tonight" bucket (hour >= 6, so
    // nightKey = that calendar day -- today's upcoming 18:00 window), so
    // state carries across them correctly.
    const morningNow = () => localOsloHourToUtcMs('2026-01-10', 10); // quiet: 1 <= 10 < 16
    let state = alertsModule.createInitialAlertState(alertsModule.getNightKey(morningNow()));

    const quietTick = alertsModule.evaluateAlertTriggers(makeSnapshot(75), state, morningNow);
    assert.deepEqual(quietTick.toFire, [], 'must not publish during quiet hours');
    assert.equal(quietTick.state.firedTiers.ge70, undefined, 'must not be marked fired either');
    state = quietTick.state;

    const sixteenHundredNow = () => localOsloHourToUtcMs('2026-01-10', 16); // quiet hours just ended
    const afterQuietTick = alertsModule.evaluateAlertTriggers(makeSnapshot(75), state, sixteenHundredNow);
    assert.equal(afterQuietTick.toFire.length, 1, 'should fire at 16:00 since still above threshold');
    assert.equal(afterQuietTick.toFire[0].tierId, 'ge70');
  });

  test('a crossing well inside quiet hours (e.g. 02:00) never fires while still quiet, tick after tick', () => {
    const nowFn = () => localOsloHourToUtcMs('2026-01-10', 2);
    const state = alertsModule.createInitialAlertState(alertsModule.getNightKey(nowFn()));

    const result = alertsModule.evaluateAlertTriggers(makeSnapshot(90), state, nowFn);
    assert.deepEqual(result.toFire, []);
  });

  test('a quiet-hours crossing that drops back below threshold (and below the re-arm gap) before 16:00 does NOT fire at 16:00', () => {
    // Score crosses >=45 during quiet hours (suppressed), then genuinely
    // drops back below the threshold -- and below its re-arm gap (45 - 10 =
    // 35) -- before quiet hours end. By 16:00 there's simply nothing to
    // fire: the score isn't crossing anymore, so the "remembered as armed"
    // quiet-hours behavior (tested above for the still-elevated case) must
    // not manufacture a fire out of a score that's no longer above
    // threshold.
    const morningNow = () => localOsloHourToUtcMs('2026-01-10', 10); // quiet
    let state = alertsModule.createInitialAlertState(alertsModule.getNightKey(morningNow()));

    const crossTick = alertsModule.evaluateAlertTriggers(makeSnapshot(50), state, morningNow);
    assert.deepEqual(crossTick.toFire, [], 'crossing during quiet hours must not publish');
    state = crossTick.state;

    const dipNow = () => localOsloHourToUtcMs('2026-01-10', 13); // still quiet
    const dipTick = alertsModule.evaluateAlertTriggers(makeSnapshot(20), state, dipNow);
    assert.deepEqual(dipTick.toFire, []);
    state = dipTick.state;

    const sixteenHundredNow = () => localOsloHourToUtcMs('2026-01-10', 16); // quiet hours end
    const finalTick = alertsModule.evaluateAlertTriggers(makeSnapshot(20), state, sixteenHundredNow);
    assert.deepEqual(finalTick.toFire, [], 'must not fire at 16:00 -- the score is no longer above threshold');
    assert.equal(finalTick.state.firedTiers.ge45, undefined);
  });
});

describe('evaluateAlertTriggers -- staleness guards', () => {
  test('usingFallbackKp suppresses the check entirely', () => {
    const nowFn = () => localOsloHourToUtcMs('2026-01-10', 20);
    const state = alertsModule.createInitialAlertState(alertsModule.getNightKey(nowFn()));

    const snapshot = makeSnapshot(90, { dataQuality: { usingFallbackKp: true, fallbackWeatherSpotIds: [] } });
    const result = alertsModule.evaluateAlertTriggers(snapshot, state, nowFn);

    assert.deepEqual(result.toFire, []);
    assert.equal(result.skipped, 'fallbackData');
  });

  test('fallback weather for the best (top-ranked) spot suppresses the check', () => {
    const nowFn = () => localOsloHourToUtcMs('2026-01-10', 20);
    const state = alertsModule.createInitialAlertState(alertsModule.getNightKey(nowFn()));

    const snapshot = makeSnapshot(90, {
      dataQuality: { usingFallbackKp: false, fallbackWeatherSpotIds: ['ersfjordbotn'] }
    });
    const result = alertsModule.evaluateAlertTriggers(snapshot, state, nowFn);

    assert.deepEqual(result.toFire, []);
    assert.equal(result.skipped, 'fallbackData');
  });

  test('fallback weather for a DIFFERENT (non-best) spot does not suppress the check', () => {
    const nowFn = () => localOsloHourToUtcMs('2026-01-10', 20);
    const state = alertsModule.createInitialAlertState(alertsModule.getNightKey(nowFn()));

    const snapshot = makeSnapshot(90, {
      dataQuality: { usingFallbackKp: false, fallbackWeatherSpotIds: ['some-other-spot'] }
    });
    const result = alertsModule.evaluateAlertTriggers(snapshot, state, nowFn);

    assert.equal(result.skipped, null);
    assert.equal(result.toFire.length, 1);
  });

  test('darkness.seasonClosed suppresses the check', () => {
    const nowFn = () => localOsloHourToUtcMs('2026-01-10', 20);
    const state = alertsModule.createInitialAlertState(alertsModule.getNightKey(nowFn()));

    const snapshot = makeSnapshot(90, { darkness: CLOSED_DARKNESS });
    const result = alertsModule.evaluateAlertTriggers(snapshot, state, nowFn);

    assert.deepEqual(result.toFire, []);
    assert.equal(result.skipped, 'seasonClosed');
  });
});

describe('evaluateAlertTriggers -- night rollover', () => {
  test('a new Oslo-night resets firedTiers/totalFired, allowing a fresh fire', () => {
    const priorNight = alertsModule.createInitialAlertState('2026-01-09');
    const firedState = {
      ...priorNight,
      firedTiers: { ge70: true },
      totalFired: 1
    };

    const nextNightNow = () => localOsloHourToUtcMs('2026-01-10', 20); // a new evening
    const result = alertsModule.evaluateAlertTriggers(makeSnapshot(80), firedState, nextNightNow);

    assert.notEqual(result.state.nightKey, '2026-01-09');
    assert.equal(result.toFire.length, 1, 'a new night must be able to fire again even if last night already fired');
    assert.equal(result.toFire[0].tierId, 'ge70');
  });
});

describe('getNightKey', () => {
  test('an evening hour and the following early-morning hour (< 6) share the same night key', () => {
    const evening = alertsModule.getNightKey(localOsloHourToUtcMs('2026-01-10', 22));
    const earlyMorning = alertsModule.getNightKey(localOsloHourToUtcMs('2026-01-11', 3));
    assert.equal(evening, '2026-01-10');
    assert.equal(earlyMorning, '2026-01-10');
  });

  test('a daytime hour (>= 6) belongs to that calendar day, not the prior night', () => {
    assert.equal(alertsModule.getNightKey(localOsloHourToUtcMs('2026-01-11', 10)), '2026-01-11');
  });
});

// --- Disk-mirrored state (backend/data/alerts-state.json) ---

describe('alert state persistence', () => {
  test('checkAlertTriggers persists {nightKey, firedTiers, totalFired} only -- no "armed" field, no user data', async () => {
    const now = localOsloHourToUtcMs('2026-01-10', 20);
    alertsModule.setAlertStateForTests(alertsModule.createInitialAlertState(alertsModule.getNightKey(now)));

    const published: { topic: string; data: Record<string, string> }[] = [];
    const evaluation = await alertsModule.checkAlertTriggers(makeSnapshot(80), {
      now: () => now,
      publish: async (topic, data) => {
        published.push({ topic, data });
        return { ok: true };
      }
    });

    assert.equal(evaluation.toFire.length, 1);
    assert.equal(published.length, 1);
    assert.equal(published[0].topic, 'alerts-ge70');

    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.deepEqual(Object.keys(parsed).sort(), ['firedTiers', 'nightKey', 'totalFired']);
    assert.equal(parsed.totalFired, 1);
    assert.equal(parsed.firedTiers.ge70, true);
  });

  test('state survives a reload from the on-disk mirror', async () => {
    // Reuses the file written by the previous test.
    alertsModule.setAlertStateForTests(alertsModule.createInitialAlertState('bogus-reset-before-reload'));

    await alertsModule.loadAlertStateFromDisk();
    const reloaded = alertsModule.getAlertState();

    assert.equal(reloaded.totalFired, 1);
    assert.equal(reloaded.firedTiers.ge70, true);
  });

  test('a corrupt mirror file loads a clean state instead of throwing', async () => {
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, '{ not valid json ]', 'utf8');

    const now = localOsloHourToUtcMs('2026-01-12', 20);
    await assert.doesNotReject(alertsModule.loadAlertStateFromDisk(() => now));

    const state = alertsModule.getAlertState();
    assert.equal(state.nightKey, alertsModule.getNightKey(now));
    assert.deepEqual(state.firedTiers, {});
    assert.equal(state.totalFired, 0);
  });

  test('a missing mirror file loads a clean state instead of throwing', async () => {
    await fs.rm(statePath, { force: true });

    const now = localOsloHourToUtcMs('2026-01-13', 20);
    await assert.doesNotReject(alertsModule.loadAlertStateFromDisk(() => now));

    const state = alertsModule.getAlertState();
    assert.equal(state.nightKey, alertsModule.getNightKey(now));
    assert.equal(state.totalFired, 0);
  });

  test('a publish failure does not prevent the fired state from being persisted (no duplicate-fire retry)', async () => {
    const now = localOsloHourToUtcMs('2026-01-14', 20);
    alertsModule.setAlertStateForTests(alertsModule.createInitialAlertState(alertsModule.getNightKey(now)));

    await assert.doesNotReject(
      alertsModule.checkAlertTriggers(makeSnapshot(80), {
        now: () => now,
        publish: async () => {
          throw new Error('simulated FCM outage');
        }
      })
    );

    const raw = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.firedTiers.ge70, true, 'fired flag must be persisted even if the publish call itself failed');
  });
});

// --- fcm.ts: publisher ---

describe('fcm.ts -- config / inert-when-unconfigured', () => {
  test('loadFcmConfig returns null when either env var is missing', () => {
    assert.equal(loadFcmConfig({}), null);
    assert.equal(loadFcmConfig({ FCM_PROJECT_ID: 'proj' }), null);
    assert.equal(loadFcmConfig({ FCM_SERVICE_ACCOUNT: '{}' }), null);
  });

  test('loadFcmConfig returns null for malformed JSON or a service account missing required fields', () => {
    assert.equal(loadFcmConfig({ FCM_PROJECT_ID: 'proj', FCM_SERVICE_ACCOUNT: 'not json' }), null);
    assert.equal(
      loadFcmConfig({ FCM_PROJECT_ID: 'proj', FCM_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'a@b.com' }) }),
      null
    );
  });

  test('publishToTopic is inert (no network call) and logs exactly one info line when unconfigured', async () => {
    resetFcmStateForTests();
    const infoLines: string[] = [];
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      throw new Error('must never be called while unconfigured');
    }) as unknown as FetchLike;

    const outcome1 = await publishToTopic(
      'alerts-ge70',
      { score: '80' },
      { env: {}, fetchImpl, logger: { info: (m) => infoLines.push(m) } }
    );
    const outcome2 = await publishToTopic(
      'alerts-ge45',
      { score: '50' },
      { env: {}, fetchImpl, logger: { info: (m) => infoLines.push(m) } }
    );

    assert.deepEqual(outcome1, { ok: false, skipped: 'unconfigured' });
    assert.deepEqual(outcome2, { ok: false, skipped: 'unconfigured' });
    assert.equal(fetchCalls, 0);
    assert.deepEqual(infoLines, ['alerts engine active, publisher unconfigured']);
  });
});

describe('fcm.ts -- publish payload shape + privacy invariant', () => {
  let serviceAccount: FcmServiceAccount;

  before(() => {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    serviceAccount = { client_email: 'alerts@test-project.iam.gserviceaccount.com', private_key: privateKey };
  });

  function makeEnv(): NodeJS.ProcessEnv {
    return {
      FCM_PROJECT_ID: 'aurora-tromso-test',
      FCM_SERVICE_ACCOUNT: JSON.stringify(serviceAccount)
    };
  }

  test('publishes a topic-only, data-only message with the correct topic name and shape', async () => {
    resetFcmStateForTests();

    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      if (url === 'https://oauth2.googleapis.com/token') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'fake-oauth-access-token', expires_in: 3600 })
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as FetchLike;

    const outcome = await publishToTopic(
      'alerts-ge70',
      { threshold: '70', score: '80', spotId: 'ersfjordbotn', bestWindowStart: '2026-01-10T20:00:00.000Z' },
      { env: makeEnv(), fetchImpl }
    );

    assert.equal(outcome.ok, true);
    assert.equal(calls.length, 2);

    const [tokenCall, publishCall] = calls;
    assert.equal(tokenCall.url, 'https://oauth2.googleapis.com/token');

    assert.equal(publishCall.url, 'https://fcm.googleapis.com/v1/projects/aurora-tromso-test/messages:send');
    assert.equal((publishCall.init.headers as Record<string, string>).Authorization, 'Bearer fake-oauth-access-token');

    const body = JSON.parse(publishCall.init.body as string);
    assert.deepEqual(Object.keys(body), ['message']);
    assert.deepEqual(Object.keys(body.message).sort(), ['data', 'topic']);
    assert.equal(body.message.topic, 'alerts-ge70');
    assert.deepEqual(body.message.data, {
      threshold: '70',
      score: '80',
      spotId: 'ersfjordbotn',
      bestWindowStart: '2026-01-10T20:00:00.000Z'
    });

    // PRIVACY INVARIANT (see fcm.ts header comment / CLAUDE.md guardrails):
    // Option B never sends a device/registration token. Assert the request
    // is addressed by `topic` only -- never `token` or `condition` -- and
    // that no plausible token/device-identifier field sneaks into the
    // message body anywhere.
    assert.equal('token' in body.message, false);
    assert.equal('condition' in body.message, false);
    assert.equal('registration_ids' in body.message, false);
    const serializedMessage = JSON.stringify(body.message);
    assert.doesNotMatch(serializedMessage, /device|registration|expo[-_]?push|token/i);
  });
});

describe('fcm.ts -- JWT assembly sanity (structure/fields, not signature validity)', () => {
  test('buildServiceAccountJwt produces a 3-part token with the expected header/claim fields', () => {
    const serviceAccount: FcmServiceAccount = {
      client_email: 'alerts@test-project.iam.gserviceaccount.com',
      private_key: generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      }).privateKey
    };

    const fixedNowSec = 1_800_000_000;
    const jwt = buildServiceAccountJwt(serviceAccount, () => fixedNowSec * 1000);

    const parts = jwt.split('.');
    assert.equal(parts.length, 3, 'expected header.claims.signature');

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    assert.deepEqual(header, { alg: 'RS256', typ: 'JWT' });
    assert.equal(claims.iss, serviceAccount.client_email);
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
    assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
    assert.equal(claims.iat, fixedNowSec);
    assert.equal(claims.exp, fixedNowSec + 3600);

    // Signature segment is non-empty base64url; not decoded/verified here --
    // an end-to-end HTTP-mocked test (above) exercises the token exchange,
    // and real signature validity is Google's job to verify at request time.
    assert.ok(parts[2].length > 0);
  });
});
