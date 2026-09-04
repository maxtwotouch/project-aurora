/**
 * Trip Mode's PRODUCT state -- the explicit Start / End lifecycle of the
 * user-facing, location-aware feature (docs/decision-tourism-baseline.md).
 *
 * This is deliberately NOT a consent and NOT a collection gate:
 *   - Whether location-derived tourism events may be TRANSMITTED is decided
 *     solely by the tourism-insights consent (src/analytics/tourismConsent.ts
 *     via src/trip/tripEventGate.ts). An active trip session never opens
 *     that gate, and an inactive one never closes it.
 *   - What a session DOES change is whether the presence engine is allowed
 *     to sample location for the feature's own sake (nearby spots, "visited
 *     this trip"), even when tourism consent is off -- see
 *     src/hooks/useTripPresence.ts's `shouldRun()` condition.
 *
 * PRIVACY: in-memory only, never persisted, never transmitted. The visited
 * list holds spot ids (never coordinates) and is discarded the moment the
 * session ends or the app process dies. There is no server-side trip
 * history, by design (CLAUDE.md, "no location history").
 *
 * The reducer half is pure (no react-native import) so it is directly
 * unit-testable; the store half is the same tiny subscribe/notify pattern
 * the consent stores use.
 */

import { useEffect, useState } from 'react';

export type TripSessionState = {
  active: boolean;
  /** Wall-clock ms when the current session started; null while inactive. */
  startedAtMs: number | null;
  /** Spot ids arrived at during THIS session, in arrival order, de-duplicated. */
  visitedSpotIds: readonly string[];
};

export const INITIAL_TRIP_SESSION_STATE: TripSessionState = {
  active: false,
  startedAtMs: null,
  visitedSpotIds: []
};

/** Pure: begin a session (idempotent -- a second start keeps the original startedAtMs and visits). */
export function startTripSession(state: TripSessionState, nowMs: number): TripSessionState {
  if (state.active) return state;
  return { active: true, startedAtMs: nowMs, visitedSpotIds: [] };
}

/** Pure: end a session, discarding the visited list. */
export function endTripSession(state: TripSessionState): TripSessionState {
  if (!state.active) return state;
  return INITIAL_TRIP_SESSION_STATE;
}

/** Pure: record an arrival at a spot. No-op while inactive or if already listed. */
export function recordTripArrival(state: TripSessionState, spotId: string): TripSessionState {
  if (!state.active) return state;
  if (state.visitedSpotIds.includes(spotId)) return state;
  return { ...state, visitedSpotIds: [...state.visitedSpotIds, spotId] };
}

// ---------------------------------------------------------------------------
// Module-level store (in-memory only).
// ---------------------------------------------------------------------------

type Listener = (state: TripSessionState) => void;

let current: TripSessionState = INITIAL_TRIP_SESSION_STATE;
const listeners = new Set<Listener>();

function commit(next: TripSessionState): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener(current);
}

export function getTripSession(): TripSessionState {
  return current;
}

export function isTripSessionActive(): boolean {
  return current.active;
}

export function beginTripSession(nowMs: number = Date.now()): void {
  commit(startTripSession(current, nowMs));
}

export function finishTripSession(): void {
  commit(endTripSession(current));
}

export function noteTripArrival(spotId: string): void {
  commit(recordTripArrival(current, spotId));
}

export function subscribeTripSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset (mirrors attributionStore's resetAttributionStore). */
export function resetTripSessionStore(): void {
  commit(INITIAL_TRIP_SESSION_STATE);
}

export function useTripSession(): TripSessionState {
  const [state, setState] = useState<TripSessionState>(getTripSession());

  useEffect(() => {
    setState(getTripSession());
    return subscribeTripSession(setState);
  }, []);

  return state;
}
