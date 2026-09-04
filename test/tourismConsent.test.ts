// Tests for the tourism-insights consent dimension in src/analytics/core.ts
// -- no react-native import, so it runs the same way under plain node:test
// as analytics-core.test.ts. See core.ts's TourismConsentState doc comment
// for the "second, independent consent dimension" contract this exercises,
// and tripEventGate.ts's header for why mayEmitTripEvents is keyed on
// tourism consent alone.
//
// This file focuses narrowly on:
//   1. resolveLoadedTourismConsentState / isPersistedTourismConsentState in
//      isolation (first-launch default, garbage fallback, real values).
//   2. Separation: showing that mayFlush (usage consent), mayEmitTripEvents
//      (tourism consent), and mayCapturePersonalAnalyticsEvent (PostHog
//      consent) each take their OWN input shape and never reach into
//      another dimension's value -- built explicitly here rather than
//      re-asserted from analytics-core.test.ts's own coverage.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isPersistedTourismConsentState, mayCapturePersonalAnalyticsEvent, mayFlush, resolveLoadedTourismConsentState } from '../src/analytics/core.js';
import type { PersonalAnalyticsSendGateInput, FlushGateInput } from '../src/analytics/core.js';
import { mayEmitTripEvents } from '../src/trip/tripEventGate.js';
import type { TripEventGateInput } from '../src/trip/tripEventGate.js';

describe('resolveLoadedTourismConsentState: first-launch default + persisted values', () => {
  test('null (nothing persisted, e.g. first launch or a failed read) resolves to unset', () => {
    assert.equal(resolveLoadedTourismConsentState(null), 'unset');
  });

  test('garbage/unrecognized persisted value resolves to unset, never accepted/declined', () => {
    assert.equal(resolveLoadedTourismConsentState('garbage'), 'unset');
    assert.equal(resolveLoadedTourismConsentState('yes-please'), 'unset');
    assert.equal(resolveLoadedTourismConsentState(''), 'unset');
  });

  test('"accepted" resolves to accepted', () => {
    assert.equal(resolveLoadedTourismConsentState('accepted'), 'accepted');
  });

  test('"declined" resolves to declined', () => {
    assert.equal(resolveLoadedTourismConsentState('declined'), 'declined');
  });
});

describe('isPersistedTourismConsentState', () => {
  test('true only for "accepted" and "declined"', () => {
    assert.equal(isPersistedTourismConsentState('accepted'), true);
    assert.equal(isPersistedTourismConsentState('declined'), true);
  });

  test('false for null, "unset", and any other string', () => {
    assert.equal(isPersistedTourismConsentState(null), false);
    assert.equal(isPersistedTourismConsentState('unset'), false);
    assert.equal(isPersistedTourismConsentState('garbage'), false);
    assert.equal(isPersistedTourismConsentState(''), false);
  });
});

describe('separation: mayFlush, mayEmitTripEvents, and mayCapturePersonalAnalyticsEvent read three different inputs', () => {
  test('mayFlush (usage-events consent) is unaffected by any tourism-consent value -- its input shape has no tourism field at all', () => {
    // FlushGateInput structurally cannot carry a tourism value -- this input
    // is built using only the usage-consent dimension, and mayFlush returns
    // true purely on that basis regardless of what tourism consent happens
    // to be elsewhere in the app.
    const usageAcceptedInput: FlushGateInput = { loaded: true, consent: 'accepted', configured: true };
    assert.equal(mayFlush(usageAcceptedInput), true);

    const usageDeclinedInput: FlushGateInput = { loaded: true, consent: 'declined', configured: true };
    assert.equal(mayFlush(usageDeclinedInput), false);
  });

  test('a TripEventGateInput built from usage consent "accepted" but tourism consent "declined" is refused by mayEmitTripEvents', () => {
    // The scenario the module header calls out explicitly: a user who
    // accepts the unrelated usage-counter question but never accepts (or
    // withdraws) tourism insights must never have trip events sent on that
    // basis. mayFlush(usage) being true here is irrelevant -- it is never
    // consulted by mayEmitTripEvents, whose input type has no usage-consent
    // field at all.
    const usageConsentAccepted: FlushGateInput = { loaded: true, consent: 'accepted', configured: true };
    assert.equal(mayFlush(usageConsentAccepted), true);

    const tripInput: TripEventGateInput = { loaded: true, tourismConsent: 'declined', configured: true };
    assert.equal(mayEmitTripEvents(tripInput), false);
  });

  test('mayCapturePersonalAnalyticsEvent with PostHog consent "declined" stays false regardless of tourism consent', () => {
    // mayCapturePersonalAnalyticsEvent's input (PersonalAnalyticsSendGateInput)
    // has no tourism field either -- build two inputs that differ only in a
    // tourism value neither of them can even express, to show the PostHog
    // gate's answer is identical either way.
    const declinedWithTourismAccepted: PersonalAnalyticsSendGateInput = {
      consent: 'declined',
      clientReady: true,
      event: 'spot_view'
    };
    const declinedWithTourismDeclined: PersonalAnalyticsSendGateInput = {
      consent: 'declined',
      clientReady: true,
      event: 'spot_view'
    };

    // Both inputs are identical in every field mayCapturePersonalAnalyticsEvent
    // actually reads -- there is no tourism dimension on this type to vary --
    // demonstrating the predicate cannot be swayed by tourism consent no
    // matter what it is set to elsewhere in the app.
    assert.equal(mayCapturePersonalAnalyticsEvent(declinedWithTourismAccepted), false);
    assert.equal(mayCapturePersonalAnalyticsEvent(declinedWithTourismDeclined), false);

    // And accepting tourism consent for real (via the actual resolver) still
    // has no bearing on the PostHog gate's own consent dimension.
    assert.equal(resolveLoadedTourismConsentState('accepted'), 'accepted');
    assert.equal(mayCapturePersonalAnalyticsEvent({ consent: 'declined', clientReady: true, event: 'spot_view' }), false);
  });

  test('none of the three predicates\' input types share a field name that could accidentally cross-wire them', () => {
    // FlushGateInput: { loaded, consent, configured }
    // TripEventGateInput: { loaded, tourismConsent, configured }
    // PersonalAnalyticsSendGateInput: { consent, clientReady, event }
    // "consent" means something different in FlushGateInput (usage) vs
    // PersonalAnalyticsSendGateInput (PostHog); TripEventGateInput avoids the
    // ambiguity entirely by naming its own field "tourismConsent". Exercised
    // here by constructing all three with deliberately mismatched "as if
    // shared" values and confirming each predicate only ever obeys its own.
    const flush = mayFlush({ loaded: true, consent: 'declined', configured: true });
    const trip = mayEmitTripEvents({ loaded: true, tourismConsent: 'accepted', configured: true });
    const personal = mayCapturePersonalAnalyticsEvent({ consent: 'accepted', clientReady: true, event: 'spot_view' });

    assert.equal(flush, false);
    assert.equal(trip, true);
    assert.equal(personal, true);
  });
});
