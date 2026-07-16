import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScoreBadge } from './ScoreBadge';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';
import type { Spot, SpotScoreResult } from '../types';

type Props = {
  spot: Spot;
  result: SpotScoreResult;
  onPress: () => void;
};

const formatLocalTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

function trendLabel(trend: SpotScoreResult['trend'], t: (key: string) => string) {
  if (trend === 'good_now') return t('common.trend.goodNow');
  if (trend === 'improving') return t('common.trend.improving');
  return t('common.trend.limited');
}

function trendStyle(trend: SpotScoreResult['trend']) {
  if (trend === 'good_now') {
    return { backgroundColor: palette.successSurface, borderColor: palette.auroraDeep, color: palette.auroraMint };
  }
  if (trend === 'improving') {
    return { backgroundColor: palette.infoSurface, borderColor: palette.auroraBlue, color: palette.textOnInfoSurface };
  }
  return { backgroundColor: palette.dangerSurface, borderColor: palette.danger, color: palette.textOnDangerSurface };
}

function cloudTone(cloudCover: number): string {
  if (cloudCover <= 35) return palette.auroraMint;
  if (cloudCover <= 70) return palette.warning;
  return palette.danger;
}

export function SpotCard({ spot, result, onPress }: Props) {
  const { t } = useTranslation();
  const trend = trendStyle(result.trend);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('spotCard.a11yLabel', { name: spot.name, score: result.score, trend: trendLabel(result.trend, t) })}
      style={({ pressed, focused }: WebPressableState) => [
        styles.card,
        Platform.OS === 'web' ? styles.cardHover : null,
        focused ? styles.focusRing : null,
        pressed ? styles.cardPressed : null
      ]}
      onPress={onPress}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.name} numberOfLines={2}>
            {spot.name}
          </Text>
          <Text style={styles.subtle}>{t('common.distanceTromsoCenter', { km: spot.distanceKm })}</Text>

          {spot.busStop || spot.parking ? (
            <View style={styles.accessRow}>
              {spot.busStop ? (
                <View style={styles.accessChip} accessibilityLabel={t('spotCard.busStopA11y', { stop: spot.busStop })}>
                  <Ionicons name="bus-outline" size={12} color={palette.auroraIce} />
                  <Text style={styles.accessChipText}>{t('common.bus')}</Text>
                </View>
              ) : null}
              {spot.parking ? (
                <View style={styles.accessChip} accessibilityLabel={t('spotCard.parkingA11y', { parking: spot.parking })}>
                  <Text style={styles.accessChipGlyph}>P</Text>
                  <Text style={styles.accessChipText}>{t('common.parking')}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <ScoreBadge score={result.score} />
      </View>

      <View style={styles.metaBand}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>{t('common.bestWindow')}</Text>
          <Text style={styles.metaValue}>
            {formatLocalTime(result.bestWindowStart)}–{formatLocalTime(result.bestWindowEnd)}
          </Text>
        </View>
        <View style={[styles.metaItem, styles.metaItemDivided]}>
          <Text style={styles.metaLabel}>{t('common.cloud')}</Text>
          <Text style={[styles.metaValue, { color: cloudTone(result.cloudCoverAtBestHour) }]}>
            {result.cloudCoverAtBestHour}%
          </Text>
        </View>
        <View style={[styles.metaItem, styles.metaItemDivided]}>
          <Text style={styles.metaLabel}>{t('spotCard.trendLabel')}</Text>
          <View style={[styles.trendPill, { backgroundColor: trend.backgroundColor, borderColor: trend.borderColor }]}>
            <Text style={[styles.trendText, { color: trend.color }]}>{trendLabel(result.trend, t)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.cardElevated,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  cardHover: {
    borderColor: palette.cardBorderStrong,
    backgroundColor: palette.chipSurfaceActive
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.988 }]
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any,
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  name: {
    ...typography.heading,
    color: palette.textPrimary
  },
  subtle: {
    ...typography.bodySmall,
    color: palette.textMuted
  },
  accessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xxs,
    marginTop: space.xxs
  },
  accessChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.xxs,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceSunkenAlt,
    borderWidth: 1,
    borderColor: palette.borderHairline
  },
  accessChipGlyph: {
    ...typography.caption,
    fontSize: 10,
    fontWeight: '800',
    color: palette.auroraIce
  },
  accessChipText: {
    ...typography.caption,
    fontSize: 10,
    color: palette.textSecondary
  },
  metaBand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.borderHairline
  },
  metaItem: {
    minWidth: 92,
    gap: 3
  },
  metaItemDivided: {
    borderLeftWidth: 1,
    borderLeftColor: palette.borderHairline,
    paddingLeft: space.md
  },
  metaLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 0.6,
    color: palette.textMuted
  },
  metaValue: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  trendPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.xs,
    paddingVertical: 3
  },
  trendText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700'
  }
});
