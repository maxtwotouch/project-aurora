import { promises as fs } from 'node:fs';
import path from 'node:path';

import { addDaysToDayKey, getOsloParts } from './sources.js';
import type { Clock } from './sources.js';
import { publishToTopic } from './fcm.js';
import type { PublishOutcome } from './fcm.js';
import type { TonightSnapshot } from './types.js';

/**
 * "Tonight looks good" aurora push alerts -- trigger engine.
 *
 * Grounded in docs/design-aurora-alerts.md, which recommends **Option B**
 * (topic-based FCM): devices subscribe client-side to a topic that encodes
 * only the chosen score tier (`alerts-ge45` / `alerts-ge70`); this backend
 * publishes a small data-only message to that topic on a crossing. It never
 * requests, sees, or stores an individual device token or any other
 * device/user identifier -- see fcm.ts's PRIVACY INVARIANT comment.
 *
 * IMPORTANT (repo process note, not a code comment the doc asked for): the
 * design doc is titled "Status: draft, awaiting owner sign-off" and lists
 * provider choice, threshold defaults, and CODEOWNERS additions under
 * "Decisions for the owner" (section 5) -- none marked confirmed in the doc
 * itself. Per the doc's own rough implementation plan (section 6), the
 * provider-wiring step (this file's fcm.ts counterpart) is explicitly
 * "OWNER REVIEW REQUIRED" / "the hard human-review gate," independent of
 * which provider is chosen. This PR implements that wiring per the task
 * brief, but the publisher stays inert until the owner sets FCM_PROJECT_ID /
 * FCM_SERVICE_ACCOUNT (see fcm.ts), and nothing here has been committed or
 * pushed -- see the final report for a fuller flag of this discrepancy.
 *
 * Threshold tiers (docs/design-aurora-alerts.md section 1, aligned with
 * `chanceFromScore` in snapshot.ts): >=70 "Only great nights", >=45 "Any
 * decent chance". Order matters below: descending, so a single tick that
 * crosses both tiers at once fires only the higher (more specific) one and
 * spends the per-night cap there instead of on the lower tier.
 */
export type AlertTierId = 'ge70' | 'ge45';

export type AlertTier = {
  id: AlertTierId;
  threshold: number;
  /** FCM topic name. Exactly two topics total (not per-language) --
   * docs/design-aurora-alerts.md section 2: "Publish a small data-only
   * message ... and let the client render localized text from the existing
   * i18n catalogs at receive time. Keeps it to 2 topics total, not 2x5." */
  topic: string;
};

export const ALERT_TIERS: readonly AlertTier[] = [
  { id: 'ge70', threshold: 70, topic: 'alerts-ge70' },
  { id: 'ge45', threshold: 45, topic: 'alerts-ge45' }
];

// "stops a score oscillating 68->71->69->72 from firing repeatedly as clouds
// fluctuate tick to tick" -- docs/design-aurora-alerts.md section 3.
const HYSTERESIS_GAP = 10;

// "Quiet hours: 01:00-16:00 Tromso local, no pushes, by default." -- doc
// section 1/3. Quiet = hour in [QUIET_HOURS_START, QUIET_HOURS_END); a
// crossing right at 16:00 is allowed to fire (matches "if still above
// threshold at 16:00, it fires then instead of being lost for the night").
const QUIET_HOURS_START = 1;
const QUIET_HOURS_END = 16;

/** The only fields mirrored to disk (backend/data/alerts-state.json), per
 * the task brief's tiny-file schema. `armed` (below) is deliberately NOT
 * persisted -- see the comment on AlertRuntimeState. */
export type PersistedAlertState = {
  nightKey: string;
  firedTiers: Record<string, boolean>;
  totalFired: number;
};

/**
 * Runtime state used for evaluation. `armed[tierId]` tracks "has this tier's
 * score been seen below `threshold - HYSTERESIS_GAP` since its last fire" --
 * required for a tier to be eligible to fire again. It is intentionally
 * in-memory only (reset to `true` for every tier on load/boot), NOT part of
 * the persisted file: for a tier that has never fired, "armed" defaults to
 * true, which is exactly the correct "no restriction yet" initial state
 * (equivalent to "never violated the low bound"); for a tier that HAS
 * fired, `firedTiers[tierId]` alone already blocks any further fire for the
 * night regardless of `armed`, so losing `armed` across a restart can never
 * cause an incorrect re-fire.
 */
export type AlertRuntimeState = PersistedAlertState & {
  armed: Record<string, boolean>;
};

export function createInitialAlertState(nightKey: string): AlertRuntimeState {
  return {
    nightKey,
    firedTiers: {},
    totalFired: 0,
    armed: Object.fromEntries(ALERT_TIERS.map((tier) => [tier.id, true]))
  };
}

/**
 * "Night" key = the Oslo-local night the given instant falls in, using the
 * same early-morning rollback convention as season.ts / sources.ts's
 * parseTonightPeak: before 06:00 local, "tonight" is still the night that
 * started yesterday evening. Reuses getOsloParts/addDaysToDayKey from
 * sources.ts rather than reimplementing timezone math (doc section 3).
 */
export function getNightKey(nowMs: number): string {
  const parts = getOsloParts(new Date(nowMs));
  if (!parts) return new Date(nowMs).toISOString().slice(0, 10);
  return parts.hour < 6 ? addDaysToDayKey(parts.dayKey, -1) : parts.dayKey;
}

function isQuietHours(hour: number): boolean {
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
}

export type AlertFireEvent = {
  tierId: AlertTierId;
  topic: string;
  threshold: number;
  /** Data-only payload -- docs/design-aurora-alerts.md section 2's exact
   * field list (threshold, score, spotId, bestWindowStart), plus
   * bestWindowEnd/spotName for a slightly richer client render. Every value
   * is a string (FCM's `data` payload requires string values). No device
   * identifier of any kind is ever included here -- see fcm.ts. */
  data: {
    threshold: string;
    score: string;
    spotId: string;
    spotName: string;
    bestWindowStart: string;
    bestWindowEnd: string;
  };
};

export type AlertSkipReason = 'noSnapshot' | 'seasonClosed' | 'fallbackData' | null;

export type AlertEvaluation = {
  state: AlertRuntimeState;
  toFire: AlertFireEvent[];
  skipped: AlertSkipReason;
};

/**
 * Pure evaluation core (testable like scoring.ts -- only the disk-mirror
 * write and the actual FCM publish, both in checkAlertTriggers below, are
 * impure). Never mutates `priorState`; always returns a new state object.
 */
export function evaluateAlertTriggers(
  snapshot: TonightSnapshot,
  priorState: AlertRuntimeState,
  now: Clock = Date.now
): AlertEvaluation {
  const nowMs = now();
  const nightKey = getNightKey(nowMs);

  // Night rollover: a new Oslo-night resets fired/armed/cap state, per
  // section 3 ("once fired tonight, that tier can't fire again until the
  // next aurora night").
  const state: AlertRuntimeState = priorState.nightKey === nightKey ? priorState : createInitialAlertState(nightKey);

  const bestSpot = snapshot.rankings[0];
  if (!bestSpot) {
    return { state, toFire: [], skipped: 'noSnapshot' };
  }

  // Staleness guard #1: season closed (midnight sun) -- doc section 3 names
  // this explicitly alongside the fallback-data guard.
  if (snapshot.darkness.seasonClosed) {
    return { state, toFire: [], skipped: 'seasonClosed' };
  }

  // Staleness guard #2 (doc section 3): "Never fire from fallback data:
  // check dataQuality.usingFallbackKp and whether the best spot's id is in
  // dataQuality.fallbackWeatherSpotIds; if either is true, skip the check
  // for this tick."
  const usingFallback =
    snapshot.dataQuality.usingFallbackKp || snapshot.dataQuality.fallbackWeatherSpotIds.includes(bestSpot.spotId);
  if (usingFallback) {
    return { state, toFire: [], skipped: 'fallbackData' };
  }

  const score = bestSpot.score;
  const osloParts = getOsloParts(new Date(nowMs));
  const quiet = osloParts ? isQuietHours(osloParts.hour) : false;

  const nextArmed = { ...state.armed };
  const nextFired = { ...state.firedTiers };
  let totalFired = state.totalFired;
  const toFire: AlertFireEvent[] = [];

  for (const tier of ALERT_TIERS) {
    if (score < tier.threshold - HYSTERESIS_GAP) {
      nextArmed[tier.id] = true;
    }

    const alreadyFired = nextFired[tier.id] === true;
    const armed = nextArmed[tier.id] ?? true;
    // Hard cap: 1 push per night TOTAL (doc sections 1 and 3), not 1 per
    // tier -- checked against the running `totalFired` so a tier that would
    // also cross later in the same night, or the same tick, can't fire once
    // the cap is already spent.
    const wouldCross = !alreadyFired && totalFired < 1 && armed && score >= tier.threshold;

    // Quiet hours: a crossing is not published, but state is left exactly as
    // computed above (still armed, not yet fired) -- "remembered as armed"
    // (doc section 3), so if the score is still >= threshold once quiet
    // hours end, the very next non-quiet tick fires it then.
    if (wouldCross && !quiet) {
      nextFired[tier.id] = true;
      // Disarm on an actual fire (NOT on a quiet-hours-suppressed crossing --
      // see the comment above: that case must stay armed so it can still
      // fire once quiet hours end). Without this, `nextArmed[tier.id]` was
      // only ever set to `true` above and never back to `false`, so the
      // 10-point re-arm gap had zero real effect: `firedTiers`/`totalFired`
      // were silently doing all the anti-oscillation work on their own. That
      // becomes a latent gap if the 1/night cap is ever relaxed per the
      // doc's section 4 roadmap ("A climbing opt-out rate post-launch is the
      // signal to revisit thresholds/cap") -- with this fix, hysteresis is a
      // real, independent gate: see the "hysteresis alone" test in
      // test/alerts.test.ts, which proves this with firedTiers/totalFired
      // deliberately left non-blocking.
      nextArmed[tier.id] = false;
      totalFired += 1;
      toFire.push({
        tierId: tier.id,
        topic: tier.topic,
        threshold: tier.threshold,
        data: {
          threshold: String(tier.threshold),
          score: String(score),
          spotId: bestSpot.spotId,
          spotName: bestSpot.spotName,
          bestWindowStart: bestSpot.bestWindowStart,
          bestWindowEnd: bestSpot.bestWindowEnd
        }
      });
    }
  }

  return {
    state: { nightKey, firedTiers: nextFired, totalFired, armed: nextArmed },
    toFire,
    skipped: null
  };
}

// --- Disk-mirrored state (usageStore.ts atomic-write pattern) ---
//
// PRIVACY NOTE: this file holds NO user data whatsoever -- just a night key
// and per-tier fired flags (see PersistedAlertState above). It lives under
// backend/data/ alongside latest-snapshot.json (tracked) and
// usage-stats.json (gitignored); alerts-state.json is gitignored the same
// way as usage-stats.json (a locally-regenerated cache), see .gitignore.

const ALERT_STATE_PATH = path.resolve(process.cwd(), 'data/alerts-state.json');

let currentState: AlertRuntimeState = createInitialAlertState(getNightKey(Date.now()));

/** Loads the disk-mirrored alert state (if present and well-formed) into the
 * in-memory store. Corrupt/missing mirror -> clean state for "tonight", no
 * crash (mirrors store.ts's loadSnapshotFromDisk / usageStore.ts's load()). */
export async function loadAlertStateFromDisk(now: Clock = Date.now): Promise<void> {
  try {
    const raw = await fs.readFile(ALERT_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedAlertState>;

    if (
      typeof parsed?.nightKey !== 'string' ||
      typeof parsed?.totalFired !== 'number' ||
      !Number.isFinite(parsed.totalFired) ||
      typeof parsed?.firedTiers !== 'object' ||
      parsed.firedTiers === null
    ) {
      throw new Error('Malformed alerts-state.json');
    }

    currentState = {
      nightKey: parsed.nightKey,
      totalFired: parsed.totalFired,
      firedTiers: { ...parsed.firedTiers },
      armed: Object.fromEntries(ALERT_TIERS.map((tier) => [tier.id, true]))
    };
  } catch {
    currentState = createInitialAlertState(getNightKey(now()));
  }
}

async function persistAlertState(state: AlertRuntimeState): Promise<void> {
  const payload: PersistedAlertState = {
    nightKey: state.nightKey,
    firedTiers: state.firedTiers,
    totalFired: state.totalFired
  };

  const dir = path.dirname(ALERT_STATE_PATH);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${ALERT_STATE_PATH}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tmpPath, ALERT_STATE_PATH);
}

export function getAlertState(): AlertRuntimeState {
  return currentState;
}

/** Test-only hook: force the in-memory state without touching disk. */
export function setAlertStateForTests(state: AlertRuntimeState): void {
  currentState = state;
}

export type AlertPublisher = (topic: string, data: Record<string, string>) => Promise<PublishOutcome>;

const defaultPublisher: AlertPublisher = (topic, data) => publishToTopic(topic, data);

/**
 * The impure edge: evaluates triggers against the current in-memory state,
 * persists the (possibly updated) state to disk, then publishes any firing
 * tiers. Called from server.ts's refreshSnapshot() after a successful
 * setLatestSnapshot() -- see docs/design-aurora-alerts.md section 3.
 *
 * A publish failure for one tier does not roll back or block persisting
 * state / publishing other tiers -- the fired flag is set (and persisted)
 * as soon as a tier is decided to fire, before the publish call, so a
 * flaky FCM call never causes a duplicate fire on the next tick.
 */
export async function checkAlertTriggers(
  snapshot: TonightSnapshot,
  options: { now?: Clock; publish?: AlertPublisher } = {}
): Promise<AlertEvaluation> {
  const now = options.now ?? Date.now;
  const publish = options.publish ?? defaultPublisher;

  const evaluation = evaluateAlertTriggers(snapshot, currentState, now);
  currentState = evaluation.state;
  await persistAlertState(currentState);

  for (const event of evaluation.toFire) {
    try {
      await publish(event.topic, event.data);
    } catch {
      // Publish is best-effort at this edge: the fired flag is already
      // persisted (state above), so a flaky FCM call is lost for tonight
      // rather than retried/duplicated on the next refresh tick -- consistent
      // with the doc's "prefer honest silence" stance on uncertain delivery.
    }
  }

  return evaluation;
}
