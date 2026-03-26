import { useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { CollapsibleSection } from '../components/CollapsibleSection';
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

type SectionKey = 'overview' | 'location' | 'access' | 'forecast' | 'visuals';

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
  const forecastRows = (forecast ?? []).slice(0, 6);
  const scrollRef = useRef<ScrollView | null>(null);
  const [sectionOffsets, setSectionOffsets] = useState<Record<SectionKey, number>>({
    overview: 0,
    location: 0,
    access: 0,
    forecast: 0,
    visuals: 0
  });

  const navigateToSpot = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`;
    void Linking.openURL(url);
  };

  const registerSection = (key: SectionKey) => (event: LayoutChangeEvent) => {
    const { y } = event.nativeEvent.layout;
    setSectionOffsets((current) => ({ ...current, [key]: y }));
  };

  const jumpTo = (key: SectionKey) => {
    scrollRef.current?.scrollTo({ y: Math.max(sectionOffsets[key] - 12, 0), animated: true });
  };

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
    >
      <View style={styles.atmosphere} />
      <View style={styles.heroCard} onLayout={registerSection('overview')}>
        <Text style={styles.eyebrow}>Spot</Text>
        <Text style={styles.title}>{spot.name}</Text>
        <Text style={styles.subtitle}>{spot.distanceKm} km from Tromso center. The essentials first.</Text>

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

        <View style={styles.jumpCard}>
          <Text style={styles.jumpTitle}>On this page</Text>
          <View style={styles.jumpRow}>
            <JumpButton label="Location" onPress={() => jumpTo('location')} />
            <JumpButton label="Access" onPress={() => jumpTo('access')} />
            <JumpButton label="Forecast" onPress={() => jumpTo('forecast')} />
            <JumpButton label="Visuals" onPress={() => jumpTo('visuals')} />
          </View>
        </View>

        <View style={styles.heroActions}>
          <Pressable style={styles.primaryButton} onPress={navigateToSpot}>
            <Text style={styles.primaryButtonText}>Open navigation</Text>
          </Pressable>
        </View>
      </View>

      <View onLayout={registerSection('location')}>
        <CollapsibleSection eyebrow="Position" title="Arrive at the viewing area" meta={`${spot.distanceKm} km`} defaultOpen>
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
          <Text style={styles.description}>{spot.description}</Text>
        </CollapsibleSection>
      </View>

      <View onLayout={registerSection('access')}>
        <CollapsibleSection eyebrow="Arrival" title="Parking and prep" defaultOpen={false}>
          <Text style={styles.blockTitle}>Parking</Text>
          <Text style={styles.description}>{parking}</Text>
          <Text style={styles.blockTitle}>Dress recommendation</Text>
          <Text style={styles.description}>{result?.dressAdvice ?? 'No recommendation available yet.'}</Text>
        </CollapsibleSection>
      </View>

      <View onLayout={registerSection('forecast')}>
        <CollapsibleSection
          eyebrow="Forecast"
          title="Cloud cover over the next hours"
          meta={forecastRows.length > 0 ? `${forecastRows.length} hours` : 'No hourly data'}
          defaultOpen={false}
        >
          {forecastRows.length > 0 ? (
            forecastRows.map((hour) => (
              <View key={hour.time} style={styles.hourRow}>
                <Text style={styles.hourTime}>{formatLocalTime(hour.time)}</Text>
                <Text style={styles.hourCloud}>{Math.round(hour.cloudCover)}%</Text>
              </View>
            ))
          ) : (
            <Text style={styles.description}>Hourly cloud data is not available for this spot right now.</Text>
          )}
        </CollapsibleSection>
      </View>

      <View onLayout={registerSection('visuals')}>
        <CollapsibleSection
          eyebrow="Visual check"
          title="Spot imagery"
          meta={imageUrls.length > 0 ? `${imageUrls.length} photo${imageUrls.length === 1 ? '' : 's'}` : 'No photos yet'}
          defaultOpen={false}
        >
          {imageUrls.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
              {imageUrls.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.image} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.description}>Verified photos for this spot are coming soon.</Text>
          )}
        </CollapsibleSection>
      </View>
    </ScrollView>
  );
}

function JumpButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.jumpButton, pressed ? styles.jumpButtonPressed : null]} onPress={onPress}>
      <Text style={styles.jumpButtonText}>{label}</Text>
    </Pressable>
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
  jumpCard: {
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#12263a',
    borderWidth: 1,
    borderColor: '#29475f'
  },
  jumpTitle: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10
  },
  jumpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  jumpButton: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#17303c',
    borderWidth: 1,
    borderColor: '#2e5667'
  },
  jumpButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
  },
  jumpButtonText: {
    color: palette.auroraMint,
    fontSize: 13,
    fontWeight: '700'
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
  mapWrap: {
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12
  },
  map: {
    flex: 1
  },
  blockTitle: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 6
  },
  description: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  hourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#284657'
  },
  hourTime: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  },
  hourCloud: {
    color: palette.auroraMint,
    fontSize: 14,
    fontWeight: '700'
  },
  imagesRow: {
    marginTop: 4
  },
  image: {
    width: 220,
    height: 150,
    borderRadius: 14,
    marginRight: 10,
    borderWidth: 1,
    borderColor: palette.cardBorder
  }
});
