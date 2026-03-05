import { Pressable, StyleSheet, Text, View } from 'react-native';

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
    minute: '2-digit'
  });

const estimateDriveMinutes = (distanceKm: number) => Math.round(distanceKm * 1.15);

function trendLabel(trend: SpotScoreResult['trend']) {
  if (trend === 'good_now') return 'Good now';
  if (trend === 'improving') return 'Improving';
  return 'Getting worse';
}

function trendStyle(trend: SpotScoreResult['trend']) {
  if (trend === 'good_now') {
    return { backgroundColor: '#123c2f', borderColor: '#2adf92', color: '#9affda' };
  }
  if (trend === 'improving') {
    return { backgroundColor: '#122a3c', borderColor: '#63a8ff', color: '#a8ceff' };
  }
  return { backgroundColor: '#3a1a24', borderColor: '#fb7185', color: '#ffc1ce' };
}

export function SpotCard({ spot, result, onPress }: Props) {
  const trend = trendStyle(result.trend);

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.titleWrap}>
          <Text style={styles.name}>{spot.name}</Text>
          <Text style={styles.subtle}>Live recommendation</Text>
        </View>
        <ScoreBadge score={result.score} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>Best window</Text>
        <Text style={styles.metaValue}>
          {formatLocalTime(result.bestWindowStart)}-{formatLocalTime(result.bestWindowEnd)}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>Drive</Text>
        <Text style={styles.metaValue}>{estimateDriveMinutes(spot.distanceKm)} min</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>Trend</Text>
        <View style={[styles.trendPill, { backgroundColor: trend.backgroundColor, borderColor: trend.borderColor }]}>
          <Text style={[styles.trendText, { color: trend.color }]}>{trendLabel(result.trend)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.cardElevated,
    borderRadius: 16,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 4
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  titleWrap: {
    flex: 1,
    marginRight: 10
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.textPrimary
  },
  subtle: {
    color: palette.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4
  },
  metaKey: {
    color: palette.textMuted
  },
  metaValue: {
    color: palette.textSecondary,
    fontWeight: '600'
  },
  trendPill: {
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
