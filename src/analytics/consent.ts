import { useEffect, useState } from 'react';

import { getStoredItem, setStoredItem } from '../lib/storage';
import { resolveLoadedConsentState } from './core';
import type { ConsentState } from './core';

/**
 * Opt-in consent for anonymous usage instrumentation (see events.ts).
 *
 * PRIVACY INVARIANT: 'unset' is the only default, and it is treated the
 * same as 'declined' everywhere events are gated -- nothing is ever sent
 * unless this is exactly 'accepted'. Decline is a first-class, permanent
 * choice: it persists the same way accept does, and is never re-prompted
 * automatically.
 *
 * This module is a thin RN-bound wrapper: the actual state-resolution logic
 * (what 'unset'/'accepted'/'declined' a persisted value maps to) lives in
 * the framework-free ./core.ts, so it can be unit-tested directly under
 * plain Node -- see test/analytics-core.test.ts at the repo root.
 */
export type { ConsentState };

const STORAGE_KEY = 'aurora.analyticsConsent.v1';

type Listener = (state: ConsentState) => void;

let currentState: ConsentState = 'unset';
let loaded = false;
let loadPromise: Promise<ConsentState> | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(currentState);
}

/**
 * Reads the persisted choice once. Safe to call multiple times -- callers
 * share the same in-flight read rather than hitting storage repeatedly.
 * Kicked off eagerly below (module load) so consent is very likely already
 * resolved by the time any screen deep in the app tries to gate on it.
 */
export function loadConsent(): Promise<ConsentState> {
  if (loaded) return Promise.resolve(currentState);
  if (loadPromise) return loadPromise;

  loadPromise = getStoredItem(STORAGE_KEY)
    .then((stored) => {
      currentState = resolveLoadedConsentState(stored);
      loaded = true;
      notify();
      return currentState;
    })
    .catch(() => {
      currentState = resolveLoadedConsentState(null);
      loaded = true;
      notify();
      return currentState;
    });

  return loadPromise;
}

export function getConsent(): ConsentState {
  return currentState;
}

export function isConsentLoaded(): boolean {
  return loaded;
}

/**
 * Persists an explicit user choice. Both directions (accept -> decline,
 * decline -> accept) are supported so the later "change your mind" toggle
 * can flip it back and forth; 'unset' is never written back once a real
 * choice has been made.
 */
export async function setConsent(next: 'accepted' | 'declined'): Promise<void> {
  currentState = next;
  loaded = true;
  notify();
  await setStoredItem(STORAGE_KEY, next);
}

export function subscribeConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Kick off the storage read as soon as this module is imported (from
// App.tsx / App.web.tsx at startup), rather than waiting for the first
// component to mount and ask. This keeps the "unset until proven
// otherwise" gap as small as possible for returning users who already
// made a choice.
void loadConsent();

export type UseConsentResult = {
  state: ConsentState;
  /** False until the persisted choice has been read at least once. */
  loaded: boolean;
  accept: () => void;
  decline: () => void;
};

export function useConsent(): UseConsentResult {
  const [state, setState] = useState<ConsentState>(getConsent());
  const [ready, setReady] = useState<boolean>(isConsentLoaded());

  useEffect(() => {
    let cancelled = false;

    void loadConsent().then(() => {
      if (!cancelled) setReady(true);
    });

    const unsubscribe = subscribeConsent((next) => {
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
      void setConsent('accepted');
    },
    decline: () => {
      void setConsent('declined');
    }
  };
}
