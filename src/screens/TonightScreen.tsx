import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SpotCard } from '../components/SpotCard';
import { palette } from '../theme/palette';
import type { KpTrend, Spot, SpotScoreResult } from '../types';

type Props = {
  onOpenSpot: (spotId: string) => void;
  loading: boolean;
  error: string | null;
  kp: KpTrend;
  topSpots: SpotScoreResult[];
  spotsById: Record<string, Spot>;
  auroraTonightScore: number;
  recommendation: string;
  refresh: () => Promise<void>;
};

const formatLocalTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

export function TonightScreen({
  onOpenSpot,
  loading,
  error,
  kp,
  topSpots,
  spotsById,
  auroraTonightScore,
  recommendation,
  refresh
}: Props) {
  const bestSpot = topSpots[0];

  if (loading && topSpots.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.auroraGreen} />
        <Text style={styles.helper}>Loading tonight's forecast...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
    >
      <View style={styles.auroraGlowTop} />
      <View style={styles.auroraGlowBottom} />
      <View style={styles.hero}>
        <Text style={styles.overline}>Tonight in Tromso</Text>
        <Text style={styles.heroTitle}>Aurora Score</Text>
        <Text style={styles.score}>{auroraTonightScore}</Text>
        <Text style={styles.recommendation}>{recommendation}</Text>

        {bestSpot ? (
          <Text style={styles.helper}>Best window: {formatLocalTime(bestSpot.bestWindowStart)}-{formatLocalTime(bestSpot.bestWindowEnd)}</Text>
        ) : null}

        <View style={styles.whyBox}>
          <Text style={styles.whyTitle}>Why This Looks Good</Text>
          <View style={styles.metricRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Cloud</Text>
              <Text style={styles.metricValue}>{bestSpot?.cloudCoverAtBestHour ?? '-'}%</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>KP Now</Text>
              <Text style={styles.metricValue}>{kp.current.toFixed(1)}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>KP Peak</Text>
              <Text style={styles.metricValue}>{kp.peakNext12h.toFixed(1)}</Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Top 5 Aurora Spots Right Now</Text>
      {topSpots.map((result) => {
        const spot = spotsById[result.spotId];
        if (!spot) return null;

        return <SpotCard key={spot.id} spot={spot} result={result} onPress={() => onOpenSpot(spot.id)} />;
      })}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 30,
    backgroundColor: palette.night
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.night
  },
  auroraGlowTop: {
    position: 'absolute',
    top: -18,
    right: -30,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#45f3bf38'
  },
  auroraGlowBottom: {
    position: 'absolute',
    top: 210,
    left: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#4a8dff29'
  },
  hero: {
    backgroundColor: palette.cardElevated,
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 6
  },
  overline: {
    color: palette.textMuted,
    fontSize: 12,
    marginBottom: 2
  },
  heroTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2
  },
  score: {
    color: palette.auroraMint,
    fontSize: 54,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  recommendation: {
    color: palette.textPrimary,
    fontSize: 19,
    fontWeight: '600',
    marginBottom: 10
  },
  helper: {
    color: palette.textSecondary,
    fontSize: 14
  },
  whyBox: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: palette.cardBorder,
    paddingTop: 10
  },
  whyTitle: {
    color: palette.textPrimary,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 8
  },
  metricRow: {
    flexDirection: 'row',
    gap: 8
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#0d1a30',
    borderWidth: 1,
    borderColor: '#2d466b',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 8
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 11,
    marginBottom: 4
  },
  metricValue: {
    color: palette.textPrimary,
    fontWeight: '700',
    fontSize: 19
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 12
  },
  error: {
    color: palette.danger,
    marginTop: 10
  }
});
