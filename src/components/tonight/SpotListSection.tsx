import { Animated, Pressable, StyleSheet, Text } from 'react-native';

import { SpotCard } from '../SpotCard';
import { palette } from '../../theme/palette';
import { radius, space, type WebPressableState } from '../../theme/tokens';
import { typography } from '../../theme/type';
import type { Spot, SpotScoreResult } from '../../types';

type Props = {
  listAnim: Animated.Value;
  riseFrom: (distance: number) => number;
  title: string;
  subtitle: string;
  /** Already-sliced preview results to render as cards. */
  results: SpotScoreResult[];
  /** Full (unsliced) count, to decide whether the "see more" CTA shows. */
  totalCount: number;
  spotsById: Record<string, Spot>;
  onOpenSpot: (spotId: string) => void;
  ctaLabel: string;
  onCtaPress: () => void;
  /** Prefixes each SpotCard's React key (e.g. "close-") to keep keys unique
      when the same spot can appear in more than one section. */
  keyPrefix?: string;
};

/** A titled preview list of ranked spots (top picks / closer alternatives), with an optional "see more" link. */
export function SpotListSection({
  listAnim,
  riseFrom,
  title,
  subtitle,
  results,
  totalCount,
  spotsById,
  onOpenSpot,
  ctaLabel,
  onCtaPress,
  keyPrefix = ''
}: Props) {
  return (
    <>
      <Animated.View
        style={[
          styles.sectionHeader,
          {
            opacity: listAnim,
            transform: [
              {
                translateY: listAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [riseFrom(10), 0]
                })
              }
            ]
          }
        ]}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </Animated.View>
      <Animated.View style={{ opacity: listAnim }}>
        {results.map((result) => {
          const spot = spotsById[result.spotId];
          if (!spot) return null;

          return <SpotCard key={`${keyPrefix}${spot.id}`} spot={spot} result={result} onPress={() => onOpenSpot(spot.id)} />;
        })}
        {totalCount > results.length ? (
          <Pressable
            accessibilityRole="link"
            style={({ pressed, focused }: WebPressableState) => [styles.inlineCta, focused ? styles.focusRing : null, pressed ? styles.buttonPressed : null]}
            onPress={onCtaPress}
          >
            <Text style={styles.inlineCtaText}>{ctaLabel}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginBottom: space.sm
  },
  sectionTitle: {
    ...typography.title,
    color: palette.textPrimary
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    color: palette.textMuted
  },
  inlineCta: {
    minHeight: 46,
    borderRadius: radius.md,
    marginTop: space.xxs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong,
    backgroundColor: palette.surfaceOverlay
  },
  inlineCtaText: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any
});
