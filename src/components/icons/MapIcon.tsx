import Svg, { Path } from 'react-native-svg';

import { LINE_ICON_STROKE_WIDTH, type LineIconProps } from './types';

/**
 * Map tab: a fjord-fold silhouette -- the same "place, not a generic pin"
 * language as the app icon's fjord peaks (assets/icon.svg), redrawn as a
 * single closed stroke outline instead of a filled shape so it sits at the
 * same visual weight as the rest of this line-icon set.
 */
export function MapIcon({ size, color, focused }: LineIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.5 18.5 6.8 8.8l3 5 4.4-10 3 6.6 4.3-4.4v12.5"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2.5 18.5h19"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
        opacity={focused ? 1 : 0.65}
      />
    </Svg>
  );
}
