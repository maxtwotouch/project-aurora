import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { ScoreBadge } from '../components/ScoreBadge';
import { getSpotImageUrls, getSpotParking } from '../data/spotExtras';
import { mapDarkStyle } from '../theme/mapDarkStyle';
import { palette } from '../theme/palette';
import type { HourlyForecast, Spot, SpotScoreResult } from '../types';

type Props = {
  spot: Spot;
  result: SpotScoreResult | undefined;
  forecast: HourlyForecast[] | undefined;
};

const formatLocalTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

function trendLabel(trend: SpotScoreResult['trend'] | undefined): string {
  if (trend === 'good_now') return 'Good now';
  if (trend === 'improving') return 'Better later';
  return 'Limited tonight';
}

export function SpotDetailScreen({ spot, result, forecast }: Props) {
  const imageUrls = getSpotImageUrls(spot);
  const parking = getSpotParking(spot);

  const navigateToSpot = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`;
    void Linking.openURL(url);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{spot.name}</Text>
      <Text style={styles.subtitle}>Detailed viewing conditions</Text>

      <View style={styles.heroCard}>
        <View style={styles.scoreRow}>
          <Text style={styles.label}>Spot score tonight</Text>
          <ScoreBadge score={result?.score ?? 0} size="lg" />
        </View>

        <Text style={styles.windowText}>
          Best window: {result ? `${formatLocalTime(result.bestWindowStart)}-${formatLocalTime(result.bestWindowEnd)}` : '-'}
        </Text>

        <View style={styles.metricsGrid}>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Cloud</Text>
            <Text style={styles.metricValue}>{result?.cloudCoverAtBestHour ?? '-'}%</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Temp</Text>
            <Text style={styles.metricValue}>{result?.temperatureAtBestHour ?? '-'}°C</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Wind</Text>
            <Text style={styles.metricValue}>{result?.windSpeedAtBestHour ?? '-'} m/s</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricLabel}>Cold Score</Text>
            <Text style={styles.metricValue}>{result?.coldScore ?? '-'} / 100</Text>
          </View>
        </View>

        <View style={styles.inlineRow}>
          <Text style={styles.inlineLabel}>Trend</Text>
          <Text style={styles.inlineValue}>{trendLabel(result?.trend)}</Text>
        </View>
        <View style={styles.inlineRow}>
          <Text style={styles.inlineLabel}>Distance</Text>
          <Text style={styles.inlineValue}>{spot.distanceKm} km from city center</Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Dress Recommendation</Text>
        <Text style={styles.description}>{result?.dressAdvice ?? 'No recommendation available yet.'}</Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          pointerEvents="none"
          style={styles.map}
          customMapStyle={mapDarkStyle}
          initialRegion={{
            latitude: spot.lat,
            longitude: spot.lon,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08
          }}
        >
          <Marker coordinate={{ latitude: spot.lat, longitude: spot.lon }} title={spot.name} />
        </MapView>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.description}>{spot.description}</Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Parking</Text>
        <Text style={styles.description}>{parking}</Text>
      </View>

      <Text style={styles.sectionTitle}>Spot Images</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
        {imageUrls.map((url) => (
          <Image key={url} source={{ uri: url }} style={styles.image} resizeMode="cover" />
        ))}
      </ScrollView>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Cloud Cover Next Hours</Text>
        {(forecast ?? []).slice(0, 6).map((hour) => (
          <View key={hour.time} style={styles.hourRow}>
            <Text style={styles.hourTime}>{formatLocalTime(hour.time)}</Text>
            <Text style={styles.hourCloud}>{Math.round(hour.cloudCover)}%</Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.navigateBtn} onPress={navigateToSpot}>
        <Text style={styles.navigateText}>Navigate</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 30,
    backgroundColor: palette.night
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 2
  },
  subtitle: {
    color: palette.textMuted,
    marginBottom: 16,
    fontSize: 14
  },
  heroCard: {
    backgroundColor: '#0d1a30',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d466b',
    marginBottom: 14
  },
  sectionCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 12
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.textSecondary
  },
  windowText: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10
  },
  metricTile: {
    width: '48%',
    backgroundColor: '#101f38',
    borderWidth: 1,
    borderColor: '#2d466b',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 11,
    marginBottom: 4
  },
  metricValue: {
    color: palette.textPrimary,
    fontSize: 17,
    fontWeight: '700'
  },
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  inlineLabel: {
    color: palette.textSecondary,
    fontSize: 14
  },
  inlineValue: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  },
  mapWrap: {
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  map: {
    flex: 1
  },
  sectionTitle: {
    marginTop: 2,
    marginBottom: 6,
    fontSize: 16,
    fontWeight: '700',
    color: palette.textPrimary
  },
  description: {
    color: palette.textSecondary,
    lineHeight: 21,
    fontSize: 14
  },
  hourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1c2d49'
  },
  hourTime: {
    color: palette.textPrimary,
    fontWeight: '600'
  },
  hourCloud: {
    color: palette.textSecondary,
    fontWeight: '600'
  },
  imagesRow: {
    marginBottom: 8
  },
  image: {
    width: 260,
    height: 160,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  navigateBtn: {
    marginTop: 18,
    backgroundColor: palette.auroraGreen,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 5
  },
  navigateText: {
    color: palette.night,
    fontWeight: '800'
  }
});
