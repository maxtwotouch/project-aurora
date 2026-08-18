import { useCallback, useRef, useState } from 'react';
import * as Location from 'expo-location';

/**
 * ON-DEVICE ONLY. This hook (and everything it calls) exists purely to
 * center the map on the user's own position, locally, for this device's
 * display. The coordinates it produces MUST NEVER be sent to a server,
 * written to analytics (see src/analytics/), logged, or persisted to
 * storage -- not even coarsened. There is no backend endpoint that accepts
 * a user coordinate, and this hook must not become the first one. See
 * CLAUDE.md's "Privacy guardrails" section: anything that touches personal
 * data needs human review before it can go beyond "kept in memory, shown on
 * this screen, discarded on unmount."
 *
 * Permission is requested lazily -- callers MUST only invoke
 * `requestLocation()` from an explicit user action (e.g. a tap on a
 * "locate me" button), never from a mount effect, so the OS prompt never
 * appears unprompted.
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

export type UseUserLocationResult = UserLocationState & {
  /** Requests foreground permission (if not already granted) and, on
   * success, reads the current position once. Safe to call repeatedly --
   * concurrent calls collapse into the in-flight one. */
  requestLocation: () => Promise<void>;
};

const INITIAL_STATE: UserLocationState = { status: 'idle', coords: null };

/**
 * Pure transition table for the permission/location request lifecycle,
 * kept separate from the hook body so it's testable without mocking
 * expo-location or React. Mirrors the outcomes `requestForegroundPermissionsAsync`
 * / `getCurrentPositionAsync` can produce.
 */
export type UserLocationEvent =
  | { type: 'REQUEST_STARTED' }
  | { type: 'PERMISSION_GRANTED'; coords: UserLocationCoords }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'REQUEST_FAILED' };

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

export function useUserLocation(): UseUserLocationResult {
  const [state, setState] = useState<UserLocationState>(INITIAL_STATE);
  const inFlight = useRef<Promise<void> | null>(null);

  const requestLocation = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    const run = async () => {
      setState((current) => userLocationReducer(current, { type: 'REQUEST_STARTED' }));
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setState((current) => userLocationReducer(current, { type: 'PERMISSION_DENIED' }));
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        setState((current) =>
          userLocationReducer(current, {
            type: 'PERMISSION_GRANTED',
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            }
          })
        );
      } catch {
        setState((current) => userLocationReducer(current, { type: 'REQUEST_FAILED' }));
      } finally {
        inFlight.current = null;
      }
    };

    const promise = run();
    inFlight.current = promise;
    return promise;
  }, []);

  return { ...state, requestLocation };
}
