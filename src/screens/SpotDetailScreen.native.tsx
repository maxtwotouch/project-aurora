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

function chanceLabel(score: number | undefined): string {
  if (typeof score !== 'number') return 'Low';
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

function timeSummary(result: SpotScoreResult | undefined) {
  if (!result) return 'Waiting for the next forecast run';
  return `${formatLocalTime(result.bestWindowStart)} to ${formatLocalTime(result.bestWindowEnd)}`;
}

export function SpotDetailScreen({ spot, result, forecast }: Props) {
  const imageUrls = getSpotImageUrls(spot);
  const parking = getSpotParking(spot);

  const navigateToSpot = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`;
    void Linking.openURL(url);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
    >
      <View style={styles.atmosphere} />
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>Spot</Text>
        <Text style={styles.title}>{spot.name}</Text>
        <Text style={styles.subtitle}>
          {spot.distanceKm} km from Tromso center. Live conditions at a glance.
        </Text>

        <View style={styles.heroTop}>
          <View style={styles.heroPrimary}>
            <Text style={styles.kicker}>Best window</Text>
            <Text style={styles.windowValue}>{timeSummary(result)}</Text>
            <Text style={styles.helper}>
              {result
                ? `${trendLabel(result.trend)} conditions with ${result.cloudCoverAtBestHour}% cloud cover at the best hour.`
                : 'Forecast metrics are still settling. Pull to refresh from the main screen if needed.'}
            </Text>
          </View>
          <View style={styles.scoreWrap}>
            <ScoreBadge score={result?.score ?? 0} size="lg" />
            <Text style={styles.scoreLabel}>{chanceLabel(result?.score)} chance</Text>
          </View>
        </View>

        <View style={styles.metricsBand}>
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
            <Text style={styles.metricLabel}>Cold score</Text>
            <Text style={styles.metricValue}>{result?.coldScore ?? '-'} / 100</Text>
          </View>
        </View>

        <View style={styles.heroActions}>
          <Pressable style={styles.primaryButton} onPress={navigateToSpot}>
            <Text style={styles.primaryButtonText}>Open navigation</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Preparation</Text>
        <Text style={styles.sectionTitle}>Dress for this stop</Text>
        <Text style={styles.description}>{result?.dressAdvice ?? 'No recommendation available yet.'}</Text>
      </View>

      <View style={styles.mapCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Position</Text>
            <Text style={styles.sectionTitle}>Arrive at the viewing area</Text>
          </View>
          <Text style={styles.sectionMeta}>{spot.distanceKm} km</Text>
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
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>On site</Text>
        <Text style={styles.sectionTitle}>What this place is like</Text>
        <Text style={styles.description}>{spot.description}</Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Arrival</Text>
        <Text style={styles.sectionTitle}>Parking notes</Text>
        <Text style={styles.description}>{parking}</Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Forecast</Text>
        <Text style={styles.sectionTitle}>Cloud cover over the next hours</Text>
        {(forecast ?? []).length > 0 ? (
          (forecast ?? []).slice(0, 6).map((hour) => (
            <View key={hour.time} style={styles.hourRow}>
              <Text style={styles.hourTime}>{formatLocalTime(hour.time)}</Text>
              <Text style={styles.hourCloud}>{Math.round(hour.cloudCover)}%</Text>
            </View>
          ))
        ) : (
          <Text style={styles.description}>Hourly cloud data is not available for this spot right now.</Text>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionEyebrow}>Visual check</Text>
        <Text style={styles.sectionTitle}>Spot imagery</Text>
        {imageUrls.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
            {imageUrls.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.image} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.description}>Verified photos for this spot are coming soon.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 30,
    backgroundColor: palette.night
  },
  atmosphere: {
    position: 'absolute',
    top: -28,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#7cf2c71a'
  },
  heroCard: {
    backgroundColor: palette.nightPanel,
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 14,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 6
  },
  eyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 6
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 6
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 16
  },
  heroPrimary: {
    flex: 1,
    minWidth: 0
  },
  kicker: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4
  },
  windowValue: {
    color: palette.textPrimary,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
    marginBottom: 6
  },
  helper: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  scoreWrap: {
    alignItems: 'center',
    gap: 8
  },
  scoreLabel: {
    color: palette.auroraMint,
    fontSize: 13,
    fontWeight: '700'
  },
  metricsBand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  metricTile: {
    minWidth: 100,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: '#152835',
    borderWidth: 1,
    borderColor: '#284657'
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4
  },
  metricValue: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  heroActions: {
    marginTop: 16
  },
  primaryButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: palette.auroraGreen
  },
  primaryButtonText: {
    color: palette.textOnAurora,
    fontWeight: '800',
    fontSize: 15
  },
  sectionCard: {
    backgroundColor: palette.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 12
  },
  mapCard: {
    backgroundColor: palette.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 12
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12
  },
  sectionEyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4
  },
  sectionTitle: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 6
  },
  sectionMeta: {
    color: palette.textMuted,
    fontSize: 13,
    marginTop: 16
  },
  description: {
    color: palette.textSecondary,
    lineHeight: 22,
    fontSize: 14
  },
  mapWrap: {
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#284657'
  },
  map: {
    flex: 1
  },
  hourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#20394a'
  },
  hourTime: {
    color: palette.textPrimary,
    fontWeight: '700'
  },
  hourCloud: {
    color: palette.textSecondary,
    fontWeight: '700'
  },
  imagesRow: {
    marginTop: 4
  },
  image: {
    width: 280,
    height: 176,
    borderRadius: 16,
    marginRight: 10,
    borderWidth: 1,
    borderColor: palette.cardBorder
  }
});
