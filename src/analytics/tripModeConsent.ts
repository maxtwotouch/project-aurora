import { useEffect, useState } from 'react';

import { getStoredItem, setStoredItem } from '../lib/storage';
import { resolveLoadedTripModeConsentState } from './core';
import type { TripModeConsentState } from './core';

/**
 * Opt-in consent for Trip mode (see docs/design-trip-tracking.md) -- a
 * SECOND, INDEPENDENT consent dimension from the anonymous usage-events
 * consent in ./consent.ts. Deliberately its own module with its own
 * storage key and module-level state so it can never be accidentally read
 * from, written to, or defaulted from the usage-events consent:
 *
 * - Storage key: 'aurora.tripModeConsent.v1' (usage consent uses
 *   'aurora.analyticsConsent.v1' -- see consent.ts -- never shared).
 * - Default: 'unset' (off), same fail-closed rule as usage consent --
 *   'unset' behaves like 'declined' everywhere this is gated.
 * - Surfaced only in Settings (TripModeConsentToggle), never in the
 *   first-open ConsentModal -- Trip mode is opt-in at the point of
 *   relevance, not at first launch.
 *
 * This module only models the consent CHOICE. No geofencing, location
 * access, or event emission exists yet -- those are a later, separately
 * reviewed PR per docs/design-trip-tracking.md's ship gates.
 */
export type { TripModeConsentState };

const STORAGE_KEY = 'aurora.tripModeConsent.v1';

type Listener = (state: TripModeConsentState) => void;

let currentState: TripModeConsentState = 'unset';
let loaded = false;
let loadPromise: Promise<TripModeConsentState> | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(currentState);
}

/**
 * Reads the persisted trip-mode choice once. Safe to call multiple times --
 * callers share the same in-flight read rather than hitting storage
 * repeatedly. Kicked off eagerly below (module load), independently of
 * (and no earlier or later than) the usage-consent load in consent.ts.
 */
export function loadTripModeConsent(): Promise<TripModeConsentState> {
  if (loaded) return Promise.resolve(currentState);
  if (loadPromise) return loadPromise;

  loadPromise = getStoredItem(STORAGE_KEY)
    .then((stored) => {
      currentState = resolveLoadedTripModeConsentState(stored);
      loaded = true;
      notify();
      return currentState;
    })
    .catch(() => {
      currentState = resolveLoadedTripModeConsentState(null);
      loaded = true;
      notify();
      return currentState;
    });

  return loadPromise;
}

export function getTripModeConsent(): TripModeConsentState {
  return currentState;
}

export function isTripModeConsentLoaded(): boolean {
  return loaded;
}

/**
 * Persists an explicit trip-mode choice. Never touches the usage-events
 * consent's storage key or in-memory state -- see the module header.
 */
export async function setTripModeConsent(next: 'accepted' | 'declined'): Promise<void> {
  currentState = next;
  loaded = true;
  notify();
  await setStoredItem(STORAGE_KEY, next);
}

export function subscribeTripModeConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Kick off the storage read as soon as this module is imported, same
// pattern as consent.ts -- but this is a fully separate read from a
// separate key, not a shared load.
void loadTripModeConsent();

export type UseTripModeConsentResult = {
  state: TripModeConsentState;
  /** False until the persisted choice has been read at least once. */
  loaded: boolean;
  accept: () => void;
  decline: () => void;
};

export function useTripModeConsent(): UseTripModeConsentResult {
  const [state, setState] = useState<TripModeConsentState>(getTripModeConsent());
  const [ready, setReady] = useState<boolean>(isTripModeConsentLoaded());

  useEffect(() => {
    let cancelled = false;

    void loadTripModeConsent().then(() => {
      if (!cancelled) setReady(true);
    });

    const unsubscribe = subscribeTripModeConsent((next) => {
      if (!cancelled) setState(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    state,
    loaded: ready,
    accept: () => {
      void setTripModeConsent('accepted');
    },
    decline: () => {
      void setTripModeConsent('declined');
    }
  };
}
