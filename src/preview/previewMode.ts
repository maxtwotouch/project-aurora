import { useEffect, useState } from 'react';

import { getStoredItem, setStoredItem } from '../lib/storage';
import {
  getPreviewModeState,
  isPreviewModeStateLoaded,
  markPreviewModeLoaded,
  setPreviewModeState,
  subscribePreviewModeState
} from './previewModeCore';

/**
 * Design-preview toggle (Settings > "Design preview (sample data)").
 *
 * Thin persistence-backed wrapper around ./previewModeCore.ts's
 * framework-free state -- same subscribe/get/set + persistence shape as
 * src/analytics/consent.ts and src/i18n/index.ts's language persistence, a
 * module-level store backed by the shared lib/storage key/value wrapper, so
 * every subscriber (the Settings toggle, the honesty-guard banner)
 * re-renders the instant the choice flips, with no prop drilling.
 *
 * src/hooks/useForecast.ts deliberately does NOT import this file -- it
 * reads previewModeCore.ts's synchronous state directly instead, so it
 * never pulls 'react-native' (via lib/storage) into its own module graph.
 * See previewModeCore.ts's header comment for why that split exists.
 *
 * When ON, useForecast.ts skips fetching live data entirely and returns
 * src/data/sampleForecast.ts's deterministic snapshot instead -- there is
 * no live-data path to accidentally leak through while this is enabled.
 */

const STORAGE_KEY = 'aurora.designPreviewMode.v1';

let loadPromise: Promise<boolean> | null = null;

/**
 * Reads the persisted choice once. Safe to call repeatedly -- callers share
 * the same in-flight read. Kicked off eagerly below (module load), mirroring
 * analytics/consent.ts's `void loadConsent()` pattern.
 */
export function loadPreviewMode(): Promise<boolean> {
  if (isPreviewModeStateLoaded()) return Promise.resolve(getPreviewModeState());
  if (loadPromise) return loadPromise;

  loadPromise = getStoredItem(STORAGE_KEY)
    .then((stored) => {
      markPreviewModeLoaded(stored === 'on');
      return getPreviewModeState();
    })
    .catch(() => {
      markPreviewModeLoaded(false);
      return getPreviewModeState();
    });

  return loadPromise;
}

export function isPreviewModeOn(): boolean {
  return getPreviewModeState();
}

export function isPreviewModeLoaded(): boolean {
  return isPreviewModeStateLoaded();
}

export async function setPreviewMode(next: boolean): Promise<void> {
  setPreviewModeState(next);
  await setStoredItem(STORAGE_KEY, next ? 'on' : 'off');
}

export const subscribePreviewMode = subscribePreviewModeState;

// Kick off the persisted-choice read as soon as this module is imported,
// same rationale as consent.ts / i18n/index.ts: keeps the "off until proven
// otherwise" gap as small as possible for a returning user who had preview
// mode on. Imported from App.tsx / App.web.tsx at startup (via
// PreviewModeBanner / SettingsScreen), same as consent.ts.
void loadPreviewMode();

export type UsePreviewModeResult = {
  enabled: boolean;
  /** False until the persisted choice has been read at least once. */
  loaded: boolean;
  setEnabled: (next: boolean) => void;
};

export function usePreviewMode(): UsePreviewModeResult {
  const [enabled, setEnabledState] = useState<boolean>(getPreviewModeState());
  const [ready, setReady] = useState<boolean>(isPreviewModeStateLoaded());

  useEffect(() => {
    let cancelled = false;

    void loadPreviewMode().then(() => {
      if (!cancelled) setReady(true);
    });

    const unsubscribe = subscribePreviewModeState((next) => {
      if (!cancelled) setEnabledState(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    enabled,
    loaded: ready,
    setEnabled: (next: boolean) => {
      void setPreviewMode(next);
    }
  };
}
