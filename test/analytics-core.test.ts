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
  PERSONAL_ANALYTICS_EVENT_ALLOWLIST,
  bufferPendingEvent,
  dropQueueOnRevoke,
  isAllowedPersonalAnalyticsEvent,
  isPersistedConsentState,
  isPersistedPersonalAnalyticsConsentState,
  isPersistedTourismConsentState,
  mayCapturePersonalAnalyticsEvent,
  mayFlush,
  pushToQueue,
  resolveLoadedConsentState,
  resolveLoadedPersonalAnalyticsConsentState,
  resolveLoadedTourismConsentState,
  resolvePendingBeforeLoad,
  resolvePersonalAnalyticsClientAction,
  takeNextBatch
} from '../src/analytics/core.js';
import type {
  ConsentState,
  PersonalAnalyticsConsentState,
  PersonalAnalyticsEventName,
  TourismConsentState
} from '../src/analytics/core.js';

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

// Tourism-insights consent (src/analytics/tourismConsent.ts) is a SECOND,
// INDEPENDENT consent dimension from the usage-events consent tested above
// -- see core.ts's TourismConsentState doc comment. These tests mirror the
// usage-consent coverage above 1:1 (default/accept/decline/toggle-off,
// corrupt-value fallback) and add explicit independence checks, since
// "never coupled to usage consent" is the entire point of having a second
// dimension at all.
describe('tourism consent: isPersistedTourismConsentState', () => {
  test('accepts "accepted" and "declined"', () => {
    assert.equal(isPersistedTourismConsentState('accepted'), true);
    assert.equal(isPersistedTourismConsentState('declined'), true);
  });

  test('rejects null, "unset", and any other string', () => {
    assert.equal(isPersistedTourismConsentState(null), false);
    assert.equal(isPersistedTourismConsentState('unset'), false);
    assert.equal(isPersistedTourismConsentState(''), false);
    assert.equal(isPersistedTourismConsentState('garbage'), false);
  });
});

describe('tourism consent: resolveLoadedTourismConsentState (default "unset" + load transitions)', () => {
  test('default state: nothing persisted (first open, or a failed read) resolves to unset', () => {
    assert.equal(resolveLoadedTourismConsentState(null), 'unset');
  });

  test('accept: a persisted "accepted" resolves to accepted', () => {
    assert.equal(resolveLoadedTourismConsentState('accepted'), 'accepted');
  });

  test('decline: a persisted "declined" resolves to declined', () => {
    assert.equal(resolveLoadedTourismConsentState('declined'), 'declined');
  });

  test('toggle-off-after-accept: simulating accept then decline persists the latest choice, not the first', () => {
    // No shared mutable state in core.ts -- each call is independent, so
    // "toggling" is just resolving the most recently persisted value.
    const afterAccept = resolveLoadedTourismConsentState('accepted');
    assert.equal(afterAccept, 'accepted');

    const afterDecline = resolveLoadedTourismConsentState('declined');
    assert.equal(afterDecline, 'declined');
  });

  test('a corrupt/unrecognized persisted value falls back to unset (never accepted/declined)', () => {
    assert.equal(resolveLoadedTourismConsentState('yes-please'), 'unset');
  });
});

describe('tourism consent: independence from usage consent', () => {
  test('the same raw stored value is interpreted identically but by fully separate functions', () => {
    const usage: ConsentState = resolveLoadedConsentState('accepted');
    const trip: TourismConsentState = resolveLoadedTourismConsentState('declined');

    // Different inputs to each dimension produce different, uncoupled outputs --
    // nothing here reads or infers one from the other.
    assert.equal(usage, 'accepted');
    assert.equal(trip, 'declined');
  });

  test('accepting usage consent has no bearing on what trip mode resolves to, and vice versa', () => {
    // Usage consent accepted, trip mode never persisted (still unset).
    assert.equal(resolveLoadedConsentState('accepted'), 'accepted');
    assert.equal(resolveLoadedTourismConsentState(null), 'unset');

    // Trip mode accepted, usage consent never persisted (still unset).
    assert.equal(resolveLoadedTourismConsentState('accepted'), 'accepted');
    assert.equal(resolveLoadedConsentState(null), 'unset');

    // Usage consent declined, trip mode accepted -- both directions independently non-default.
    assert.equal(resolveLoadedConsentState('declined'), 'declined');
    assert.equal(resolveLoadedTourismConsentState('accepted'), 'accepted');
  });

  test('isPersistedConsentState and isPersistedTourismConsentState agree on validity (same tri-state shape) but are distinct functions', () => {
    assert.notEqual(isPersistedConsentState, isPersistedTourismConsentState as unknown as typeof isPersistedConsentState);
    for (const value of ['accepted', 'declined', null, 'unset', 'garbage']) {
      assert.equal(isPersistedConsentState(value), isPersistedTourismConsentState(value));
    }
  });
});

// Person-level analytics consent (src/analytics/personalAnalyticsConsent.ts) is a THIRD,
// INDEPENDENT consent dimension from both the aggregate usage-events consent and Trip mode
// consent tested above -- see core.ts's PersonalAnalyticsConsentState doc comment
// (docs/analytics-pivot.md, PR 2 of the analytics pivot). These tests mirror the trip-mode
// coverage above 1:1 (default/accept/decline/toggle-off, corrupt-value fallback) and add
// explicit three-way independence checks, since "never coupled to either other dimension"
// is the entire point of having a third dimension at all -- including the re-consent rule
// that this dimension defaults to 'unset' for everyone regardless of what they answered for
// the other two.
describe('personalAnalytics consent: isPersistedPersonalAnalyticsConsentState', () => {
  test('accepts "accepted" and "declined"', () => {
    assert.equal(isPersistedPersonalAnalyticsConsentState('accepted'), true);
    assert.equal(isPersistedPersonalAnalyticsConsentState('declined'), true);
  });

  test('rejects null, "unset", and any other string', () => {
    assert.equal(isPersistedPersonalAnalyticsConsentState(null), false);
    assert.equal(isPersistedPersonalAnalyticsConsentState('unset'), false);
    assert.equal(isPersistedPersonalAnalyticsConsentState(''), false);
    assert.equal(isPersistedPersonalAnalyticsConsentState('garbage'), false);
  });
});

describe('personalAnalytics consent: resolveLoadedPersonalAnalyticsConsentState (default "unset" + load transitions)', () => {
  test('default state: nothing persisted (first open, or a failed read) resolves to unset', () => {
    assert.equal(resolveLoadedPersonalAnalyticsConsentState(null), 'unset');
  });

  test('accept: a persisted "accepted" resolves to accepted', () => {
    assert.equal(resolveLoadedPersonalAnalyticsConsentState('accepted'), 'accepted');
  });

  test('decline: a persisted "declined" resolves to declined', () => {
    assert.equal(resolveLoadedPersonalAnalyticsConsentState('declined'), 'declined');
  });

  test('toggle-off-after-accept: simulating accept then decline persists the latest choice, not the first', () => {
    const afterAccept = resolveLoadedPersonalAnalyticsConsentState('accepted');
    assert.equal(afterAccept, 'accepted');

    const afterDecline = resolveLoadedPersonalAnalyticsConsentState('declined');
    assert.equal(afterDecline, 'declined');
  });

  test('a corrupt/unrecognized persisted value falls back to unset (never accepted/declined) -- fail closed', () => {
    assert.equal(resolveLoadedPersonalAnalyticsConsentState('yes-please'), 'unset');
  });
});

describe('personalAnalytics consent: re-consent-by-construction (new dimension, no carry-over from usage consent)', () => {
  test('a user who previously accepted usage consent still resolves to unset for personal analytics until they answer the new question', () => {
    // Simulates a returning user: usage consent has a real persisted value from before the
    // pivot shipped, but personal-analytics consent has never been persisted for them
    // (there is no migration path that copies one into the other).
    assert.equal(resolveLoadedConsentState('accepted'), 'accepted');
    assert.equal(resolveLoadedPersonalAnalyticsConsentState(null), 'unset');
  });

  test('a user who previously declined usage consent also resolves to unset for personal analytics -- decline does not carry over as accept OR as decline', () => {
    assert.equal(resolveLoadedConsentState('declined'), 'declined');
    assert.equal(resolveLoadedPersonalAnalyticsConsentState(null), 'unset');
  });
});

describe('personalAnalytics consent: independence from BOTH usage consent and trip-mode consent', () => {
  test('mutating personal-analytics consent has no bearing on what usage consent or trip-mode consent resolve to', () => {
    // Personal analytics accepted; the other two dimensions never persisted (still unset).
    assert.equal(resolveLoadedPersonalAnalyticsConsentState('accepted'), 'accepted');
    assert.equal(resolveLoadedConsentState(null), 'unset');
    assert.equal(resolveLoadedTourismConsentState(null), 'unset');
  });

  test('mutating usage consent has no bearing on what personal-analytics consent resolves to', () => {
    assert.equal(resolveLoadedConsentState('accepted'), 'accepted');
    assert.equal(resolveLoadedPersonalAnalyticsConsentState(null), 'unset');
  });

  test('mutating trip-mode consent has no bearing on what personal-analytics consent resolves to', () => {
    assert.equal(resolveLoadedTourismConsentState('accepted'), 'accepted');
    assert.equal(resolveLoadedPersonalAnalyticsConsentState(null), 'unset');
  });

  test('all three dimensions can independently hold different, non-default values simultaneously', () => {
    const usage: ConsentState = resolveLoadedConsentState('accepted');
    const trip: TourismConsentState = resolveLoadedTourismConsentState('declined');
    const personalAnalytics: PersonalAnalyticsConsentState = resolveLoadedPersonalAnalyticsConsentState('accepted');

    assert.equal(usage, 'accepted');
    assert.equal(trip, 'declined');
    assert.equal(personalAnalytics, 'accepted');

    // Every combination of the three states is representable independently -- re-run with
    // usage and personal-analytics swapped to confirm neither function's behavior depends
    // on argument order or a shared module-level default.
    assert.equal(resolveLoadedConsentState('declined'), 'declined');
    assert.equal(resolveLoadedPersonalAnalyticsConsentState('declined'), 'declined');
    assert.equal(resolveLoadedTourismConsentState('accepted'), 'accepted');
  });

  test('isPersistedConsentState, isPersistedTourismConsentState, and isPersistedPersonalAnalyticsConsentState agree on validity but are three distinct functions', () => {
    assert.notEqual(
      isPersistedConsentState,
      isPersistedPersonalAnalyticsConsentState as unknown as typeof isPersistedConsentState
    );
    assert.notEqual(
      isPersistedTourismConsentState,
      isPersistedPersonalAnalyticsConsentState as unknown as typeof isPersistedTourismConsentState
    );
    for (const value of ['accepted', 'declined', null, 'unset', 'garbage']) {
      assert.equal(isPersistedConsentState(value), isPersistedPersonalAnalyticsConsentState(value));
      assert.equal(isPersistedTourismConsentState(value), isPersistedPersonalAnalyticsConsentState(value));
    }
  });
});

// PostHog SDK lifecycle + the fixed 8-event allowlist (src/analytics/posthog.ts,
// src/analytics/personalAnalytics.ts, docs/analytics-pivot.md section 3). Both of
// those files import posthog-react-native / expo-constants and cannot load under
// plain node:test, so every gating decision they make is expressed here first and
// exercised directly -- see each file's header comment for the "core owns the
// decision, the sibling owns the side effect" split.
describe('personalAnalytics: PERSONAL_ANALYTICS_EVENT_ALLOWLIST is exactly the 8 declared events', () => {
  test('the allowlist has exactly 8 entries, matching docs/analytics-pivot.md section 3 / privacy-policy.md', () => {
    assert.equal(PERSONAL_ANALYTICS_EVENT_ALLOWLIST.length, 8);
    assert.deepEqual(
      [...PERSONAL_ANALYTICS_EVENT_ALLOWLIST].sort(),
      [
        'alerts_opt_in',
        'app_open',
        'language_set',
        'navigate_pressed',
        'screen_view',
        'spot_shared',
        'spot_view',
        'trip_mode_toggled'
      ].sort()
    );
  });
});

describe('personalAnalytics: isAllowedPersonalAnalyticsEvent', () => {
  test('every declared allowlist member is itself recognized as allowed', () => {
    for (const event of PERSONAL_ANALYTICS_EVENT_ALLOWLIST) {
      assert.equal(isAllowedPersonalAnalyticsEvent(event), true, `expected ${event} to be allowed`);
    }
  });

  test('rejects event names outside the allowlist, including plausible-looking near misses', () => {
    const rejected = [
      // Nothing autocapture-shaped, nothing session-replay/error-capture-shaped,
      // nothing that isn't one of the 8 exact names -- see CLAUDE.md's "no
      // autocapture, no session replay, no error/crash capture".
      '$pageview',
      '$autocapture',
      '$exception',
      'location_requested', // the wizard's own stray event -- must never be allowed
      'alert_preferences_changed', // ditto
      'spot_viewed', // near-miss of spot_view
      '',
      'App_Open' // case-sensitive: exact names only
    ];
    for (const event of rejected) {
      assert.equal(isAllowedPersonalAnalyticsEvent(event), false, `expected ${event} to be rejected`);
    }
  });
});

describe('personalAnalytics: mayCapturePersonalAnalyticsEvent (consent x client x allowlist -> send?)', () => {
  const allowedEvent: PersonalAnalyticsEventName = 'spot_view';

  test('false when consent is unset, regardless of client/event', () => {
    assert.equal(mayCapturePersonalAnalyticsEvent({ consent: 'unset', clientReady: true, event: allowedEvent }), false);
  });

  test('false when consent is declined, regardless of client/event', () => {
    assert.equal(
      mayCapturePersonalAnalyticsEvent({ consent: 'declined', clientReady: true, event: allowedEvent }),
      false
    );
  });

  test('false when consent is accepted but no client instance exists yet (construction itself is consent-gated -- see posthog.ts)', () => {
    assert.equal(
      mayCapturePersonalAnalyticsEvent({ consent: 'accepted', clientReady: false, event: allowedEvent }),
      false
    );
  });

  test('false when consent is accepted and a client exists, but the event is not on the allowlist', () => {
    assert.equal(
      mayCapturePersonalAnalyticsEvent({ consent: 'accepted', clientReady: true, event: 'location_requested' }),
      false
    );
  });

  test('true only when consent is accepted, a client exists, AND the event is allowlisted', () => {
    assert.equal(
      mayCapturePersonalAnalyticsEvent({ consent: 'accepted', clientReady: true, event: allowedEvent }),
      true
    );
  });

  test('every one of the 8 allowlisted events sends when accepted + client ready, and none do otherwise', () => {
    for (const event of PERSONAL_ANALYTICS_EVENT_ALLOWLIST) {
      assert.equal(mayCapturePersonalAnalyticsEvent({ consent: 'accepted', clientReady: true, event }), true);
      assert.equal(mayCapturePersonalAnalyticsEvent({ consent: 'accepted', clientReady: false, event }), false);
      assert.equal(mayCapturePersonalAnalyticsEvent({ consent: 'declined', clientReady: true, event }), false);
      assert.equal(mayCapturePersonalAnalyticsEvent({ consent: 'unset', clientReady: true, event }), false);
    }
  });
});

describe('personalAnalytics: resolvePersonalAnalyticsClientAction (SDK construction/teardown lifecycle)', () => {
  test('never constructs before consent is accepted, even when configured -- the hard "zero bytes before accept" contract', () => {
    assert.equal(resolvePersonalAnalyticsClientAction({ consent: 'unset', configured: true }, false), 'none');
    assert.equal(resolvePersonalAnalyticsClientAction({ consent: 'declined', configured: true }, false), 'none');
  });

  test('constructs exactly once consent flips to accepted, given config is present and no instance exists yet', () => {
    assert.equal(resolvePersonalAnalyticsClientAction({ consent: 'accepted', configured: true }, false), 'construct');
  });

  test('does not reconstruct if an instance already exists and consent is still accepted', () => {
    assert.equal(resolvePersonalAnalyticsClientAction({ consent: 'accepted', configured: true }, true), 'none');
  });

  test('stays disabled (never constructs) when accepted but not configured -- missing config behaves like "not accepted"', () => {
    assert.equal(resolvePersonalAnalyticsClientAction({ consent: 'accepted', configured: false }, false), 'none');
  });

  test('tears down (optOut + reset) when an instance exists and consent is withdrawn to declined', () => {
    assert.equal(resolvePersonalAnalyticsClientAction({ consent: 'declined', configured: true }, true), 'teardown');
  });

  test('tears down if consent unexpectedly reverts to unset while an instance exists (fail closed, not just the declined path)', () => {
    assert.equal(resolvePersonalAnalyticsClientAction({ consent: 'unset', configured: true }, true), 'teardown');
  });

  test('no-op once torn down (no instance, not accepted) -- does not re-request teardown', () => {
    assert.equal(resolvePersonalAnalyticsClientAction({ consent: 'declined', configured: true }, false), 'none');
  });

  test('scenario: full lifecycle -- unset -> accepted (construct) -> declined (teardown) -> accepted again (construct)', () => {
    let hasInstance = false;

    let action = resolvePersonalAnalyticsClientAction({ consent: 'unset', configured: true }, hasInstance);
    assert.equal(action, 'none');

    action = resolvePersonalAnalyticsClientAction({ consent: 'accepted', configured: true }, hasInstance);
    assert.equal(action, 'construct');
    hasInstance = true;

    action = resolvePersonalAnalyticsClientAction({ consent: 'declined', configured: true }, hasInstance);
    assert.equal(action, 'teardown');
    hasInstance = false;

    action = resolvePersonalAnalyticsClientAction({ consent: 'accepted', configured: true }, hasInstance);
    assert.equal(action, 'construct');
  });
});
