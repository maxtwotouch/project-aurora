import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo, useState } from 'react';

import { ScoreBadge } from '../components/ScoreBadge';
import { palette } from '../theme/palette';
import type { Spot, SpotScoreResult } from '../types';

type Props = {
  spots: Spot[];
  rankedSpots: SpotScoreResult[];
  onOpenSpot: (spotId: string) => void;
};

export function MapScreen({ spots, rankedSpots, onOpenSpot }: Props) {
  const [selected, setSelected] = useState<Spot | null>(null);

  const scoreBySpot = useMemo(
    () => rankedSpots.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.spotId]: s.score }), {}),
    [rankedSpots]
  );

  const navigateToSpot = (spot: Spot) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`;
    void Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.webList}>
        <Text style={styles.webTitle}>Map view is simplified on web beta.</Text>
        {spots.map((spot) => (
          <Pressable key={spot.id} style={styles.webItem} onPress={() => setSelected(spot)}>
            <View>
              <Text style={styles.webItemName}>{spot.name}</Text>
              <Text style={styles.webItemMeta}>{spot.distanceKm} km from city center</Text>
            </View>
            <ScoreBadge score={scoreBySpot[spot.id] ?? 0} />
          </Pressable>
        ))}
      </ScrollView>

      {selected ? (
        <View style={styles.sheet}>
          <View style={styles.sheetTop}>
            <View>
              <Text style={styles.sheetTitle}>{selected.name}</Text>
              <Text style={styles.sheetMeta}>Distance: {selected.distanceKm} km</Text>
              <Text style={styles.sheetMeta}>Score: {scoreBySpot[selected.id] ?? 0}</Text>
            </View>
            <ScoreBadge score={scoreBySpot[selected.id] ?? 0} />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.btn} onPress={() => onOpenSpot(selected.id)}>
              <Text style={styles.btnText}>Details</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => navigateToSpot(selected)}>
              <Text style={[styles.btnText, styles.btnTextPrimary]}>Navigate</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.night
  },
  webList: {
    padding: 14,
    gap: 10
  },
  webTitle: {
    color: palette.textSecondary,
    marginBottom: 6
  },
  webItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: palette.cardElevated,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    borderRadius: 12,
    padding: 12
  },
  webItemName: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  webItemMeta: {
    color: palette.textSecondary,
    marginTop: 3,
    fontSize: 12
  },
  sheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    backgroundColor: '#101a2fd9',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6
  },
  sheetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.textPrimary
  },
  sheetMeta: {
    marginTop: 4,
    color: palette.textSecondary,
    fontSize: 13
  },
  actions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10
  },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3c5275',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center'
  },
  btnPrimary: {
    backgroundColor: palette.auroraGreen,
    borderColor: palette.auroraGreen
  },
  btnText: {
    color: palette.textPrimary,
    fontWeight: '700'
  },
  btnTextPrimary: {
    color: palette.night
  }
});
