// Tests for the pure decision logic extracted from src/analytics/consent.ts
// and src/analytics/events.ts into src/analytics/core.ts (no react-native
// imports, so it loads directly under plain node:test -- see core.ts's
// header comment for the extraction rationale).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_BATCH_SIZE,
  MAX_PENDING_BEFORE_LOAD,
  MAX_QUEUE_SIZE_BEFORE_FLUSH,
  bufferPendingEvent,
  dropQueueOnRevoke,
  isPersistedConsentState,
  mayFlush,
  pushToQueue,
  resolveLoadedConsentState,
  resolvePendingBeforeLoad,
  takeNextBatch
} from '../src/analytics/core.js';
import type { ConsentState } from '../src/analytics/core.js';

type Event = { type: 'spot_view' | 'navigate_pressed'; spotId: string };

function makeEvent(spotId: string): Event {
  return { type: 'spot_view', spotId };
}

describe('consent: isPersistedConsentState', () => {
  test('accepts "accepted" and "declined"', () => {
    assert.equal(isPersistedConsentState('accepted'), true);
    assert.equal(isPersistedConsentState('declined'), true);
  });

  test('rejects null, "unset", and any other string', () => {
    assert.equal(isPersistedConsentState(null), false);
    assert.equal(isPersistedConsentState('unset'), false);
    assert.equal(isPersistedConsentState(''), false);
    assert.equal(isPersistedConsentState('garbage'), false);
  });
});

describe('consent: resolveLoadedConsentState (initial "unset" + load transitions)', () => {
  test('a persisted "accepted" resolves to accepted', () => {
    assert.equal(resolveLoadedConsentState('accepted'), 'accepted');
  });

  test('a persisted "declined" resolves to declined', () => {
    assert.equal(resolveLoadedConsentState('declined'), 'declined');
  });

  test('nothing persisted (null, e.g. first open or a failed read) resolves to unset', () => {
    assert.equal(resolveLoadedConsentState(null), 'unset');
  });

  test('a corrupt/unrecognized persisted value falls back to unset (never accepted/declined)', () => {
    assert.equal(resolveLoadedConsentState('yes-please'), 'unset');
  });
});

describe('consent: mayFlush gating decisions (loaded-vs-not-loaded)', () => {
  test('false while not loaded, regardless of consent/config', () => {
    assert.equal(mayFlush({ loaded: false, consent: 'accepted', configured: true }), false);
  });

  test('false once loaded but consent is declined', () => {
    assert.equal(mayFlush({ loaded: true, consent: 'declined', configured: true }), false);
  });

  test('false once loaded but consent is still unset', () => {
    assert.equal(mayFlush({ loaded: true, consent: 'unset', configured: true }), false);
  });

  test('false when accepted and loaded but the backend is not configured', () => {
    assert.equal(mayFlush({ loaded: true, consent: 'accepted', configured: false }), false);
  });

  test('true only when loaded, accepted, and configured all hold', () => {
    assert.equal(mayFlush({ loaded: true, consent: 'accepted', configured: true }), true);
  });
});

describe('event queue: pre-load buffering (pendingBeforeLoad, cap 10)', () => {
  test('buffers events one at a time below the cap', () => {
    let pending: Event[] = [];
    const result = bufferPendingEvent(pending, makeEvent('a'));
    assert.equal(result.buffered, true);
    assert.deepEqual(result.pendingBeforeLoad, [makeEvent('a')]);
  });

  test('accepts events up to exactly MAX_PENDING_BEFORE_LOAD (10)', () => {
    assert.equal(MAX_PENDING_BEFORE_LOAD, 10);
    let pending: Event[] = [];
    for (let i = 0; i < MAX_PENDING_BEFORE_LOAD; i += 1) {
      const result = bufferPendingEvent(pending, makeEvent(`spot-${i}`));
      assert.equal(result.buffered, true);
      pending = result.pendingBeforeLoad;
    }
    assert.equal(pending.length, MAX_PENDING_BEFORE_LOAD);
  });

  test('drops (does not buffer) the 11th event once the cap is reached', () => {
    let pending: Event[] = [];
    for (let i = 0; i < MAX_PENDING_BEFORE_LOAD; i += 1) {
      pending = bufferPendingEvent(pending, makeEvent(`spot-${i}`)).pendingBeforeLoad;
    }
    const overflow = bufferPendingEvent(pending, makeEvent('one-too-many'));
    assert.equal(overflow.buffered, false);
    assert.equal(overflow.pendingBeforeLoad.length, MAX_PENDING_BEFORE_LOAD);
    // the buffer contents are unchanged -- the overflowing event never appears
    assert.ok(!overflow.pendingBeforeLoad.some((e) => e.spotId === 'one-too-many'));
  });
});

describe('event queue: resolving the pre-load buffer (promote-on-accepted / drop-otherwise)', () => {
  const buffered: Event[] = [makeEvent('a'), makeEvent('b'), makeEvent('c')];

  test('promotes every buffered event when consent resolves to accepted', () => {
    const result = resolvePendingBeforeLoad(buffered, 'accepted');
    assert.deepEqual(result.promoted, buffered);
    assert.deepEqual(result.pendingBeforeLoad, []);
  });

  test('drops the buffer (promotes nothing) when consent resolves to declined', () => {
    const result = resolvePendingBeforeLoad(buffered, 'declined');
    assert.deepEqual(result.promoted, []);
    assert.deepEqual(result.pendingBeforeLoad, []);
  });

  test('drops the buffer when consent resolves to unset (should not happen in practice, but must fail closed)', () => {
    const result = resolvePendingBeforeLoad(buffered, 'unset');
    assert.deepEqual(result.promoted, []);
    assert.deepEqual(result.pendingBeforeLoad, []);
  });

  test('the pre-load buffer is always cleared, even when nothing is promoted', () => {
    const states: ConsentState[] = ['accepted', 'declined', 'unset'];
    for (const state of states) {
      const result = resolvePendingBeforeLoad(buffered, state);
      assert.deepEqual(result.pendingBeforeLoad, [], `expected buffer cleared for state=${state}`);
    }
  });

  test('resolving an empty buffer is a no-op regardless of state', () => {
    const result = resolvePendingBeforeLoad([], 'accepted');
    assert.deepEqual(result.promoted, []);
    assert.deepEqual(result.pendingBeforeLoad, []);
  });
});

describe('event queue: live queue push + flush threshold (cap 10)', () => {
  test('pushing below the threshold does not request a flush', () => {
    let queue: Event[] = [];
    for (let i = 0; i < MAX_QUEUE_SIZE_BEFORE_FLUSH - 1; i += 1) {
      const result = pushToQueue(queue, makeEvent(`spot-${i}`));
      queue = result.queue;
      assert.equal(result.shouldFlush, false);
    }
    assert.equal(queue.length, MAX_QUEUE_SIZE_BEFORE_FLUSH - 1);
  });

  test('pushing the 10th event crosses MAX_QUEUE_SIZE_BEFORE_FLUSH and requests a flush', () => {
    assert.equal(MAX_QUEUE_SIZE_BEFORE_FLUSH, 10);
    let queue: Event[] = [];
    let lastResult;
    for (let i = 0; i < MAX_QUEUE_SIZE_BEFORE_FLUSH; i += 1) {
      lastResult = pushToQueue(queue, makeEvent(`spot-${i}`));
      queue = lastResult.queue;
    }
    assert.equal(queue.length, MAX_QUEUE_SIZE_BEFORE_FLUSH);
    assert.equal(lastResult!.shouldFlush, true);
  });

  test('pushToQueue does not mutate the input array', () => {
    const original: Event[] = [makeEvent('a')];
    const result = pushToQueue(original, makeEvent('b'));
    assert.equal(original.length, 1);
    assert.equal(result.queue.length, 2);
  });
});

describe('event queue: revoke drops the queue entirely', () => {
  test('dropQueueOnRevoke always returns an empty array', () => {
    assert.deepEqual(dropQueueOnRevoke<Event>(), []);
  });

  test('a populated queue is fully discarded on revoke, not partially', () => {
    let queue: Event[] = [makeEvent('a'), makeEvent('b'), makeEvent('c')];
    queue = dropQueueOnRevoke<Event>();
    assert.deepEqual(queue, []);
  });
});

describe('event queue: batch boundary (<= MAX_BATCH_SIZE, 10)', () => {
  test('a queue at or under the batch size is taken in a single batch with nothing remaining', () => {
    const queue = Array.from({ length: MAX_BATCH_SIZE }, (_, i) => makeEvent(`spot-${i}`));
    const { batch, remaining } = takeNextBatch(queue);
    assert.equal(batch.length, MAX_BATCH_SIZE);
    assert.deepEqual(remaining, []);
  });

  test('a queue over the batch size is split: first MAX_BATCH_SIZE taken, rest left for the next flush', () => {
    const queue = Array.from({ length: MAX_BATCH_SIZE + 5 }, (_, i) => makeEvent(`spot-${i}`));
    const { batch, remaining } = takeNextBatch(queue);
    assert.equal(batch.length, MAX_BATCH_SIZE);
    assert.equal(remaining.length, 5);
    assert.deepEqual(batch, queue.slice(0, MAX_BATCH_SIZE));
    assert.deepEqual(remaining, queue.slice(MAX_BATCH_SIZE));
  });

  test('an empty queue produces an empty batch and empty remainder', () => {
    const { batch, remaining } = takeNextBatch([]);
    assert.deepEqual(batch, []);
    assert.deepEqual(remaining, []);
  });

  test('takeNextBatch does not mutate the input queue', () => {
    const queue = Array.from({ length: MAX_BATCH_SIZE + 2 }, (_, i) => makeEvent(`spot-${i}`));
    const before = [...queue];
    takeNextBatch(queue);
    assert.deepEqual(queue, before);
  });
});

// Scenario-level regression coverage tracing the four flows called out in
// PR #11 (first open / returning-accepted / returning-declined /
// revoke-mid-queue) using only the pure primitives above, to guard the
// wiring in events.ts against silently drifting from this behavior.
describe('scenario: first open (consent not yet loaded)', () => {
  test('events queue into pendingBeforeLoad and never reach the live queue before load resolves', () => {
    let pending: Event[] = [];
    let queue: Event[] = [];

    pending = bufferPendingEvent(pending, makeEvent('spot-a')).pendingBeforeLoad;
    pending = bufferPendingEvent(pending, makeEvent('spot-b')).pendingBeforeLoad;

    assert.equal(queue.length, 0);
    assert.equal(pending.length, 2);
  });
});

describe('scenario: returning user who previously accepted', () => {
  test('load resolves to accepted, buffered events promote into the live queue and may trigger a flush', () => {
    let pending: Event[] = [makeEvent('spot-a'), makeEvent('spot-b')];
    let queue: Event[] = [];

    const resolvedState = resolveLoadedConsentState('accepted');
    const { pendingBeforeLoad, promoted } = resolvePendingBeforeLoad(pending, resolvedState);
    pending = pendingBeforeLoad;
    queue = [...queue, ...promoted];

    assert.equal(pending.length, 0);
    assert.deepEqual(queue, [makeEvent('spot-a'), makeEvent('spot-b')]);
    assert.equal(mayFlush({ loaded: true, consent: resolvedState, configured: true }), true);
  });
});

describe('scenario: returning user who previously declined', () => {
  test('load resolves to declined, buffered events are dropped and nothing may ever flush', () => {
    let pending: Event[] = [makeEvent('spot-a')];
    let queue: Event[] = [];

    const resolvedState = resolveLoadedConsentState('declined');
    const { pendingBeforeLoad, promoted } = resolvePendingBeforeLoad(pending, resolvedState);
    pending = pendingBeforeLoad;
    queue = [...queue, ...promoted];

    assert.equal(pending.length, 0);
    assert.deepEqual(queue, []);
    assert.equal(mayFlush({ loaded: true, consent: resolvedState, configured: true }), false);
  });
});

describe('scenario: consent revoked mid-queue', () => {
  test('a queue built while accepted is fully dropped the moment consent flips to declined', () => {
    let queue: Event[] = [];
    queue = pushToQueue(queue, makeEvent('spot-a')).queue;
    queue = pushToQueue(queue, makeEvent('spot-b')).queue;
    assert.equal(queue.length, 2);

    // consent toggled off before a flush happened
    queue = dropQueueOnRevoke<Event>();

    assert.deepEqual(queue, []);
    assert.equal(mayFlush({ loaded: true, consent: 'declined', configured: true }), false);
  });
});
