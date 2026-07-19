import Svg, { Path } from 'react-native-svg';

import { LINE_ICON_STROKE_WIDTH, type LineIconProps } from './types';

/**
 * Spots tab: three small peak-marked rows -- "a list of places", each row
 * lead by the same tiny peak notch rather than a generic bullet, tying it
 * back to the map/fjord vocabulary used elsewhere in the set.
 */
export function SpotsIcon({ size, color, focused }: LineIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.6 7.4 4.4 4.6 6.2 7.4h4.7"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2.6 13 4.4 10.2 6.2 13h4.7"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={focused ? 1 : 0.85}
      />
      <Path
        d="M2.6 18.6 4.4 15.8 6.2 18.6h4.7"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={focused ? 1 : 0.65}
      />
      <Path d="M14 7.4h7.4M14 13h7.4M14 18.6h7.4" stroke={color} strokeWidth={LINE_ICON_STROKE_WIDTH} strokeLinecap="round" />
    </Svg>
  );
}
