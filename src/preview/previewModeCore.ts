/**
 * Framework-free preview-mode state: no React, no RN, no storage import --
 * deliberately mirrors src/analytics/core.ts's split from consent.ts, so
 * this file (and anything that only needs synchronous state/subscription,
 * like useForecast.ts) never pulls 'react-native' into its module graph.
 * That matters beyond tidiness: test/scoring.test.ts imports
 * src/hooks/useForecast.ts directly under plain Node (via tsx), and
 * 'react-native's own entry point cannot be parsed there -- any module
 * useForecast.ts statically imports must stay on this framework-free side
 * of the split. The persistence-backed wrapper (read/write AsyncStorage,
 * the `usePreviewMode()` hook) lives in ./previewMode.ts instead, imported
 * only by RN screens/components that already depend on RN anyway.
 */

export type PreviewModeListener = (enabled: boolean) => void;

let currentEnabled = false;
let loaded = false;
const listeners = new Set<PreviewModeListener>();

function notify(): void {
  for (const listener of listeners) listener(currentEnabled);
}

export function getPreviewModeState(): boolean {
  return currentEnabled;
}

export function isPreviewModeStateLoaded(): boolean {
  return loaded;
}

/** Called once persistence has resolved (see previewMode.ts's loadPreviewMode). */
export function markPreviewModeLoaded(initial: boolean): void {
  currentEnabled = initial;
  loaded = true;
  notify();
}

/** Explicit user choice -- always counts as "loaded" too. */
export function setPreviewModeState(next: boolean): void {
  currentEnabled = next;
  loaded = true;
  notify();
}

export function subscribePreviewModeState(listener: PreviewModeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
