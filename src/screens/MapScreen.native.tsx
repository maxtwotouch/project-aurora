import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { ScoreBadge } from '../components/ScoreBadge';
import { mapDarkStyle } from '../theme/mapDarkStyle';
import { palette } from '../theme/palette';
import type { Spot, SpotScoreResult } from '../types';

type Props = {
  spots: Spot[];
  rankedSpots: SpotScoreResult[];
  onOpenSpot: (spotId: string) => void;
};

const TROMSO_CENTER = {
  latitude: 69.6492,
  longitude: 18.9553,
  latitudeDelta: 0.45,
  longitudeDelta: 0.45
};

export function MapScreen({ spots, rankedSpots, onOpenSpot }: Props) {
  const topLabelAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const [selected, setSelected] = useState<Spot | null>(null);

  const scoreBySpot = useMemo(
    () => rankedSpots.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.spotId]: s.score }), {}),
    [rankedSpots]
  );

  const navigateToSpot = (spot: Spot) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`;
    void Linking.openURL(url);
  };

  useEffect(() => {
    Animated.timing(topLabelAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true
    }).start();
  }, [topLabelAnim]);

  useEffect(() => {
    sheetAnim.setValue(0);
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true
    }).start();
  }, [selected, sheetAnim]);

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={TROMSO_CENTER} customMapStyle={mapDarkStyle}>
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.lat, longitude: spot.lon }}
            title={spot.name}
            description={`Score ${scoreBySpot[spot.id] ?? 0}`}
            onPress={() => setSelected(spot)}
          />
        ))}
      </MapView>

      <Animated.View
        style={[
          styles.topLabel,
          {
            opacity: topLabelAnim,
            transform: [
              {
                translateY: topLabelAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-10, 0]
                })
              }
            ]
          }
        ]}
      >
        <Text style={styles.topLabelEyebrow}>Map mode</Text>
        <Text style={styles.topLabelTitle}>Scout spots in driving order</Text>
      </Animated.View>

      {selected ? (
        <Animated.View
          style={[
            styles.sheet,
            {
              opacity: sheetAnim,
              transform: [
                {
                  translateY: sheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [36, 0]
                  })
                }
              ]
            }
          ]}
        >
          <View style={styles.sheetTop}>
            <View style={styles.sheetCopy}>
              <Text style={styles.sheetEyebrow}>Selected stop</Text>
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {selected.name}
              </Text>
              <Text style={styles.sheetMeta}>{selected.distanceKm} km from Tromso center</Text>
              <Text style={styles.sheetMeta}>Forecast score {scoreBySpot[selected.id] ?? 0}</Text>
            </View>
            <ScoreBadge score={scoreBySpot[selected.id] ?? 0} />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={() => onOpenSpot(selected.id)}>
              <Text style={styles.secondaryButtonText}>Details</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => navigateToSpot(selected)}>
              <Text style={styles.primaryButtonText}>Navigate</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            styles.emptySheet,
            {
              opacity: sheetAnim,
              transform: [
                {
                  translateY: sheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0]
                  })
                }
              ]
            }
          ]}
        >
          <Text style={styles.emptyTitle}>Tap a marker to inspect a viewing stop.</Text>
          <Text style={styles.emptyText}>The bottom sheet updates with distance, score, and quick actions.</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.night
  },
  map: {
    flex: 1
  },
  topLabel: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: '#10202bdc',
    borderWidth: 1,
    borderColor: '#284657'
  },
  topLabelEyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2
  },
  topLabelTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  sheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    backgroundColor: '#12232fdc',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 7
  },
  emptySheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    backgroundColor: '#12232fd0',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  emptyTitle: {
    color: palette.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4
  },
  emptyText: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  sheetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  sheetCopy: {
    flex: 1,
    minWidth: 0
  },
  sheetEyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3
  },
  sheetTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    color: palette.textPrimary
  },
  sheetMeta: {
    marginTop: 5,
    color: palette.textSecondary,
    fontSize: 14
  },
  actions: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: palette.cardBorderStrong,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#193240'
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    backgroundColor: palette.auroraGreen,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: palette.textPrimary,
    fontWeight: '700'
  },
  primaryButtonText: {
    color: palette.textOnAurora,
    fontWeight: '800'
  }
});
