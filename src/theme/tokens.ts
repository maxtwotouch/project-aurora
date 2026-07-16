import { Easing } from 'react-native';

/**
 * Spacing scale, 4pt base. Named by relationship (xs/sm/md...), not by
 * value, so intent survives if a step is retuned later.
 */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
  xxxl: 56
} as const;

/**
 * Radius tiers. Three working sizes plus a pill -- not a different radius
 * per component. Chips/pills always use `pill`; panels use `lg`/`xl`;
 * small inline controls use `sm`.
 */
export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  pill: 999
} as const;

/**
 * Elevation via shadow, used sparingly (the hero recommendation surface
 * and floating map sheets). Subtle by design -- if it reads as a strong
 * drop shadow it is tuned wrong.
 */
export const elevation = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.26,
    shadowRadius: 26,
    elevation: 8
  }
} as const;

/** Motion tokens: transform/opacity only, exponential ease-out for entrances. */
export const motion = {
  duration: {
    fast: 140,
    base: 260,
    slow: 420,
    enter: 560
  },
  easing: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.65, 0, 0.35, 1)
  }
} as const;

/**
 * react-native-web's Pressable augments the official `{ pressed }` state
 * callback with `hovered`/`focused` at runtime (used for web hover/focus
 * styling). React Native's own type definitions only know about `pressed`,
 * so every Pressable `style` callback across the app types its state
 * parameter with this shared shape instead of an inline `: any` cast.
 */
export type WebPressableState = {
  pressed: boolean;
  hovered?: boolean;
  focused?: boolean;
};
