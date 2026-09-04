import type { ViewStyle } from 'react-native';
import { palette } from './palette';

/** react-native-web outline props are not in RN's ViewStyle typings. */
type OutlineStyle = ViewStyle & { outlineWidth?: number; outlineColor?: string; outlineOffset?: number };

/** Keyboard focus ring for web Pressables (2px aurora-green outline, 2px outside the element). Apply when the Pressable state's `focused` is true. */
export const focusRing: OutlineStyle = { outlineWidth: 2, outlineColor: palette.auroraGreen, outlineOffset: 2 };
/** Same ring drawn inside the element edge — for controls whose parent clips overflow (e.g. a card header inside `overflow: 'hidden'`). */
export const focusRingInset: OutlineStyle = { outlineWidth: 2, outlineColor: palette.auroraGreen, outlineOffset: -2 };
