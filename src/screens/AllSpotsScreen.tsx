import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

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
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
    >
      <Text style={styles.title}>All Spots Ranked Tonight</Text>
      <Text style={styles.subtitle}>Sorted by live probability and conditions.</Text>
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
  title: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4
  },
  subtitle: {
    color: palette.textMuted,
    marginBottom: 12
  }
});
