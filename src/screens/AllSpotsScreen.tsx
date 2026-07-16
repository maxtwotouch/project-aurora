import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DataQualityBanner } from '../components/DataQualityBanner';
import { SpotCard } from '../components/SpotCard';
import { UsageConsentToggle } from '../components/UsageConsentToggle';
import { palette } from '../theme/palette';
import type { AppDataQuality, Spot, SpotScoreResult } from '../types';

type Props = {
  rankedSpots: SpotScoreResult[];
  spotsById: Record<string, Spot>;
  dataQuality: AppDataQuality;
  loading: boolean;
  refresh: () => Promise<void>;
  onOpenSpot: (spotId: string) => void;
};

export function AllSpotsScreen({ rankedSpots, spotsById, dataQuality, loading, refresh, onOpenSpot }: Props) {
  const [sortMode, setSortMode] = useState<'top' | 'nearby'>('top');

  const sortedSpots = useMemo(() => {
    const items = [...rankedSpots];

    if (sortMode === 'nearby') {
      return items.sort((a, b) => {
        const distanceA = spotsById[a.spotId]?.distanceKm ?? Number.POSITIVE_INFINITY;
        const distanceB = spotsById[b.spotId]?.distanceKm ?? Number.POSITIVE_INFINITY;
        return distanceA - distanceB || b.score - a.score;
      });
    }

    return items.sort((a, b) => b.score - a.score);
  }, [rankedSpots, sortMode, spotsById]);

  const bestSpot = sortedSpots[0] ? spotsById[sortedSpots[0].spotId] : null;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
    >
      <View style={styles.headerCard}>
        <Text style={styles.eyebrow}>Tonight</Text>
        <Text style={styles.title}>All spots</Text>
        <Text style={styles.subtitle}>
          Compare stops without burying the important bits. Switch between strongest and quickest options.
        </Text>
        <Text style={styles.headerMeta}>
          Showing {sortedSpots.length} ranked stop{sortedSpots.length === 1 ? '' : 's'} by {sortMode === 'top' ? 'forecast strength' : 'driving distance'}.
        </Text>

        <View style={styles.bannerWrap}>
          <DataQualityBanner dataQuality={dataQuality} />
        </View>

        <View style={styles.segmentedControl}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.segmentButton,
              sortMode === 'top' ? styles.segmentButtonActive : null,
              pressed ? styles.segmentButtonPressed : null
            ]}
            onPress={() => setSortMode('top')}
          >
            <Text style={[styles.segmentText, sortMode === 'top' ? styles.segmentTextActive : null]}>Top spots</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.segmentButton,
              sortMode === 'nearby' ? styles.segmentButtonActive : null,
              pressed ? styles.segmentButtonPressed : null
            ]}
            onPress={() => setSortMode('nearby')}
          >
            <Text style={[styles.segmentText, sortMode === 'nearby' ? styles.segmentTextActive : null]}>Nearby spots</Text>
          </Pressable>
        </View>

        {bestSpot ? (
          <View style={styles.summaryStrip}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryLabel}>First pick</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {bestSpot.name}
              </Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryLabel}>Distance</Text>
              <Text style={styles.summaryValue}>{bestSpot.distanceKm} km</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryLabel}>Mode</Text>
              <Text style={styles.summaryValue}>{sortMode === 'top' ? 'Best score' : 'Shortest drive'}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {!loading && rankedSpots.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No ranked spots yet</Text>
          <Text style={styles.emptyText}>Pull to refresh once forecast data is available for tonight.</Text>
        </View>
      ) : null}

      {sortedSpots.map((result) => {
        const spot = spotsById[result.spotId];
        if (!spot) return null;

        return <SpotCard key={spot.id} spot={spot} result={result} onPress={() => onOpenSpot(spot.id)} />;
      })}

      <Text style={styles.attribution}>Some spot details verified with Tromsø kommune</Text>
      <UsageConsentToggle />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 28,
    backgroundColor: palette.night
  },
  headerCard: {
    backgroundColor: palette.nightPanel,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 14
  },
  eyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6
  },
  title: {
    color: palette.textPrimary,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    marginBottom: 6
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  headerMeta: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16
  },
  bannerWrap: {
    marginTop: 14
  },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#142734',
    borderWidth: 1,
    borderColor: '#284657'
  },
  segmentButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
  },
  segmentButtonActive: {
    backgroundColor: palette.auroraGreen,
    borderColor: palette.auroraGreen
  },
  segmentText: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  segmentTextActive: {
    color: palette.textOnAurora
  },
  summaryStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16
  },
  summaryTile: {
    flexGrow: 1,
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#152734',
    borderWidth: 1,
    borderColor: '#284657'
  },
  summaryLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4
  },
  summaryValue: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700'
  },
  emptyCard: {
    backgroundColor: palette.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 14
  },
  emptyTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4
  },
  emptyText: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  attribution: {
    color: palette.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10
  }
});
