/**
 * Pure permission/location request state machine, split out of
 * useUserLocation.ts so it is unit-testable without any native module
 * involved (no `expo-location`, no `react-native`) -- same "split the pure
 * decision logic from the I/O" pattern as
 * src/notifications/expoGoDetection.ts and src/notifications/alertsClient.ts.
 *
 * ON-DEVICE ONLY (see useUserLocation.ts's header for the full statement):
 * this file only ever moves opaque coordinates through in-memory state
 * transitions -- it must never gain a branch that sends, logs, or persists
 * them anywhere.
 */

export type UserLocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

export type UserLocationCoords = {
  latitude: number;
  longitude: number;
};

export type UserLocationState = {
  status: UserLocationStatus;
  coords: UserLocationCoords | null;
};

export const INITIAL_USER_LOCATION_STATE: UserLocationState = { status: 'idle', coords: null };

export type UserLocationEvent =
  | { type: 'REQUEST_STARTED' }
  | { type: 'PERMISSION_GRANTED'; coords: UserLocationCoords }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'REQUEST_FAILED' };

/**
 * Transition table for the permission/location request lifecycle.
 * Deliberately unconditional on the *current* status -- REQUEST_STARTED
 * always moves to 'requesting' regardless of whether the previous attempt
 * ended in 'denied' or 'unavailable', so retrying (e.g. tapping the locate
 * button again after a failed fix) is always allowed. Dedupe of concurrent
 * in-flight requests is handled by the caller (useUserLocation.ts's
 * `inFlight` ref), not by this reducer.
 */
export function userLocationReducer(state: UserLocationState, event: UserLocationEvent): UserLocationState {
  switch (event.type) {
    case 'REQUEST_STARTED':
      return { status: 'requesting', coords: null };
    case 'PERMISSION_GRANTED':
      return { status: 'granted', coords: event.coords };
    case 'PERMISSION_DENIED':
      return { status: 'denied', coords: null };
    case 'REQUEST_FAILED':
      return { status: 'unavailable', coords: null };
    default:
      return state;
  }
}
