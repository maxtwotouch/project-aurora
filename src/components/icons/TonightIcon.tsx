import Svg, { Circle, Path } from 'react-native-svg';

import { LINE_ICON_STROKE_WIDTH, type LineIconProps } from './types';

/**
 * Tonight tab: a crescent moon over a small aurora band -- "what's the sky
 * doing right now". The crescent is drawn as a single filled path (the
 * standard two-arc subtraction trick, same technique Feather/Ionicons use
 * for their moon glyphs) rather than a stroke outline, since a stroked
 * crescent reads as two overlapping circles rather than a moon; the band
 * beneath it keeps the set's 1.7px stroke language.
 */
export function TonightIcon({ size, color, focused }: LineIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.8 4.6a7.3 7.3 0 1 0 3.9 12.9A9 9 0 0 1 15.8 4.6Z"
        fill={color}
      />
      <Path
        d="M2.5 19c1.6-1.9 3.2 1.7 4.9-.1s3.3-1.8 4.9 0s3.3 1.9 4.9 0s3.3-1.8 4.9 0"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={focused ? 1 : 0.65}
      />
      {focused ? <Circle cx={7.4} cy={9.2} r={0.9} fill={color} opacity={0.6} /> : null}
    </Svg>
  );
}
