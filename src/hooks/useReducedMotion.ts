import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Cross-platform `prefers-reduced-motion`. On web this reads the media
 * query directly; on native it mirrors the OS "reduce motion" accessibility
 * setting. Consumers should fall back to opacity-only fades (no translate)
 * and near-zero durations when this is true.
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
