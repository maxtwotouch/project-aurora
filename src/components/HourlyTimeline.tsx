import { StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme/palette';
import { radius, space } from '../theme/tokens';
import { typography } from '../theme/type';

export type TimelinePoint = {
  time: string;
  value: number;
};

type Props = {
  points: TimelinePoint[];
  /** ISO bounds of the window to highlight (e.g. the best viewing window). */
  highlightStart?: string;
  highlightEnd?: string;
  toneFor: (value: number) => string;
  maxPoints?: number;
  accessibilityLabel?: string;
};

const formatHour = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', hour12: false, hourCycle: 'h23' });

const TRACK_HEIGHT = 64;

/**
 * A real, data-driven hourly timeline -- not a decorative sparkline. Every
 * bar reflects an actual forecast value for that hour, and the highlighted
 * band is the model's chosen window. Used for tonight's score curve and for
 * the spot-detail cloud outlook.
 */
export function HourlyTimeline({ points, highlightStart, highlightEnd, toneFor, maxPoints = 14, accessibilityLabel }: Props) {
  const shown = points.slice(0, maxPoints);
  if (shown.length === 0) return null;

  const startMs = highlightStart ? new Date(highlightStart).getTime() : null;
  const endMs = highlightEnd ? new Date(highlightEnd).getTime() : null;

  return (
    // Not `accessible` here: an accessible container collapses all children
    // into one generic node, which is exactly what previously hid per-hour
    // values from screen readers. `list`/`accessibilityLabel` describe the
    // group without swallowing the per-bar nodes below.
    <View style={styles.wrap} accessibilityRole="list" accessibilityLabel={accessibilityLabel ?? 'Hourly forecast timeline'}>
      <View style={styles.row}>
        {shown.map((point, index) => {
          const ms = new Date(point.time).getTime();
          const inWindow = startMs !== null && endMs !== null ? ms >= startMs && ms <= endMs : false;
          const showLabel = index === 0 || index === shown.length - 1 || index % 3 === 0;
          // Guard against malformed forecast values (NaN/undefined) so a bad
          // data point renders the visual floor instead of a NaN% bar.
          const safeValue = Number.isFinite(point.value) ? point.value : 0;
          const heightPct = Math.max(6, Math.min(100, Math.round(safeValue)));

          return (
            <View
              key={point.time}
              style={styles.column}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${formatHour(point.time)}, ${heightPct} percent${inWindow ? ', best window' : ''}`}
            >
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${heightPct}%`,
                      backgroundColor: toneFor(safeValue),
                      opacity: inWindow || startMs === null ? 1 : 0.4
                    }
                  ]}
                />
              </View>
              <Text style={[styles.hourLabel, inWindow ? styles.hourLabelActive : null]} numberOfLines={1}>
                {showLabel ? formatHour(point.time) : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xxs
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3
  },
  column: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: space.xxs
  },
  track: {
    width: '100%',
    height: TRACK_HEIGHT,
    justifyContent: 'flex-end',
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: palette.surfaceSunken
  },
  bar: {
    width: '100%',
    borderRadius: radius.sm
  },
  hourLabel: {
    ...typography.caption,
    fontSize: 10,
    color: palette.textMuted
  },
  hourLabelActive: {
    color: palette.auroraMint,
    fontWeight: '800'
  }
});
