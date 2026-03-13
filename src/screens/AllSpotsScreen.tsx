import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SpotCard } from '../components/SpotCard';
import { palette } from '../theme/palette';
import type { Spot, SpotScoreResult } from '../types';

type Props = {
  rankedSpots: SpotScoreResult[];
  spotsById: Record<string, Spot>;
  loading: boolean;
  refresh: () => Promise<void>;
  onOpenSpot: (spotId: string) => void;
};

export function AllSpotsScreen({ rankedSpots, spotsById, loading, refresh, onOpenSpot }: Props) {
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
          Compare range, timing, and conditions before you drive.
        </Text>
      </View>

      {!loading && rankedSpots.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No ranked spots yet</Text>
          <Text style={styles.emptyText}>Pull to refresh once forecast data is available for tonight.</Text>
        </View>
      ) : null}

      {rankedSpots.map((result) => {
        const spot = spotsById[result.spotId];
        if (!spot) return null;

        return <SpotCard key={spot.id} spot={spot} result={result} onPress={() => onOpenSpot(spot.id)} />;
      })}
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
  }
});
