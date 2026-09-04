import { useEffect, useState } from 'react';

import { getStoredItem, setStoredItem } from '../lib/storage';
import { resolveLoadedTourismConsentState } from './core';
import type { TourismConsentState } from './core';

/**
 * Opt-in consent for tourism-insights collection (see
 * docs/design-trip-tracking.md and docs/analytics-pivot.md section 3's
 * amendment) -- a SECOND, INDEPENDENT consent dimension from the anonymous
 * usage-events consent in ./consent.ts. Deliberately its own module with its
 * own storage key and module-level state so it can never be accidentally
 * read from, written to, or defaulted from any other consent dimension:
 *
 * - Storage key: 'aurora.tourismConsent.v1' (usage consent uses
 *   'aurora.analyticsConsent.v1', personal analytics uses
 *   'aurora.personalAnalyticsConsent.v1' -- never shared).
 * - Default: 'unset' (off), same fail-closed rule as the other dimensions --
 *   'unset' behaves like 'declined' everywhere this is gated.
 * - Asked once, at first launch, on NATIVE ONLY (ConsentGate) -- on web this
 *   step is skipped and the store is simply left 'unset', so nothing is
 *   collected on web. Also surfaced afterwards as a Settings-only toggle
 *   (TourismConsentToggle) for changing the choice later.
 *
 * WHAT THIS GATES: this consent alone decides whether location-derived
 * tourism/presence events may ever be TRANSMITTED (src/trip/tripEventGate.ts
 * / src/trip/tripEventClient.ts). It is entirely independent of Trip Mode
 * (src/trip/tripSession.ts), which is a product feature's session
 * lifecycle, not a consent: starting or ending a Trip Mode session neither
 * grants nor requires this consent, and never bypasses it -- an active trip
 * session can keep the presence engine SAMPLING locally for the feature's
 * own sake (nearby spots, "visited this trip") even while this consent is
 * off, but nothing is ever sent while it is off.
 *
 * WHY THE OLD KEY IS NOT MIGRATED: the previous 'aurora.tripModeConsent.v1'
 * key modeled a narrower question ("collect while Trip mode is on"). This
 * dimension's collection window is broader ("whenever the app is open"), a
 * genuine scope expansion -- so per CLAUDE.md's "re-consent when scope
 * expands", everyone is re-asked under this new key rather than having a
 * prior Trip-mode acceptance silently carried over to a wider collection
 * window they never agreed to.
 */
export type { TourismConsentState };

const STORAGE_KEY = 'aurora.tourismConsent.v1';

type Listener = (state: TourismConsentState) => void;

let currentState: TourismConsentState = 'unset';
let loaded = false;
let loadPromise: Promise<TourismConsentState> | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(currentState);
}

/**
 * Reads the persisted tourism-insights choice once. Safe to call multiple
 * times -- callers share the same in-flight read rather than hitting
 * storage repeatedly. Kicked off eagerly below (module load), independently
 * of (and no earlier or later than) the other consent dimensions' loads.
 */
export function loadTourismConsent(): Promise<TourismConsentState> {
  if (loaded) return Promise.resolve(currentState);
  if (loadPromise) return loadPromise;

  loadPromise = getStoredItem(STORAGE_KEY)
    .then((stored) => {
      currentState = resolveLoadedTourismConsentState(stored);
      loaded = true;
      notify();
      return currentState;
    })
    .catch(() => {
      currentState = resolveLoadedTourismConsentState(null);
      loaded = true;
      notify();
      return currentState;
    });

  return loadPromise;
}

export function getTourismConsent(): TourismConsentState {
  return currentState;
}

export function isTourismConsentLoaded(): boolean {
  return loaded;
}

/**
 * Persists an explicit tourism-insights choice. Never touches any other
 * consent dimension's storage key or in-memory state -- see the module
 * header.
 */
export async function setTourismConsent(next: 'accepted' | 'declined'): Promise<void> {
  currentState = next;
  loaded = true;
  notify();
  await setStoredItem(STORAGE_KEY, next);
}

export function subscribeTourismConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Kick off the storage read as soon as this module is imported, same
// pattern as consent.ts / personalAnalyticsConsent.ts -- but this is a fully
// separate read from a separate key, not a shared load.
void loadTourismConsent();

export type UseTourismConsentResult = {
  state: TourismConsentState;
  /** False until the persisted choice has been read at least once. */
  loaded: boolean;
  accept: () => void;
  decline: () => void;
};

export function useTourismConsent(): UseTourismConsentResult {
  const [state, setState] = useState<TourismConsentState>(getTourismConsent());
  const [ready, setReady] = useState<boolean>(isTourismConsentLoaded());

  useEffect(() => {
    let cancelled = false;

    void loadTourismConsent().then(() => {
      if (!cancelled) setReady(true);
    });

    const unsubscribe = subscribeTourismConsent((next) => {
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
      void setTourismConsent('accepted');
    },
    decline: () => {
      void setTourismConsent('declined');
    }
  };
}
