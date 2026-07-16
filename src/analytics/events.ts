import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { getConsent, isConsentLoaded, subscribeConsent } from './consent';
import {
  MAX_QUEUE_SIZE_BEFORE_FLUSH,
  bufferPendingEvent,
  dropQueueOnRevoke,
  mayFlush,
  pushToQueue,
  resolvePendingBeforeLoad,
  takeNextBatch
} from './core';

/**
 * Anonymous usage event client for POST /v1/events (see backend/src/events.ts).
 *
 * PRIVACY INVARIANTS:
 * - track() never sends anything, and never lets an event survive, unless
 *   consent is exactly 'accepted'. This is fail-closed at every stage,
 *   including while the persisted consent choice hasn't loaded yet (see
 *   `pendingBeforeLoad` below) -- no flush ever happens before load
 *   resolves.
 * - Only { type, spotId } is ever sent -- no timestamps (the server buckets
 *   by hour on arrival), no device/session info, nothing else.
 * - 'spot_shared' is intentionally never emitted by any call site in this
 *   codebase today -- there is no share action in the app. The type stays
 *   here only for parity with the backend's UsageEventType union; wire it
 *   up if/when a real share action is added, not before.
 * - Failures are dropped silently: no retries, no retry storms, never
 *   surfaced to the user, never allowed to block the UI.
 * - If consent is withdrawn (toggled off) after events were queued but
 *   before they were flushed, the queue is dropped rather than sent.
 *
 * This module is a thin RN-bound wrapper: the queueing/buffering/flush-gate
 * policy itself (buffer caps, promote-on-accepted, drop-on-revoke, the
 * "may we flush?" predicate) lives in the framework-free ./core.ts, so it
 * can be unit-tested directly under plain Node -- see
 * test/analytics-core.test.ts at the repo root.
 */
export type UsageEventType = 'spot_view' | 'navigate_pressed' | 'spot_shared';

type QueuedEvent = { type: UsageEventType; spotId: string };

// Same env/config pattern as src/api/backend.ts: backend usage requires
// both the feature flag and a configured base URL.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const USE_BACKEND = process.env.EXPO_PUBLIC_USE_BACKEND === 'true';

const FLUSH_INTERVAL_MS = 30_000;

let queue: QueuedEvent[] = [];
// Events that arrive before loadConsent() resolves. Held here instead of
// being sent or discarded outright, so a returning user who previously
// accepted doesn't silently lose their very first spot_view. Resolved by
// the subscribeConsent handler below the moment load completes -- kept
// only if the resolved state is 'accepted', dropped for anything else
// (including 'unset'). Never flushed directly from here.
let pendingBeforeLoad: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

function isConfigured(): boolean {
  return USE_BACKEND && Boolean(API_BASE_URL);
}

function ensureFlushTimer(): void {
  if (flushTimer || !isConfigured()) return;
  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
}

// Registered once and intentionally kept for the lifetime of the module --
// including while consent is declined -- because flush() (which this
// triggers) is itself always a fail-closed no-op unless consent is
// currently 'accepted' and the queue is non-empty, so leaving the
// subscription in place is harmless and simpler than adding/removing it on
// every consent toggle.
function ensureAppStateListener(): void {
  if (appStateSubscription) return;
  // AppState is part of react-native core, so it's trivially available on
  // both native and web (react-native-web) -- attempt a background-triggered
  // flush there. No fallback path is needed since this is always present.
  appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'background' || nextState === 'inactive') {
      void flush();
    }
  });
}

/**
 * Queues an anonymous usage event. Silently does nothing unless the user
 * has explicitly opted in and the backend is configured -- this is the
 * single gate every call site relies on, so screens never need to check
 * consent themselves.
 */
export function track(type: UsageEventType, spotId: string): void {
  if (!isConfigured()) return;

  if (!isConsentLoaded()) {
    // Fail-closed: we don't yet know the persisted choice, so we neither
    // send nor permanently discard this event -- it goes into a small
    // buffer that the subscribeConsent handler resolves once load
    // completes (kept only if that resolves to 'accepted').
    pendingBeforeLoad = bufferPendingEvent(pendingBeforeLoad, { type, spotId }).pendingBeforeLoad;
    return;
  }

  if (getConsent() !== 'accepted') return;

  const { queue: nextQueue, shouldFlush } = pushToQueue(queue, { type, spotId });
  queue = nextQueue;
  ensureFlushTimer();
  ensureAppStateListener();

  if (shouldFlush) {
    void flush();
  }
}

async function flush(): Promise<void> {
  if (queue.length === 0 || !isConfigured()) return;

  // Defense in depth: by construction flush() should only ever run once
  // consent has loaded and is 'accepted' (see track(), ensureFlushTimer(),
  // and the subscribeConsent handler below), but fail closed here too --
  // never send while that isn't true.
  if (!mayFlush({ loaded: isConsentLoaded(), consent: getConsent(), configured: isConfigured() })) {
    queue = dropQueueOnRevoke();
    return;
  }

  const { batch, remaining } = takeNextBatch(queue);
  queue = remaining;

  try {
    await fetch(`${API_BASE_URL}/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });
  } catch {
    // Fire-and-forget: on any failure (network, non-2xx handled server
    // side, etc.) we drop this batch silently. Never retry, never surface
    // to the user.
  }
}

subscribeConsent((state) => {
  // Resolve anything buffered before the persisted choice loaded. Pre-
  // consent events must never survive into a session that only becomes
  // 'accepted' later -- they are kept here solely because load hadn't
  // resolved yet, not because they were already known-consented.
  if (pendingBeforeLoad.length > 0) {
    const { pendingBeforeLoad: cleared, promoted } = resolvePendingBeforeLoad(pendingBeforeLoad, state);
    pendingBeforeLoad = cleared;
    if (promoted.length > 0) {
      queue = [...queue, ...promoted];
    }
  }

  if (state === 'accepted') {
    // Make sure anything promoted from the pending buffer (or left over
    // from a prior accepted session) actually gets flushed eventually,
    // even if no further track() call happens to (re)start the timer.
    if (queue.length > 0) {
      ensureFlushTimer();
      ensureAppStateListener();
      if (queue.length >= MAX_QUEUE_SIZE_BEFORE_FLUSH) {
        void flush();
      }
    }
    return;
  }

  // Declined (or back to 'unset', in principle): drop anything queued
  // immediately -- it must never be sent once consent is no longer
  // 'accepted' -- and stop the periodic flush. track() recreates the timer
  // via ensureFlushTimer() the next time an event is queued after consent
  // is accepted again.
  queue = dropQueueOnRevoke();
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
});
