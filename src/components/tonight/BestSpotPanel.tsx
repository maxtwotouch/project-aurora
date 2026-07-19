import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n/useTranslation';
import { palette } from '../../theme/palette';
import { radius, space, type WebPressableState } from '../../theme/tokens';
import { typography } from '../../theme/type';
import type { Spot, SpotScoreResult } from '../../types';

type Props = {
  bestSpot: SpotScoreResult | undefined;
  bestSpotData: Spot | undefined;
  isWideWeb: boolean;
  onOpenSpot: (spotId: string) => void;
};

/** Tonight's best-ranked spot, with "View details" / "Navigate" CTAs. */
export function BestSpotPanel({ bestSpot, bestSpotData, isWideWeb, onOpenSpot }: Props) {
  const { t } = useTranslation();

  const navigateToBestSpot = () => {
    if (!bestSpotData) return;

    const url = `https://www.google.com/maps/search/?api=1&query=${bestSpotData.lat},${bestSpotData.lon}`;
    void Linking.openURL(url);
  };

  return (
    <View style={[styles.heroSecondary, isWideWeb ? styles.heroSecondaryWide : null]}>
      <Text style={styles.sectionKicker}>{t('tonight.bestSpotNow')}</Text>
      {bestSpot && bestSpotData ? (
        <View style={styles.bestSpotBox}>
          <Text style={styles.bestSpotName} numberOfLines={2}>
            {bestSpot.spotName}
          </Text>
          <Text style={styles.bestSpotMeta}>{t('tonight.distanceCityCenter', { km: bestSpotData.distanceKm })}</Text>

          <View style={styles.bestSpotActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('tonight.viewDetailsFor', { name: bestSpot.spotName })}
              style={({ pressed, focused }: WebPressableState) => [
                styles.secondaryButton,
                Platform.OS === 'web' ? styles.secondaryButtonHover : null,
                focused ? styles.focusRing : null,
                pressed ? styles.buttonPressed : null
              ]}
              onPress={() => onOpenSpot(bestSpot.spotId)}
            >
              <Text style={styles.secondaryButtonText}>{t('tonight.viewDetails')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.openNavigationTo', { name: bestSpot.spotName })}
              style={({ pressed, focused }: WebPressableState) => [
                styles.primaryButton,
                Platform.OS === 'web' ? styles.primaryButtonHover : null,
                focused ? styles.focusRing : null,
                pressed ? styles.buttonPressed : null
              ]}
              onPress={navigateToBestSpot}
            >
              <Text style={styles.primaryButtonText}>{t('common.navigate')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.bestSpotBox}>
          <Text style={styles.helper}>{t('tonight.noRecommendation')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heroSecondary: {
    gap: space.xs
  },
  heroSecondaryWide: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: palette.borderHairline,
    paddingLeft: space.lg
  },
  sectionKicker: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  bestSpotBox: {
    gap: space.xs
  },
  bestSpotName: {
    ...typography.heading,
    color: palette.textPrimary
  },
  bestSpotMeta: {
    ...typography.bodySmall,
    color: palette.textSecondary
  },
  bestSpotActions: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.xxs
  },
  primaryButton: {
    minHeight: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    backgroundColor: palette.auroraGreen
  },
  primaryButtonHover: {
    backgroundColor: palette.auroraGlow
  },
  primaryButtonText: {
    ...typography.bodyStrong,
    color: palette.textOnAurora
  },
  secondaryButton: {
    minHeight: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: palette.cardBorderStrong,
    backgroundColor: palette.chipSurface
  },
  secondaryButtonHover: {
    backgroundColor: palette.chipSurfaceActive
  },
  secondaryButtonText: {
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
  } as any,
  helper: {
    ...typography.body,
    color: palette.textSecondary
  }
});
