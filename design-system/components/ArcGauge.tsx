import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useReducedMotion } from '../hooks/useReducedMotion';
import { palette, motion, typography } from '../tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ArcGaugeProps = {
  /** Current value. Values outside `[0, max]` are clamped. */
  value: number;
  /** The value that fills the full sweep. Defaults to 100. */
  max?: number;
  /** Diameter in px. Defaults to a size that reads well inside a hero card. */
  size?: number;
  /** Small caption under the numeral, e.g. "OUT OF 100". Optional — omit to just show the number. */
  label?: string;
  accessibilityLabel: string;
  /** Formats the numeral. Defaults to `Math.round(value)`. Use this for e.g. "$$" or "4.2mi" instead of a bare integer. */
  formatValue?: (value: number) => string;
  /** Dim, unfilled portion of the dial. Defaults to `palette.cardElevated`. */
  trackColor?: string;
  /** The filled sweep. Defaults to `palette.auroraGreen` — override per the host app's own signal semantics (see design-system/README.md § "Starting a sibling app"). */
  fillColor?: string;
  /** Small dot at the fill's leading edge. Defaults to `palette.textPrimary`. */
  tipColor?: string;
  /** Numeral color. Defaults to `palette.textPrimary`. */
  valueColor?: string;
  /** Caption color. Defaults to `palette.textMuted`. */
  labelColor?: string;
};

const VIEWBOX = 100;
const CENTER = VIEWBOX / 2;
const RADIUS = 38;
const STROKE_WIDTH = 9;
// A 260deg dial with a 100deg gap centered on the bottom (6 o'clock), so the
// track reads as an instrument dial rather than a full closed ring. Angles
// are in the SVG's own coordinate frame (0deg = 3 o'clock, increasing
// clockwise since y grows downward).
const START_ANGLE_DEG = 140;
const SWEEP_DEG = 260;
const ARC_LENGTH = RADIUS * (SWEEP_DEG * (Math.PI / 180));

function pointOnArc(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + RADIUS * Math.cos(rad),
    y: CENTER + RADIUS * Math.sin(rad)
  };
}

const START_POINT = pointOnArc(START_ANGLE_DEG);
const END_POINT = pointOnArc(START_ANGLE_DEG + SWEEP_DEG);
// One fixed path for the full 260deg sweep -- both the dim track and the
// bright fill render this same "d", the fill's dasharray/dashoffset is what
// reveals a fraction of it. This sidesteps having to flip the
// large-arc-flag as the fill crosses the 180deg mark.
const TRACK_PATH = `M ${START_POINT.x} ${START_POINT.y} A ${RADIUS} ${RADIUS} 0 1 1 ${END_POINT.x} ${END_POINT.y}`;

/**
 * ArcGauge — the design system's one signature "big score/metric moment".
 * An instrument dial (not a full ring, not a progress bar), Fraunces
 * numeral centered, small tip dot at the fill's leading edge, sweeps in
 * once on mount.
 *
 * Use this for exactly one metric per screen — the thing the whole screen
 * exists to answer (aurora score tonight; in a sibling app, maybe a
 * "worth-the-trip" score for a restaurant). Reaching for it twice on one
 * screen dilutes the "one signature moment" rule this component exists to
 * enforce — use `DataBand` for supporting numbers instead.
 *
 * Generalized from the app's original ScoreGauge (0-100 aurora score only)
 * to `value`/`max`/color props so a sibling app's own metric — a different
 * range, a different color meaning — doesn't require forking this file.
 * See src/components/tonight/ScoreGauge.tsx in the app for a 0-100
 * "score" wrapper with the app's own accessibility copy.
 *
 * Respects reduced-motion: renders at the final value with no animation
 * when the OS/browser signals a preference for it.
 */
export function ArcGauge({
  value,
  max = 100,
  size = 148,
  label,
  accessibilityLabel,
  formatValue,
  trackColor = palette.cardElevated,
  fillColor = palette.auroraGreen,
  tipColor = palette.textPrimary,
  valueColor = palette.textPrimary,
  labelColor = palette.textMuted
}: ArcGaugeProps) {
  const clamped = Math.max(0, Math.min(max, value));
  const fraction = max > 0 ? clamped / max : 0;
  const reducedMotion = useReducedMotion();
  const sweep = useRef(new Animated.Value(reducedMotion ? fraction : 0)).current;
  const tipOpacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      sweep.setValue(fraction);
      tipOpacity.setValue(1);
      return;
    }

    sweep.setValue(0);
    tipOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(sweep, {
        toValue: fraction,
        duration: motion.duration.slow,
        easing: motion.easing.out,
        // strokeDashoffset isn't a transform/opacity property, so this
        // animation runs on the JS thread rather than the native driver --
        // acceptable here since it drives a single value once per mount.
        useNativeDriver: false
      }),
      Animated.timing(tipOpacity, {
        toValue: 1,
        duration: motion.duration.fast,
        easing: motion.easing.out,
        useNativeDriver: false
      })
    ]).start();
    // fraction intentionally omitted: re-running this effect on every value
    // tick (e.g. a background refresh nudging the score by a point) would
    // re-trigger the full sweep-in; it should only play once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, sweep, tipOpacity]);

  const dashOffset = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [ARC_LENGTH, 0]
  });

  const tip = pointOnArc(START_ANGLE_DEG + SWEEP_DEG * fraction);
  const displayValue = formatValue ? formatValue(clamped) : String(Math.round(clamped));

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        <Path d={TRACK_PATH} stroke={trackColor} strokeWidth={STROKE_WIDTH} strokeLinecap="round" fill="none" />
        <AnimatedPath
          d={TRACK_PATH}
          stroke={fillColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${ARC_LENGTH} ${ARC_LENGTH}`}
          strokeDashoffset={dashOffset}
        />
        <AnimatedCircle cx={tip.x} cy={tip.y} r={5.6} fill={tipColor} opacity={tipOpacity} />
      </Svg>
      {/*
        Centering note (iOS numeral offset bug): this used to be a
        content-sized box positioned with only `top: '4%'` set (no
        left/right). Absolutely-positioned children that pin one axis but
        leave the other to fall back on the parent's flex alignment are a
        known Yoga edge case that iOS resolves differently from
        web/Android -- combined with Fraunces 900's taller iOS ascender
        metrics inflating the text's own line box, the numeral rendered
        shoved up-left of the arc's actual center on device instead of
        centered under it.

        Fix: stretch this wrap to the *full* gauge box (all four edges
        pinned to 0) and center its content with `alignItems`/
        `justifyContent` instead of a partial position offset -- this is
        deterministic on every platform, no static-position fallback
        involved. The original "nudge down slightly from dead-center, into
        the dial's open lower region" composition is preserved via an
        explicit pixel `translateY` (computed from `size`, matching the
        old `top: 4%`) rather than a raw `top` offset.

        Ported here from the app's original ScoreGauge (see that fix's
        commit) rather than left there: numeral centering/Fraunces-metrics
        correctness is a canonical-component concern -- every consumer of
        this dial (this app's score, a sibling app's own metric) needs it,
        not just the aurora score.
      */}
      <View style={[styles.numeralWrap, { transform: [{ translateY: size * 0.04 }] }]} pointerEvents="none">
        <Text style={[styles.numeral, { color: valueColor }]}>{displayValue}</Text>
        {label ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  numeralWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  numeral: {
    ...typography.numeralLg,
    // Constrains the line box to (near) the glyph's own height instead of
    // the font's full ascender/descender allowance, which is where Fraunces
    // 900's iOS-vs-web metrics mismatch shows up as vertical drift; see the
    // centering note above `numeralWrap`.
    lineHeight: typography.numeralLg.fontSize,
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {}
    })
  },
  label: {
    ...typography.eyebrow,
    marginTop: -2,
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {}
    })
  }
});
