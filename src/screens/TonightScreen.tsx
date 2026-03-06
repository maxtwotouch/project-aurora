import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SpotCard } from '../components/SpotCard';
import { palette } from '../theme/palette';
import type { KpTrend, Spot, SpotScoreResult } from '../types';

type Props = {
  onOpenSpot: (spotId: string) => void;
  loading: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
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
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

function whyTitleFromScore(score: number): string {
  if (score >= 70) return 'Why This Looks Good';
  if (score >= 45) return 'Why Conditions Are Mixed';
  return 'Why Visibility Is Low';
}

function chanceLabelFromScore(score: number): string {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

function decisionLabel(score: number, bestCloudCover?: number): 'Go Now' | 'Wait' | 'Best Later' {
  if (typeof bestCloudCover === 'number' && bestCloudCover > 80) return 'Best Later';
  if (score >= 65) return 'Go Now';
  if (score >= 40) return 'Wait';
  return 'Best Later';
}

function decisionStyle(label: 'Go Now' | 'Wait' | 'Best Later') {
  if (label === 'Go Now') {
    return { bg: '#123c2f', border: '#2adf92', text: '#9affda' };
  }
  if (label === 'Wait') {
    return { bg: '#2b2410', border: '#facc15', text: '#fde68a' };
  }
  return { bg: '#3a1a24', border: '#fb7185', text: '#ffc1ce' };
}

const formatUpdatedAt = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

export function TonightScreen({
  onOpenSpot,
  loading,
  error,
  lastUpdatedAt,
  kp,
  topSpots,
  spotsById,
  auroraTonightScore,
  recommendation,
  refresh
}: Props) {
  const bestSpot = topSpots[0];
  const decision = decisionLabel(auroraTonightScore, bestSpot?.cloudCoverAtBestHour);
  const decisionColors = decisionStyle(decision);
  const bestSpotData = bestSpot ? spotsById[bestSpot.spotId] : undefined;

  const navigateToBestSpot = () => {
    if (!bestSpotData) return;

    const url = `https://www.google.com/maps/search/?api=1&query=${bestSpotData.lat},${bestSpotData.lon}`;
    void Linking.openURL(url);
  };

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
        <Text style={styles.heroTitle}>Aurora Chance Tonight</Text>
        <View style={[styles.decisionPill, { backgroundColor: decisionColors.bg, borderColor: decisionColors.border }]}>
          <Text style={[styles.decisionText, { color: decisionColors.text }]}>{decision}</Text>
        </View>
        <Text style={styles.recommendation}>{chanceLabelFromScore(auroraTonightScore)}</Text>
        <Text style={styles.score}>{auroraTonightScore} / 100</Text>
        <Text style={styles.helper}>
          Data updated: {lastUpdatedAt ? formatUpdatedAt(lastUpdatedAt) : '-'}
        </Text>

        {bestSpot ? (
          <View style={styles.bestSpotBox}>
            <Text style={styles.bestSpotLabel}>Best Spot Right Now</Text>
            <Text style={styles.bestSpotName}>{bestSpot.spotName}</Text>
            <Text style={styles.helper}>
              Best time: {formatLocalTime(bestSpot.bestWindowStart)}-{formatLocalTime(bestSpot.bestWindowEnd)}
            </Text>
            <Text style={styles.helper}>Cloud cover: {bestSpot.cloudCoverAtBestHour}%</Text>
            <Pressable style={styles.navigateBtn} onPress={navigateToBestSpot}>
              <Text style={styles.navigateText}>Navigate</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.whyBox}>
          <Text style={styles.whyTitle}>{whyTitleFromScore(auroraTonightScore)}</Text>
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
    color: palette.textSecondary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6
  },
  recommendation: {
    color: palette.auroraMint,
    fontSize: 31,
    fontWeight: '600',
    marginBottom: 4
  },
  decisionPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 8
  },
  decisionText: {
    fontSize: 12,
    fontWeight: '800'
  },
  helper: {
    color: palette.textSecondary,
    fontSize: 14
  },
  bestSpotBox: {
    marginTop: 12,
    backgroundColor: '#0d1a30',
    borderWidth: 1,
    borderColor: '#2d466b',
    borderRadius: 14,
    padding: 12
  },
  bestSpotLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 3
  },
  bestSpotName: {
    color: palette.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6
  },
  navigateBtn: {
    marginTop: 10,
    backgroundColor: palette.auroraGreen,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center'
  },
  navigateText: {
    color: palette.night,
    fontWeight: '800'
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
