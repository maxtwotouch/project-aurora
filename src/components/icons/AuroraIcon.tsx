import Svg, { Path } from 'react-native-svg';

import { LINE_ICON_STROKE_WIDTH, type LineIconProps } from './types';

/**
 * Aurora tab: the band itself, alone -- the same ribbon curve as the app
 * icon's aurora stroke (assets/icon.svg), just this tab's whole subject
 * rather than one element of a larger scene, so it is drawn a touch bolder
 * than the rest of the set's 1.7px lines.
 */
export function AuroraIcon({ size, color, focused }: LineIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 15.5c2.6-4.8 3.9 4.2 6.4-0.6s3.9-4.2 6.4 0.6s3.8 4.4 6.4-0.6"
        stroke={color}
        strokeWidth={focused ? 2.4 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4.4 9.4c2.1-3.5 3.1 3 5.1-0.4s3.1-3.4 5.1 0.4s3 3.1 5.1-0.4"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />
    </Svg>
  );
}
