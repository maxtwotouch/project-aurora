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
 * WIRE FORMAT (per the finalized parallel backend-PR contract note): the
 * backend's field name for the hour bucket is `utcHour` on every event type,
 * including the three that this app's own pure trip modules internally call
 * `timeBucket` (spot_visit, recommended_spot_visit, zone_dwell -- see
 * presenceCore.ts/zoneDiscovery.ts's own doc comments on why THEY chose
 * `timeBucket`). `toWirePayload()` below is the ONE place that translates
 * `timeBucket` -> `utcHour` at the send boundary; `spot_presence`/
 * `spot_presence_long` already use `utcHour` internally, so those pass
 * through unchanged. The merged pure modules (presenceCore.ts,
 * recommendationAttribution.ts, zoneDiscovery.ts) are deliberately NOT
 * renamed to match -- this is a wire-serialization concern, not a change to
 * their own documented intent shapes.
 *
 * `recommendationId` must additionally match the backend's
 * `^[a-z0-9_-]{1,64}$` validator; `toWirePayload()` drops (does not send)
 * any `recommended_spot_visit` whose id fails that check, rather than
 * letting one malformed item fail the entire batch atomically (see
 * backend/src/events.ts's `parseEvents`, which rejects a whole batch on any
 * single invalid item) -- this app only ever mints
 * attributionStore.ts's `TONIGHT_BEST_SPOT_RECOMMENDATION_ID` today, which
 * satisfies the pattern, so this is defense in depth, not an expected path.
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
import type { DwellBucket, PresenceIntent } from './presenceCore';
import type { RecommendedSpotVisitIntent } from './recommendationAttribution';
import type { ZoneDwellIntent } from './zoneDiscovery';

export type TripEventIntent = PresenceIntent | RecommendedSpotVisitIntent | ZoneDwellIntent;

/** The backend wire shape -- `utcHour` throughout, per the finalized backend contract (see module header). */
type TripEventWirePayload =
  | { type: 'spot_presence'; spotId: string; utcHour: number }
  | { type: 'spot_presence_long'; spotId: string; utcHour: number }
  | { type: 'spot_visit'; spotId: string; utcHour: number; dwellBucket: DwellBucket }
  | { type: 'recommended_spot_visit'; spotId: string; recommendationId: string; utcHour: number }
  | { type: 'zone_dwell'; h3Cell: string; utcHour: number; dwellBucket: DwellBucket };

const RECOMMENDATION_ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

/** Translates one internal intent into the backend's wire shape, or `null` to drop it (see module header). */
function toWirePayload(intent: TripEventIntent): TripEventWirePayload | null {
  switch (intent.type) {
    case 'spot_presence':
    case 'spot_presence_long':
      return { type: intent.type, spotId: intent.spotId, utcHour: intent.utcHour };
    case 'spot_visit':
      return { type: 'spot_visit', spotId: intent.spotId, utcHour: intent.timeBucket, dwellBucket: intent.dwellBucket };
    case 'recommended_spot_visit':
      if (!RECOMMENDATION_ID_PATTERN.test(intent.recommendationId)) return null;
      return {
        type: 'recommended_spot_visit',
        spotId: intent.spotId,
        recommendationId: intent.recommendationId,
        utcHour: intent.timeBucket
      };
    case 'zone_dwell':
      return { type: 'zone_dwell', h3Cell: intent.h3Cell, utcHour: intent.timeBucket, dwellBucket: intent.dwellBucket };
    default:
      return null;
  }
}

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

  const wireBatch = batch.map(toWirePayload).filter((item): item is TripEventWirePayload => item !== null);
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
 * `endPresenceSession` produces at a deliberate stop (Trip mode toggled off,
 * app backgrounded, permission lost). That summary describes a visit that
 * happened WHILE consent was 'accepted' -- withdrawing consent stops future
 * collection (docs/analytics-pivot.md section 2: "toggle off in Settings
 * stops collection immediately"), it does not un-happen data already
 * gathered under valid consent, and presenceCore.ts's own design already
 * treats an explicit session end as "a confirming instant" for exactly this
 * reason (see its `endPresenceSession` doc comment). Concretely: by the time
 * the presence hook's stop-handler runs in reaction to a consent change, the
 * shared consent module has ALREADY flipped to the new value, so routing
 * this through the normal `enqueueTripEvents` gate would silently drop the
 * very summary the toggle-off is supposed to still deliver. Still requires
 * `isConfigured()` (an infra check, not a consent check).
 */
export function flushFinalTripEvents(intents: readonly TripEventIntent[]): void {
  if (intents.length === 0 || !isConfigured()) return;
  void postBatch(intents);
}

// Drop everything queued (but not yet sent) the moment Trip-mode consent is
// no longer 'accepted' -- mirrors src/analytics/events.ts's subscribeConsent
// handler, but keyed on Trip-mode consent. Deliberately does NOT affect
// flushFinalTripEvents(), which bypasses this queue entirely.
subscribeTripModeConsent((state) => {
  if (state === 'accepted') return;

  queue = dropQueueOnRevoke();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
});
