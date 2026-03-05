import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { ScoreBadge } from '../components/ScoreBadge';
import { getSpotImageUrls, getSpotParking } from '../data/spotExtras';
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
    minute: '2-digit'
  });

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

        <Text style={styles.infoLine}>
          Best window:{' '}
          {result ? `${formatLocalTime(result.bestWindowStart)}-${formatLocalTime(result.bestWindowEnd)}` : '-'}
        </Text>
        <Text style={styles.infoLine}>Cloud cover (best hour): {result?.cloudCoverAtBestHour ?? '-'}%</Text>
        <Text style={styles.infoLine}>Temp at best hour: {result?.temperatureAtBestHour ?? '-'}°C</Text>
        <Text style={styles.infoLine}>Wind at best hour: {result?.windSpeedAtBestHour ?? '-'} m/s</Text>
        <Text style={styles.infoLine}>Cold score: {result?.coldScore ?? '-'} / 100</Text>
        <Text style={styles.infoLine}>Trend: {result?.trend === 'good_now' ? 'Good now' : result?.trend === 'improving' ? 'Improving' : 'Getting worse'}</Text>
        <Text style={styles.infoLine}>Distance from Tromsø center: {spot.distanceKm} km</Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Dress Recommendation</Text>
        <Text style={styles.description}>{result?.dressAdvice ?? 'No recommendation available yet.'}</Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          pointerEvents="none"
          style={styles.map}
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

      <Text style={styles.sectionTitle}>Cloud cover next hours</Text>
      {(forecast ?? []).slice(0, 6).map((hour) => (
        <Text key={hour.time} style={styles.hourLine}>
          {formatLocalTime(hour.time)} - {Math.round(hour.cloudCover)}%
        </Text>
      ))}

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
    marginBottom: 14
  },
  heroCard: {
    backgroundColor: palette.cardElevated,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 12
  },
  sectionCard: {
    backgroundColor: palette.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 10
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.textSecondary
  },
  infoLine: {
    color: palette.textSecondary,
    marginBottom: 5
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
    lineHeight: 20
  },
  hourLine: {
    color: palette.textSecondary,
    marginBottom: 4
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
