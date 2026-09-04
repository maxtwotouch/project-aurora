// Tests for the pure consent-layering decision in src/trip/tripEventGate.ts
// -- no react-native import, so it runs the same way under plain node:test
// as analytics-core.test.ts. See that module's own header for the recorded
// decision (tourism-insights consent alone gates trip events -- never
// coupled to the separate usage-events consent, and never substitutable by
// an active Trip Mode session).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { mayEmitTripEvents, shouldFlushStopIntents } from '../src/trip/tripEventGate.js';
import type { TripEventGateInput, TripPresenceStopReason } from '../src/trip/tripEventGate.js';

function baseInput(overrides: Partial<TripEventGateInput> = {}): TripEventGateInput {
  return { loaded: true, tourismConsent: 'accepted', configured: true, ...overrides };
}

describe('mayEmitTripEvents: the happy path', () => {
  test('true when loaded, accepted, and configured', () => {
    assert.equal(mayEmitTripEvents(baseInput()), true);
  });
});

describe('mayEmitTripEvents: fails closed on each dimension independently', () => {
  test('false when not yet loaded, even if consent happens to be accepted', () => {
    assert.equal(mayEmitTripEvents(baseInput({ loaded: false })), false);
  });

  test('false when consent is declined', () => {
    assert.equal(mayEmitTripEvents(baseInput({ tourismConsent: 'declined' })), false);
  });

  test('false when consent is unset', () => {
    assert.equal(mayEmitTripEvents(baseInput({ tourismConsent: 'unset' })), false);
  });

  test('false when not configured (backend flag/base URL missing)', () => {
    assert.equal(mayEmitTripEvents(baseInput({ configured: false })), false);
  });

  test('false when every dimension is unfavorable at once', () => {
    assert.equal(mayEmitTripEvents({ loaded: false, tourismConsent: 'declined', configured: false }), false);
  });

  // There is no session field on TripEventGateInput at all -- the type
  // structurally cannot express "let a Trip Mode session through" -- so an
  // active session can never substitute for tourism consent. This exercises
  // the one case that matters in practice: consent explicitly declined,
  // everything else favorable.
  test('false when only a trip session is active (consent declined, loaded and configured true)', () => {
    assert.equal(mayEmitTripEvents({ loaded: true, tourismConsent: 'declined', configured: true }), false);
  });
});

describe('mayEmitTripEvents: independence from usage-events consent', () => {
  // This predicate takes no usage-events (`ConsentState`) input at all --
  // its signature structurally cannot be coupled to that dimension, which is
  // the point of the decision documented in tripEventGate.ts's header. This
  // test exists as a guard: accepted tourism-insights consent alone, with no
  // reference anywhere to the separate usage-events question, is sufficient.
  test('accepted tourism-insights consent alone is sufficient, regardless of what a caller "meant" by the other consent', () => {
    assert.equal(mayEmitTripEvents(baseInput({ tourismConsent: 'accepted' })), true);
  });
});

describe('shouldFlushStopIntents: the critical fix -- consent-revoked discards, everything else (while accepted) flushes', () => {
  test('consent-revoked: false regardless of the live consent value (discard the closing summary, never send it)', () => {
    assert.equal(shouldFlushStopIntents('consent-revoked', 'accepted'), false);
    assert.equal(shouldFlushStopIntents('consent-revoked', 'declined'), false);
  });

  test('background: true when consent is still accepted -- only the watcher stops', () => {
    assert.equal(shouldFlushStopIntents('background', 'accepted'), true);
  });

  test('background: false when consent is declined -- false ("background", "declined") === false', () => {
    assert.equal(shouldFlushStopIntents('background', 'declined'), false);
  });

  test('trip-ended: true when consent is accepted', () => {
    assert.equal(shouldFlushStopIntents('trip-ended', 'accepted'), true);
  });

  test('trip-ended: false when consent is not accepted -- sampling ran purely for the session, nothing to flush', () => {
    assert.equal(shouldFlushStopIntents('trip-ended', 'declined'), false);
    assert.equal(shouldFlushStopIntents('trip-ended', 'unset'), false);
  });

  test('permission-lost: true when consent still accepted -- only the watcher stops', () => {
    assert.equal(shouldFlushStopIntents('permission-lost', 'accepted'), true);
  });

  test('unmount: true when consent still accepted -- only the watcher stops', () => {
    assert.equal(shouldFlushStopIntents('unmount', 'accepted'), true);
  });

  test('exhaustive: with consent accepted, exactly one of the five reasons discards', () => {
    const reasons: TripPresenceStopReason[] = ['consent-revoked', 'trip-ended', 'background', 'permission-lost', 'unmount'];
    const discarding = reasons.filter((reason) => !shouldFlushStopIntents(reason, 'accepted'));
    assert.deepEqual(discarding, ['consent-revoked']);
  });

  test('exhaustive: with consent not accepted, every reason discards', () => {
    const reasons: TripPresenceStopReason[] = ['consent-revoked', 'trip-ended', 'background', 'permission-lost', 'unmount'];
    for (const reason of reasons) {
      assert.equal(shouldFlushStopIntents(reason, 'declined'), false, `expected ${reason} to discard while declined`);
      assert.equal(shouldFlushStopIntents(reason, 'unset'), false, `expected ${reason} to discard while unset`);
    }
  });
});

// D2: explicit literal matrix (Track D spec) -- deliberately overlapping with
// the coverage above, spelled out one assertion per documented case so the
// exact matrix in the spec is visible verbatim in the test file itself
// rather than only reconstructable from the scenario-style tests above.
describe('D2 matrix: mayEmitTripEvents over {tourismConsent, configured, loaded}', () => {
  test('tourism accepted + configured + loaded -> true', () => {
    assert.equal(mayEmitTripEvents({ loaded: true, tourismConsent: 'accepted', configured: true }), true);
  });

  test('loaded false (everything else favorable) -> false', () => {
    assert.equal(mayEmitTripEvents({ loaded: false, tourismConsent: 'accepted', configured: true }), false);
  });

  test('tourismConsent not accepted (everything else favorable) -> false', () => {
    assert.equal(mayEmitTripEvents({ loaded: true, tourismConsent: 'declined', configured: true }), false);
    assert.equal(mayEmitTripEvents({ loaded: true, tourismConsent: 'unset', configured: true }), false);
  });

  test('configured false (everything else favorable) -> false', () => {
    assert.equal(mayEmitTripEvents({ loaded: true, tourismConsent: 'accepted', configured: false }), false);
  });
});

describe('D2 matrix: shouldFlushStopIntents over the exact {reason, consent} pairs in the spec', () => {
  test("('background', 'accepted') -> true", () => {
    assert.equal(shouldFlushStopIntents('background', 'accepted'), true);
  });

  test("('background', 'declined') -> false", () => {
    assert.equal(shouldFlushStopIntents('background', 'declined'), false);
  });

  test("('trip-ended', 'accepted') -> true", () => {
    assert.equal(shouldFlushStopIntents('trip-ended', 'accepted'), true);
  });

  test("('trip-ended', 'declined') -> false", () => {
    assert.equal(shouldFlushStopIntents('trip-ended', 'declined'), false);
  });

  test("('consent-revoked', 'accepted') -> false", () => {
    assert.equal(shouldFlushStopIntents('consent-revoked', 'accepted'), false);
  });

  test("('permission-lost', 'unset') -> false", () => {
    assert.equal(shouldFlushStopIntents('permission-lost', 'unset'), false);
  });

  test('exhaustiveness over the reason union: every TripPresenceStopReason member is covered by exactly one of the assertions above or the exhaustive loops earlier in this file', () => {
    const reasons: TripPresenceStopReason[] = ['consent-revoked', 'trip-ended', 'background', 'permission-lost', 'unmount'];
    // Every reason must produce a defined boolean for both a favorable and an
    // unfavorable consent value -- i.e. the function is total over the union,
    // never throwing or returning undefined for any member.
    for (const reason of reasons) {
      assert.equal(typeof shouldFlushStopIntents(reason, 'accepted'), 'boolean');
      assert.equal(typeof shouldFlushStopIntents(reason, 'declined'), 'boolean');
      assert.equal(typeof shouldFlushStopIntents(reason, 'unset'), 'boolean');
    }
    assert.equal(reasons.length, 5);
  });
});
