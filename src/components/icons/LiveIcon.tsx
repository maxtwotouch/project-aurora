import Svg, { Circle, Path } from 'react-native-svg';

import { LINE_ICON_STROKE_WIDTH, type LineIconProps } from './types';

/**
 * Live tab: a small stroked camera body + lens -- the live all-sky camera
 * feeds. Kept as plain outline (no viewfinder flash/bolt flourishes) so it
 * reads at 20-24px without turning into a smudge.
 */
export function LiveIcon({ size, color, focused }: LineIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.2 7.6c0-.9.7-1.6 1.6-1.6h2l1.3-1.7h5.8l1.3 1.7h2c.9 0 1.6.7 1.6 1.6v9.3c0 .9-.7 1.6-1.6 1.6H4.8c-.9 0-1.6-.7-1.6-1.6Z"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12.6} r={3.4} stroke={color} strokeWidth={LINE_ICON_STROKE_WIDTH} />
      {focused ? <Circle cx={12} cy={12.6} r={1.3} fill={color} /> : null}
    </Svg>
  );
}
