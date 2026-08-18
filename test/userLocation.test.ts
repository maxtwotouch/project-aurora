// Tests for the pure permission/location state machine in
// src/hooks/userLocationReducer.ts -- no `expo-location` or `react-native`
// import anywhere in this file's dependency graph, so it runs the same way
// under plain node:test as alertsClient.test.ts / expoGoDetection.test.ts.
// See userLocationReducer.ts's own header for why this split exists and the
// on-device-only constraint it (and useUserLocation.ts) must never violate.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_USER_LOCATION_STATE,
  userLocationReducer
} from '../src/hooks/userLocationReducer.js';
import type { UserLocationState } from '../src/hooks/userLocationReducer.js';

const COORDS = { latitude: 69.6489, longitude: 18.9551 };

describe('userLocationReducer: initial state', () => {
  test('starts idle with no coords', () => {
    assert.deepEqual(INITIAL_USER_LOCATION_STATE, { status: 'idle', coords: null });
  });
});

describe('userLocationReducer: happy path', () => {
  test('idle -> requesting on REQUEST_STARTED', () => {
    const next = userLocationReducer(INITIAL_USER_LOCATION_STATE, { type: 'REQUEST_STARTED' });
    assert.deepEqual(next, { status: 'requesting', coords: null });
  });

  test('requesting -> granted on PERMISSION_GRANTED, carrying the coords', () => {
    const requesting: UserLocationState = { status: 'requesting', coords: null };
    const next = userLocationReducer(requesting, { type: 'PERMISSION_GRANTED', coords: COORDS });
    assert.deepEqual(next, { status: 'granted', coords: COORDS });
  });
});

describe('userLocationReducer: denial and failure paths', () => {
  test('requesting -> denied on PERMISSION_DENIED, coords cleared', () => {
    const requesting: UserLocationState = { status: 'requesting', coords: null };
    const next = userLocationReducer(requesting, { type: 'PERMISSION_DENIED' });
    assert.deepEqual(next, { status: 'denied', coords: null });
  });

  test('requesting -> unavailable on REQUEST_FAILED (e.g. GPS fix failed after permission was granted)', () => {
    const requesting: UserLocationState = { status: 'requesting', coords: null };
    const next = userLocationReducer(requesting, { type: 'REQUEST_FAILED' });
    assert.deepEqual(next, { status: 'unavailable', coords: null });
  });

  // A prior grant's coords must never leak into a later denial/failure --
  // regressing this would mean a stale position could keep being shown (or
  // recentered on) after the user has since said no / lost a fix.
  test('a denial from a previously-granted state still clears coords', () => {
    const granted: UserLocationState = { status: 'granted', coords: COORDS };
    const next = userLocationReducer(granted, { type: 'PERMISSION_DENIED' });
    assert.deepEqual(next, { status: 'denied', coords: null });
  });
});

describe('userLocationReducer: retry is always allowed', () => {
  // REQUEST_STARTED is unconditional on the current status -- see the
  // reducer's own header comment. Tapping "locate me" again after a denial
  // or a failed fix must be able to move the state machine straight back to
  // 'requesting', not get stuck.
  test('denied -> requesting on a retried REQUEST_STARTED', () => {
    const denied: UserLocationState = { status: 'denied', coords: null };
    const next = userLocationReducer(denied, { type: 'REQUEST_STARTED' });
    assert.deepEqual(next, { status: 'requesting', coords: null });
  });

  test('unavailable -> requesting on a retried REQUEST_STARTED', () => {
    const unavailable: UserLocationState = { status: 'unavailable', coords: null };
    const next = userLocationReducer(unavailable, { type: 'REQUEST_STARTED' });
    assert.deepEqual(next, { status: 'requesting', coords: null });
  });

  test('granted -> requesting on a retried REQUEST_STARTED (re-centering discards the old fix while the new one loads)', () => {
    const granted: UserLocationState = { status: 'granted', coords: COORDS };
    const next = userLocationReducer(granted, { type: 'REQUEST_STARTED' });
    assert.deepEqual(next, { status: 'requesting', coords: null });
  });
});

// NOTE: de-duping concurrent taps (so two overlapping requestLocation()
// calls while one is already in flight collapse into a single native
// permission/position request) is NOT modeled in this reducer -- it's
// handled by useUserLocation.ts's own `inFlight` ref, which short-circuits
// before ever dispatching a second REQUEST_STARTED. That ref is React-hook
// state, not a pure value, so it isn't covered here; this reducer's own
// contract is simply that REQUEST_STARTED always resets to a clean
// 'requesting' state, which the tests above cover directly.
