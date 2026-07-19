import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Cross-platform `prefers-reduced-motion`. On web this reads the media
 * query directly; on native it mirrors the OS "reduce motion" accessibility
 * setting. Consumers should fall back to opacity-only fades (no translate)
 * and near-zero durations when this is true.
 *
 * Copied into the design system (rather than imported from an app's own
 * `src/hooks/`) so components in ./components use it self-contained — a
 * sibling app gets this for free with the rest of the folder. The host
 * app's own copy of this hook (if it has one, for its own screens'
 * entrance choreography) can stay separate; there's no requirement to
 * unify them, only that ./components/ArcGauge.tsx doesn't reach outside
 * this folder for it.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return undefined;
      }

      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReduced(query.matches);

      const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
      query.addEventListener?.('change', listener);
      return () => query.removeEventListener?.('change', listener);
    }

    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value: boolean) => {
      if (mounted) setReduced(value);
    });

    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}
