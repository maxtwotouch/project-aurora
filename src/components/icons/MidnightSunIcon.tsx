import Svg, { Circle, Path } from 'react-native-svg';

import { LINE_ICON_STROKE_WIDTH } from './types';

type Props = {
  size: number;
  color: string;
  /**
   * When set, draws one small filled "town light" dot on the horizon line --
   * the polar-day notice's copper spot (see decision.ts and
   * HourlyTimeline.tsx for the other two). It reads as a town waiting out
   * the light along with the reader: still there, just not visible against
   * a sky that never gets dark, which is the same "not now, but later"
   * patience copper stands for elsewhere. Omitted by default so this icon
   * stays reusable/neutral wherever else a plain midnight-sun mark is
   * useful.
   */
  townLightColor?: string;
};

/**
 * Replaces the polar-day notice's previous Ionicons "partly-sunny" glyph
 * (a stand-in emoji-ish weather symbol, closer to text than to this app's
 * own iconography) with a small custom mark: a low sun sitting right on the
 * horizon with a few rays, in the same stroke language as the tab icons --
 * "the sun that never sets" is literally the polar-day fact being reported.
 */
export function MidnightSunIcon({ size, color, townLightColor }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.2 14.5a7.8 7.8 0 0 1 15.6 0"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
      />
      <Path
        d="M12 6.4V4.3M6.7 8.4 5.2 6.9M17.3 8.4l1.5-1.5"
        stroke={color}
        strokeWidth={LINE_ICON_STROKE_WIDTH}
        strokeLinecap="round"
      />
      <Path d="M2.4 14.5h19.2" stroke={color} strokeWidth={LINE_ICON_STROKE_WIDTH} strokeLinecap="round" />
      {townLightColor ? <Circle cx={16.4} cy={14.5} r={1.15} fill={townLightColor} /> : null}
    </Svg>
  );
}
