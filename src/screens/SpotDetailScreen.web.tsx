import { useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { CollapsibleSection } from '../components/CollapsibleSection';
import { ScoreBadge } from '../components/ScoreBadge';
import { getSpotAccessInfo, getSpotImageUrls } from '../data/spotExtras';
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
  if (typeof score !== 'number') return '-';
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

export function SpotDetailScreen({ spot, result, forecast }: Props) {
  const imageUrls = getSpotImageUrls(spot);
  const parking = getSpotAccessInfo(spot);
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
    <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{spot.name}</Text>
      <Text style={styles.subtitle}>Detailed viewing conditions with a shorter path to the useful parts.</Text>

      <View style={styles.heroCard} onLayout={registerSection('overview')}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreCopy}>
            <Text style={styles.label}>Spot score tonight</Text>
            <Text style={styles.windowText}>
              {result ? `${formatLocalTime(result.bestWindowStart)} to ${formatLocalTime(result.bestWindowEnd)}` : 'Waiting for the next run'}
            </Text>
            <Text style={styles.heroNote}>
              {result
                ? `${trendLabel(result.trend)} with ${result.cloudCoverAtBestHour}% cloud cover at the best hour.`
                : 'Forecast metrics are still loading for this stop.'}
            </Text>
          </View>
          <View style={styles.scoreBadgeWrap}>
            <ScoreBadge score={result?.score ?? 0} size="lg" />
            <Text style={styles.chanceText}>{chanceLabel(result?.score)} chance</Text>
          </View>
        </View>

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
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>{spot.distanceKm} km</Text>
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

        <Pressable style={styles.navigateBtn} onPress={navigateToSpot}>
          <Text style={styles.navigateText}>Open navigation</Text>
        </Pressable>
      </View>

      <View onLayout={registerSection('location')}>
        <CollapsibleSection eyebrow="Position" title="Arrive at the viewing area" meta={`${spot.distanceKm} km`} defaultOpen>
          <View style={styles.mapWrap}>
            <View style={styles.webMapFallback}>
              <Text style={styles.description}>Map preview is simplified on web beta.</Text>
              <Pressable style={styles.webMapBtn} onPress={navigateToSpot}>
                <Text style={styles.webMapBtnText}>Open in Google Maps</Text>
              </Pressable>
            </View>
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
          title="Cloud cover next hours"
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
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d466b',
    marginBottom: 14
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14
  },
  scoreCopy: {
    flex: 1,
    minWidth: 0
  },
  scoreBadgeWrap: {
    alignItems: 'center',
    gap: 8
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.auroraMint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6
  },
  windowText: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6
  },
  heroNote: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  chanceText: {
    color: palette.auroraMint,
    fontSize: 13,
    fontWeight: '700'
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14
  },
  metricTile: {
    width: '48%',
    backgroundColor: '#101f38',
    borderWidth: 1,
    borderColor: '#2d466b',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  metricLabel: {
    color: palette.textMuted,
    fontSize: 11,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  metricValue: {
    color: palette.textPrimary,
    fontSize: 17,
    fontWeight: '700'
  },
  jumpCard: {
    marginTop: 14,
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
  navigateBtn: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.auroraGreen
  },
  navigateText: {
    color: palette.textOnAurora,
    fontWeight: '800'
  },
  mapWrap: {
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  webMapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0d1a30'
  },
  webMapBtn: {
    backgroundColor: '#1f324f',
    borderWidth: 1,
    borderColor: '#35527d',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  webMapBtnText: {
    color: palette.textPrimary,
    fontWeight: '700'
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
  }
});
