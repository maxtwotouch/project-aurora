// Tests for Trip Mode's product-state reducer + module store in
// src/trip/tripSession.ts -- the reducer functions (startTripSession,
// endTripSession, recordTripArrival) and the module-level store built on top
// of them are react-native-free (the `useTripSession` hook at the bottom of
// that file imports `react`, which resolves fine under plain node -- it is
// only a hook *definition*, never invoked here). See that module's own
// header for the "product state, not a consent" contract, and
// docs/decision-tourism-baseline.md for the product spec.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_TRIP_SESSION_STATE,
  beginTripSession,
  endTripSession,
  finishTripSession,
  getTripSession,
  noteTripArrival,
  recordTripArrival,
  resetTripSessionStore,
  startTripSession,
  subscribeTripSession
} from '../src/trip/tripSession.js';
import type { TripSessionState } from '../src/trip/tripSession.js';

const T0 = Date.UTC(2026, 7, 18, 20, 0, 0);

describe('startTripSession (pure reducer)', () => {
  test('starting from the initial (inactive) state becomes active with startedAtMs and an empty visit list', () => {
    const next = startTripSession(INITIAL_TRIP_SESSION_STATE, T0);
    assert.deepEqual(next, { active: true, startedAtMs: T0, visitedSpotIds: [] });
  });

  test('starting while already active is a no-op -- returns the exact same object, not merely an equal one', () => {
    const active: TripSessionState = { active: true, startedAtMs: T0, visitedSpotIds: ['ersfjordbotn'] };
    const next = startTripSession(active, T0 + 60_000);
    assert.equal(next, active);
  });
});

describe('recordTripArrival (pure reducer)', () => {
  test('recording an arrival while inactive is a no-op -- returns the exact same object', () => {
    const inactive = INITIAL_TRIP_SESSION_STATE;
    const next = recordTripArrival(inactive, 'ersfjordbotn');
    assert.equal(next, inactive);
  });

  test('records arrivals in order', () => {
    let state = startTripSession(INITIAL_TRIP_SESSION_STATE, T0);
    state = recordTripArrival(state, 'ersfjordbotn');
    state = recordTripArrival(state, 'grotfjord');
    assert.deepEqual(state.visitedSpotIds, ['ersfjordbotn', 'grotfjord']);
  });

  test('dedupes -- arriving at the same spot again does not append a second entry', () => {
    let state = startTripSession(INITIAL_TRIP_SESSION_STATE, T0);
    state = recordTripArrival(state, 'ersfjordbotn');
    const beforeSecondArrival = state;
    state = recordTripArrival(state, 'ersfjordbotn');
    assert.deepEqual(state.visitedSpotIds, ['ersfjordbotn']);
    // A duplicate arrival is itself a no-op -- same object identity.
    assert.equal(state, beforeSecondArrival);
  });
});

describe('endTripSession (pure reducer)', () => {
  test('ending an active session returns INITIAL_TRIP_SESSION_STATE, discarding the visited list', () => {
    let state = startTripSession(INITIAL_TRIP_SESSION_STATE, T0);
    state = recordTripArrival(state, 'ersfjordbotn');
    state = recordTripArrival(state, 'grotfjord');

    const ended = endTripSession(state);
    assert.deepEqual(ended, INITIAL_TRIP_SESSION_STATE);
  });

  test('ending while inactive is a no-op -- returns the exact same object', () => {
    const inactive = INITIAL_TRIP_SESSION_STATE;
    const ended = endTripSession(inactive);
    assert.equal(ended, inactive);
  });
});

describe('module store: beginTripSession / noteTripArrival / getTripSession', () => {
  afterEach(() => {
    resetTripSessionStore();
  });

  test('beginTripSession(123) followed by noteTripArrival records the arrival in getTripSession()', () => {
    beginTripSession(123);
    noteTripArrival('a');
    assert.deepEqual(getTripSession().visitedSpotIds, ['a']);
    assert.equal(getTripSession().active, true);
    assert.equal(getTripSession().startedAtMs, 123);
  });

  test('subscribeTripSession: the listener fires on a real change', () => {
    let calls = 0;
    let lastState: TripSessionState | null = null;
    const unsubscribe = subscribeTripSession((state) => {
      calls += 1;
      lastState = state;
    });

    beginTripSession(T0);
    assert.equal(calls, 1);
    assert.equal(lastState?.active, true);

    noteTripArrival('ersfjordbotn');
    assert.equal(calls, 2);
    assert.deepEqual(lastState?.visitedSpotIds, ['ersfjordbotn']);

    unsubscribe();
  });

  test('subscribeTripSession: the listener does NOT fire on a no-op commit', () => {
    let calls = 0;
    const unsubscribe = subscribeTripSession(() => {
      calls += 1;
    });

    // Starting from the initial (already inactive) store and recording an
    // arrival while inactive are both no-ops -- neither should notify.
    noteTripArrival('ersfjordbotn');
    assert.equal(calls, 0);

    beginTripSession(T0);
    assert.equal(calls, 1);

    // A second begin while already active is also a no-op.
    beginTripSession(T0 + 60_000);
    assert.equal(calls, 1);

    unsubscribe();
  });

  test('finishTripSession() resets the store to the initial state', () => {
    beginTripSession(T0);
    noteTripArrival('ersfjordbotn');
    finishTripSession();
    assert.deepEqual(getTripSession(), INITIAL_TRIP_SESSION_STATE);
  });

  test('resetTripSessionStore() resets regardless of prior state, without requiring an active session', () => {
    beginTripSession(T0);
    noteTripArrival('ersfjordbotn');
    resetTripSessionStore();
    assert.deepEqual(getTripSession(), INITIAL_TRIP_SESSION_STATE);
  });
});

describe('privacy: TripSessionState carries no coordinates', () => {
  afterEach(() => {
    resetTripSessionStore();
  });

  test('Object.keys(getTripSession()) is exactly [active, startedAtMs, visitedSpotIds] -- no lat/lon field exists to leak', () => {
    beginTripSession(T0);
    noteTripArrival('ersfjordbotn');
    assert.deepEqual(Object.keys(getTripSession()), ['active', 'startedAtMs', 'visitedSpotIds']);
  });

  test('holds even for the initial (inactive) shape', () => {
    assert.deepEqual(Object.keys(INITIAL_TRIP_SESSION_STATE), ['active', 'startedAtMs', 'visitedSpotIds']);
  });
});
