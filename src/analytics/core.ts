/**
 * Pure, framework-free decision logic for analytics consent + the usage
 * event queue. Deliberately has NO react-native / AsyncStorage / fetch
 * imports so it can be loaded and unit-tested directly under plain Node
 * (see test/analytics-core.test.ts at the repo root).
 *
 * consent.ts and events.ts are thin wrappers around this module: they own
 * the RN-bound bits (AsyncStorage/localStorage via ../lib/storage, AppState,
 * fetch, timers) and call into these pure functions for every decision.
 * This is a behavior-preserving extraction -- nothing here changes what the
 * app does, only where the decision logic lives.
 *
 * PRIVACY: this module never touches PII. It only ever moves around
 * `{ type, spotId }` event shapes and a three-state consent enum -- see the
 * invariants documented in consent.ts and events.ts.
 */

/**
 * Opt-in consent for anonymous usage instrumentation.
 *
 * PRIVACY INVARIANT: 'unset' is the only default, and it is treated the
 * same as 'declined' everywhere events are gated -- nothing is ever sent
 * unless this is exactly 'accepted'. Decline is a first-class, permanent
 * choice: it persists the same way accept does, and is never re-prompted
 * automatically.
 */
export type ConsentState = 'unset' | 'accepted' | 'declined';

/** Narrows a raw value read back from storage to a real persisted choice. */
export function isPersistedConsentState(value: string | null): value is 'accepted' | 'declined' {
  return value === 'accepted' || value === 'declined';
}

/**
 * Resolves what the in-memory consent state should become once the
 * persisted value has been read back from storage (or the read failed, in
 * which case the caller passes `null`). 'unset' is the only fallback --
 * anything that isn't a recognized persisted choice resolves to 'unset',
 * never to 'declined' or 'accepted' by accident.
 */
export function resolveLoadedConsentState(stored: string | null): ConsentState {
  return isPersistedConsentState(stored) ? stored : 'unset';
}

/**
 * Single "may we ever send data right now?" predicate, shared by every call
 * site that gates a flush. Fail-closed: only true when the persisted choice
 * has loaded AND is exactly 'accepted' AND the backend is configured (both
 * the feature flag and a base URL). Any one of those being false means no
 * flush happens.
 */
export type FlushGateInput = {
  loaded: boolean;
  consent: ConsentState;
  configured: boolean;
};

export function mayFlush(input: FlushGateInput): boolean {
  return input.loaded && input.consent === 'accepted' && input.configured;
}

// Small cap on events held while we don't yet know the persisted consent
// choice -- this only ever covers the first render or two right at app
// start, never a sustained backlog.
export const MAX_PENDING_BEFORE_LOAD = 10;
// Queue length that triggers an eager flush attempt (in addition to the
// periodic timer / app-backgrounding triggers).
export const MAX_QUEUE_SIZE_BEFORE_FLUSH = 10;
// Backend enforces a hard cap of 20 events per batch; staying at 10 keeps
// every flush comfortably under that regardless of how the queue built up.
export const MAX_BATCH_SIZE = 10;

export type BufferPendingResult<T> = {
  /** Whether the event was appended (false when the buffer was already full). */
  buffered: boolean;
  pendingBeforeLoad: T[];
};

/**
 * Decides whether an event that arrived before consent has loaded should be
 * buffered or dropped. The buffer is capped at MAX_PENDING_BEFORE_LOAD; once
 * full, further pre-load events are silently discarded rather than growing
 * the buffer unbounded.
 */
export function bufferPendingEvent<T>(pendingBeforeLoad: T[], event: T): BufferPendingResult<T> {
  if (pendingBeforeLoad.length >= MAX_PENDING_BEFORE_LOAD) {
    return { buffered: false, pendingBeforeLoad };
  }
  return { buffered: true, pendingBeforeLoad: [...pendingBeforeLoad, event] };
}

export type ResolvePendingResult<T> = {
  /** Always empty -- the pre-load buffer is cleared either way. */
  pendingBeforeLoad: T[];
  /** Events to append to the live send queue (empty unless resolved to 'accepted'). */
  promoted: T[];
};

/**
 * Resolves the pre-load buffer once the persisted consent choice is known.
 * Buffered events are promoted into the live queue only when consent
 * resolved to 'accepted'; for anything else (declined, or the
 * never-actually-persisted 'unset') they are dropped. The buffer itself is
 * always cleared regardless of outcome -- it must never be resolved twice.
 */
export function resolvePendingBeforeLoad<T>(
  pendingBeforeLoad: readonly T[],
  resolvedState: ConsentState
): ResolvePendingResult<T> {
  const promoted = resolvedState === 'accepted' ? [...pendingBeforeLoad] : [];
  return { pendingBeforeLoad: [], promoted };
}

export type QueuePushResult<T> = {
  queue: T[];
  /** True once the push crossed MAX_QUEUE_SIZE_BEFORE_FLUSH -- caller should flush. */
  shouldFlush: boolean;
};

/** Appends an event to the live send queue and reports whether the queue is now due for a flush. */
export function pushToQueue<T>(queue: readonly T[], event: T): QueuePushResult<T> {
  const next = [...queue, event];
  return { queue: next, shouldFlush: next.length >= MAX_QUEUE_SIZE_BEFORE_FLUSH };
}

export type BatchSplit<T> = {
  batch: T[];
  remaining: T[];
};

/**
 * Splits off the next outbound batch (capped at MAX_BATCH_SIZE), leaving
 * anything beyond that cap in the queue for a subsequent flush.
 */
export function takeNextBatch<T>(queue: readonly T[]): BatchSplit<T> {
  return { batch: queue.slice(0, MAX_BATCH_SIZE), remaining: queue.slice(MAX_BATCH_SIZE) };
}

/**
 * Consent was revoked (or reverted to 'unset', in principle) after events
 * were already queued: everything queued must be dropped, never sent.
 */
export function dropQueueOnRevoke<T>(): T[] {
  return [];
}
