/**
 * The parallel send path for Trip-mode location-derived events -- see
 * tripEventGate.ts's header for why this cannot just be
 * src/analytics/events.ts's `track()` (that function hard-codes the
 * separate usage-events consent dimension; this one is gated on Trip-mode
 * consent alone).
 *
 * Reuses the generic, already-unit-tested queue primitives from
 * src/analytics/core.ts (`pushToQueue`/`takeNextBatch`/`dropQueueOnRevoke`
 * are generic over `T` and reference no particular consent dimension) so
 * batching/cap behavior stays identical to the usage-events pipeline without
 * duplicating it. The consent GATE itself is `mayEmitTripEvents` from
 * ./tripEventGate.ts, keyed on Trip-mode consent instead.
 *
 * PRIVACY: every payload sent here is exactly one of the intent shapes
 * defined in presenceCore.ts / recommendationAttribution.ts /
 * zoneDiscovery.ts -- `spotId`/`h3Cell` plus an hour-granularity bucket and
 * (for visit summaries) a coarse dwell bucket. No coordinates, no
 * device/session identifiers, ever -- see those modules' own privacy
 * contracts. NEVER sent to PostHog: this module only ever calls `fetch()`
 * against our own backend's `/v1/events` route, the same identity-free
 * aggregate pipeline src/analytics/events.ts posts to (docs/analytics-
 * pivot.md section 3's amendment: "NOT sent to PostHog").
 *
 * BACKEND ALLOWLIST STATUS (read before assuming these are live): as of this
 * PR, backend/src/types.ts's `UsageEventType` is still exactly
 * `'spot_view' | 'navigate_pressed' | 'spot_shared'` -- none of the five
 * trip event types below exist in the backend allowlist yet. (docs/design-
 * trip-tracking.md's ship gate 6.4, "the two new types" for spot_presence/
 * spot_presence_long, was never actually shipped before this PR either, and
 * the analytics-pivot amendment adds three more on top of that.) Until the
 * parallel backend-allowlist PR lands, backend/src/events.ts's
 * `parseEvents` rejects the ENTIRE batch (HTTP 400) the moment it sees one
 * unrecognized `type` -- but `flush()`/`flushFinalTripEvents()` below never
 * inspect the response (matching src/analytics/events.ts's own
 * fire-and-forget pattern, which also ignores the response), so that 400 is
 * silently absorbed: no retry, no crash, no user-visible effect, just event
 * loss until the backend PR ships.
 *
 * WIRE FORMAT: the `timeBucket` -> `utcHour` translation and the
 * `recommendationId` pattern check now live in ./tripEventWire.ts (pure, no
 * react-native import, directly unit-tested in test/tripEventWire.test.ts)
 * -- this module just calls `toWireBatch()` right before `fetch()`.
 *
 * BATCH ISOLATION: this module's queue/flush cycle is entirely separate from
 * src/analytics/events.ts's (separate array, separate timer, separate
 * `fetch` call) -- trip events are never combined into the same HTTP request
 * body as the legacy usage events (spot_view/navigate_pressed/spot_shared),
 * so a malformed/not-yet-allowlisted trip event can never cause the backend
 * to atomically reject an unrelated usage-events batch, or vice versa.
 */

import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { getTripModeConsent, isTripModeConsentLoaded, subscribeTripModeConsent } from '../analytics/tripModeConsent';
import { dropQueueOnRevoke, pushToQueue, takeNextBatch } from '../analytics/core';
import { mayEmitTripEvents } from './tripEventGate';
import { toWireBatch } from './tripEventWire';
import type { TripEventIntent } from './tripEventWire';

export type { TripEventIntent };

// Same env/config pattern as src/analytics/events.ts and src/api/backend.ts
// (each module reads these itself rather than sharing a config singleton).
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const USE_BACKEND = process.env.EXPO_PUBLIC_USE_BACKEND === 'true';

const FLUSH_INTERVAL_MS = 30_000;

let queue: TripEventIntent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

function isConfigured(): boolean {
  return USE_BACKEND && Boolean(API_BASE_URL);
}

function currentGateInput() {
  return { loaded: isTripModeConsentLoaded(), tripModeConsent: getTripModeConsent(), configured: isConfigured() };
}

function ensureFlushTimer(): void {
  if (flushTimer || !isConfigured()) return;
  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
}

// NOTE (post-review, keep these two AppState listeners disjoint): this
// module and useTripPresence.ts EACH register their own AppState 'change'
// listener, deliberately -- do not merge them into one shared listener in a
// future refactor. This one only ever tries to FLUSH THE NETWORK QUEUE
// (already-built intents this module owns) on backgrounding -- it has no
// visibility into presence/zone state and must not gain any. The hook's own
// listener (see useTripPresence.ts) owns SAMPLING lifecycle -- starting/
// stopping the location watcher and computing the closing `spot_visit` via
// `endPresenceSession` -- which this module has no visibility into either.
// Same data, same trigger event, two independent concerns.
function ensureAppStateListener(): void {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'background' || nextState === 'inactive') {
      void flush();
    }
  });
}

async function postBatch(batch: readonly TripEventIntent[]): Promise<void> {
  if (batch.length === 0 || !isConfigured()) return;

  const wireBatch = toWireBatch(batch);
  if (wireBatch.length === 0) return;

  try {
    await fetch(`${API_BASE_URL}/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wireBatch)
    });
  } catch {
    // Fire-and-forget -- see module header. No retries, ever.
  }
}

/**
 * Queues one or more trip-event intents for sending. No-ops entirely unless
 * Trip-mode consent is currently 'accepted' and the backend is configured --
 * the presence hook never needs to check consent itself, same "single gate"
 * pattern as `track()` in src/analytics/events.ts.
 */
export function enqueueTripEvents(intents: readonly TripEventIntent[]): void {
  if (intents.length === 0) return;
  if (!mayEmitTripEvents(currentGateInput())) return;

  let shouldFlush = false;
  for (const intent of intents) {
    const result = pushToQueue(queue, intent);
    queue = result.queue;
    shouldFlush = shouldFlush || result.shouldFlush;
  }

  ensureFlushTimer();
  ensureAppStateListener();

  if (shouldFlush) {
    void flush();
  }
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;

  // Defense in depth, mirroring events.ts's flush(): by construction this
  // should only run while the gate is open, but re-check anyway.
  if (!mayEmitTripEvents(currentGateInput())) {
    queue = dropQueueOnRevoke();
    return;
  }

  const { batch, remaining } = takeNextBatch(queue);
  queue = remaining;
  await postBatch(batch);
}

/**
 * Force-flushes a small set of intents immediately, BYPASSING the current
 * consent re-check -- used ONLY for the closing `spot_visit` summary
 * `endPresenceSession` produces at a deliberate stop, and ONLY when the
 * caller (useTripPresence.ts's `stop()`) has already determined Trip-mode
 * consent is STILL 'accepted' at that moment (stop reasons `background`,
 * `permission-lost`, `unmount` -- see tripEventGate.ts's
 * `shouldFlushStopIntents`). That summary describes a visit that happened
 * WHILE consent was 'accepted', and presenceCore.ts's own design already
 * treats an explicit session end as "a confirming instant" for exactly this
 * reason (see its `endPresenceSession` doc comment) -- the bypass exists so
 * this one closing summary doesn't get lost to a benign timing race between
 * "the watcher itself needs to stop right now" (background/permission/
 * unmount) and the normal queue's periodic flush cadence.
 *
 * CRITICAL INVARIANT (post-review fix -- read before calling this from
 * anywhere new): this function must NEVER be called for a `consent-revoked`
 * stop. Consent withdrawal must stop collection immediately (docs/design-
 * trip-tracking.md section 5 / docs/analytics-pivot.md section 2: "toggle
 * off in Settings stops collection immediately") -- an earlier version of
 * this wiring routed every stop reason through this bypass, which meant
 * toggling Trip mode off could still fire one more POST after revocation.
 * useTripPresence.ts's `stop()` now decides whether to call this at all via
 * `shouldFlushStopIntents(reason)` BEFORE reaching this function; a
 * `consent-revoked` stop discards its `endPresenceSession` intents outright
 * and never calls this. Still requires `isConfigured()` (an infra check,
 * not a consent check) -- that alone is not sufficient permission to send.
 */
export function flushFinalTripEvents(intents: readonly TripEventIntent[]): void {
  if (intents.length === 0 || !isConfigured()) return;
  void postBatch(intents);
}

// Drop everything queued (but not yet sent) the moment Trip-mode consent is
// no longer 'accepted' -- mirrors src/analytics/events.ts's subscribeConsent
// handler, but keyed on Trip-mode consent. This is what satisfies "revoked
// consent means already-queued items must not post either": combined with
// `enqueueTripEvents`/`flush()`'s own `mayEmitTripEvents` gate (which
// re-checks the LIVE consent value via `getTripModeConsent()`, not a stale
// closure), no ordering assumption between this subscription firing and any
// other consent listener is required for correctness -- a queued item is
// either dropped here, or refused by the gate the next time anything tries
// to flush it, whichever happens first. Deliberately does NOT affect
// flushFinalTripEvents(), which bypasses this queue entirely (see that
// function's own doc comment for the invariant governing when it may be
// called at all).
subscribeTripModeConsent((state) => {
  if (state === 'accepted') return;

  queue = dropQueueOnRevoke();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
});
