import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScoreBadge } from './ScoreBadge';
import { palette } from '../theme/palette';
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

function trendLabel(trend: SpotScoreResult['trend']) {
  if (trend === 'good_now') return 'Good now';
  if (trend === 'improving') return 'Better later';
  return 'Limited tonight';
}

function chanceLabel(score: number): string {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

function trendStyle(trend: SpotScoreResult['trend']) {
  if (trend === 'good_now') {
    return { backgroundColor: palette.successSurface, borderColor: palette.auroraDeep, color: palette.auroraMint };
  }
  if (trend === 'improving') {
    return { backgroundColor: palette.infoSurface, borderColor: palette.auroraBlue, color: palette.auroraIce };
  }
  return { backgroundColor: palette.dangerSurface, borderColor: palette.danger, color: '#ffd0d7' };
}

export function SpotCard({ spot, result, onPress }: Props) {
  const trend = trendStyle(result.trend);

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        Platform.OS === 'web' ? styles.cardHover : null,
        pressed ? styles.cardPressed : null
      ]}
      onPress={onPress}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.eyebrow}>Field pick</Text>
          <Text style={styles.name} numberOfLines={2}>
            {spot.name}
          </Text>
          <Text style={styles.subtle}>{spot.distanceKm} km from Tromso center</Text>
        </View>
        <ScoreBadge score={result.score} />
      </View>

      <View style={styles.timingBand}>
        <Text style={styles.timingLabel}>Best viewing window</Text>
        <Text style={styles.timingValue}>
          {formatLocalTime(result.bestWindowStart)} to {formatLocalTime(result.bestWindowEnd)}
        </Text>
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaCell}>
          <Text style={styles.metaKey}>Chance</Text>
          <Text style={styles.metaValue}>{chanceLabel(result.score)}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaKey}>Cloud</Text>
          <Text style={styles.metaValue}>{result.cloudCoverAtBestHour}%</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaKey}>Trend</Text>
          <View style={[styles.trendPill, { backgroundColor: trend.backgroundColor, borderColor: trend.borderColor }]}>
            <Text style={[styles.trendText, { color: trend.color }]}>{trendLabel(result.trend)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.cardElevated,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 5
  },
  cardHover: {
    borderColor: palette.cardBorderStrong,
    backgroundColor: '#1d3140'
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.988 }]
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  titleWrap: {
    flex: 1,
    minWidth: 0
  },
  eyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    marginBottom: 4,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  name: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    color: palette.textPrimary
  },
  subtle: {
    color: palette.textMuted,
    fontSize: 13,
    marginTop: 5
  },
  timingBand: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#284657'
  },
  timingLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4
  },
  timingValue: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '700'
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14
  },
  metaCell: {
    minWidth: 92,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#162733',
    borderWidth: 1,
    borderColor: '#274253'
  },
  metaKey: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4
  },
  metaValue: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  trendPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700'
  }
});
