// Tests for the pure consent-layering decision in src/trip/tripEventGate.ts
// -- no react-native import, so it runs the same way under plain node:test
// as analytics-core.test.ts. See that module's own header for the recorded
// decision (Trip-mode consent alone gates trip events -- never coupled to
// the separate usage-events consent).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { mayEmitTripEvents } from '../src/trip/tripEventGate.js';
import type { TripEventGateInput } from '../src/trip/tripEventGate.js';

function baseInput(overrides: Partial<TripEventGateInput> = {}): TripEventGateInput {
  return { loaded: true, tripModeConsent: 'accepted', configured: true, ...overrides };
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
    assert.equal(mayEmitTripEvents(baseInput({ tripModeConsent: 'declined' })), false);
  });

  test('false when consent is unset', () => {
    assert.equal(mayEmitTripEvents(baseInput({ tripModeConsent: 'unset' })), false);
  });

  test('false when not configured (backend flag/base URL missing)', () => {
    assert.equal(mayEmitTripEvents(baseInput({ configured: false })), false);
  });

  test('false when every dimension is unfavorable at once', () => {
    assert.equal(mayEmitTripEvents({ loaded: false, tripModeConsent: 'declined', configured: false }), false);
  });
});

describe('mayEmitTripEvents: independence from usage-events consent', () => {
  // This predicate takes no usage-events (`ConsentState`) input at all --
  // its signature structurally cannot be coupled to that dimension, which is
  // the point of the decision documented in tripEventGate.ts's header. This
  // test exists as a guard: accepting Trip-mode consent alone, with no
  // reference anywhere to the separate usage-events question, is sufficient.
  test('accepted Trip-mode consent alone is sufficient, regardless of what a caller "meant" by the other consent', () => {
    assert.equal(mayEmitTripEvents(baseInput({ tripModeConsent: 'accepted' })), true);
  });
});
