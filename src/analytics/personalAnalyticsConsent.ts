import { useEffect, useState } from 'react';

import { getStoredItem, setStoredItem } from '../lib/storage';
import { resolveLoadedPersonalAnalyticsConsentState } from './core';
import type { PersonalAnalyticsConsentState } from './core';

/**
 * Opt-in consent for person-level product analytics (docs/analytics-pivot.md,
 * PR 2) -- a THIRD, INDEPENDENT consent dimension from both the aggregate
 * usage-events consent in ./consent.ts and the tourism-insights consent in
 * ./tourismConsent.ts. Deliberately its own module with its own storage key
 * and module-level state so it can never be accidentally read from, written
 * to, or defaulted from either of the other two:
 *
 * - Storage key: 'aurora.personalAnalyticsConsent.v1' (usage consent uses
 *   'aurora.analyticsConsent.v1', tourism insights uses
 *   'aurora.tourismConsent.v1' -- never shared).
 * - Default: 'unset' for every install, including people who already
 *   answered the aggregate usage-counter question -- this is what
 *   implements re-consent for the new scope (docs/analytics-pivot.md
 *   section 2.2). Same fail-closed rule as the other two dimensions:
 *   'unset' behaves like 'declined' everywhere this would be gated.
 * - Surfaced twice: as a second, separately-actioned question in the
 *   first-open consent flow (see ConsentGate/ConsentModal) -- shown once
 *   the aggregate usage-counter question has been answered, whenever this
 *   dimension is still 'unset', including for returning users -- and as a
 *   Settings-only toggle (PersonalAnalyticsToggle) for changing the choice
 *   afterwards.
 *
 * This module only models the consent CHOICE. No SDK, no network calls, and
 * no event emission exist yet -- those are a later, separately reviewed PR
 * (docs/analytics-pivot.md section 4, PR 3) that hard-gates SDK
 * initialization on this consent being exactly 'accepted'.
 */
export type { PersonalAnalyticsConsentState };

const STORAGE_KEY = 'aurora.personalAnalyticsConsent.v1';

type Listener = (state: PersonalAnalyticsConsentState) => void;

let currentState: PersonalAnalyticsConsentState = 'unset';
let loaded = false;
let loadPromise: Promise<PersonalAnalyticsConsentState> | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(currentState);
}

/**
 * Reads the persisted personal-analytics choice once. Safe to call multiple
 * times -- callers share the same in-flight read rather than hitting
 * storage repeatedly. Kicked off eagerly below (module load), independently
 * of (and no earlier or later than) the usage-consent and trip-mode-consent
 * loads in their own modules.
 */
export function loadPersonalAnalyticsConsent(): Promise<PersonalAnalyticsConsentState> {
  if (loaded) return Promise.resolve(currentState);
  if (loadPromise) return loadPromise;

  loadPromise = getStoredItem(STORAGE_KEY)
    .then((stored) => {
      currentState = resolveLoadedPersonalAnalyticsConsentState(stored);
      loaded = true;
      notify();
      return currentState;
    })
    .catch(() => {
      currentState = resolveLoadedPersonalAnalyticsConsentState(null);
      loaded = true;
      notify();
      return currentState;
    });

  return loadPromise;
}

export function getPersonalAnalyticsConsent(): PersonalAnalyticsConsentState {
  return currentState;
}

export function isPersonalAnalyticsConsentLoaded(): boolean {
  return loaded;
}

/**
 * Persists an explicit personal-analytics choice. Never touches the usage
 * consent's or trip-mode consent's storage key or in-memory state -- see
 * the module header.
 */
export async function setPersonalAnalyticsConsent(next: 'accepted' | 'declined'): Promise<void> {
  currentState = next;
  loaded = true;
  notify();
  await setStoredItem(STORAGE_KEY, next);
}

export function subscribePersonalAnalyticsConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Kick off the storage read as soon as this module is imported, same
// pattern as consent.ts / tourismConsent.ts -- but this is a fully
// separate read from a separate key, not a shared load.
void loadPersonalAnalyticsConsent();

export type UsePersonalAnalyticsConsentResult = {
  state: PersonalAnalyticsConsentState;
  /** False until the persisted choice has been read at least once. */
  loaded: boolean;
  accept: () => void;
  decline: () => void;
};

export function usePersonalAnalyticsConsent(): UsePersonalAnalyticsConsentResult {
  const [state, setState] = useState<PersonalAnalyticsConsentState>(getPersonalAnalyticsConsent());
  const [ready, setReady] = useState<boolean>(isPersonalAnalyticsConsentLoaded());

  useEffect(() => {
    let cancelled = false;

    void loadPersonalAnalyticsConsent().then(() => {
      if (!cancelled) setReady(true);
    });

    const unsubscribe = subscribePersonalAnalyticsConsent((next) => {
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
      void setPersonalAnalyticsConsent('accepted');
    },
    decline: () => {
      void setPersonalAnalyticsConsent('declined');
    }
  };
}
