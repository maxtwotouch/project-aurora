import { useCallback, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { INITIAL_USER_LOCATION_STATE, userLocationReducer } from './userLocationReducer';
import type { UserLocationState } from './userLocationReducer';

export type { UserLocationCoords, UserLocationEvent, UserLocationState, UserLocationStatus } from './userLocationReducer';

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
 *
 * The pure status/coords transition table lives in ./userLocationReducer.ts
 * (no expo-location/react-native import there), so it's covered by
 * test/userLocation.test.ts without any native module involved -- this file
 * is the thin I/O wrapper around it, mirroring src/notifications/
 * alertsService.ts's split around alertsClient.ts.
 */

export type UseUserLocationResult = UserLocationState & {
  /** Requests foreground permission (if not already granted) and, on
   * success, reads the current position once. Safe to call repeatedly --
   * concurrent calls collapse into the in-flight one, and a retry from
   * 'denied' or 'unavailable' is always allowed (see userLocationReducer's
   * REQUEST_STARTED transition). */
  requestLocation: () => Promise<void>;
};

export function useUserLocation(): UseUserLocationResult {
  const [state, setState] = useState<UserLocationState>(INITIAL_USER_LOCATION_STATE);
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
