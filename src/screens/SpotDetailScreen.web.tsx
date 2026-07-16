import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { track } from '../analytics/events';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { HourlyTimeline } from '../components/HourlyTimeline';
import { ScoreBadge } from '../components/ScoreBadge';
import { getSpotAccessInfo, getSpotImageUrls } from '../data/spotExtras';
import { palette } from '../theme/palette';
import { elevation, radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';
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

function clearnessTone(clearness: number): string {
  if (clearness >= 65) return palette.auroraGreen;
  if (clearness >= 30) return palette.warning;
  return palette.danger;
}

export function SpotDetailScreen({ spot, result, forecast }: Props) {
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const imageUrls = getSpotImageUrls(spot);
  const access = getSpotAccessInfo(spot);
  const forecastRows = (forecast ?? []).slice(0, 10);
  const scrollRef = useRef<ScrollView | null>(null);
  const [sectionOffsets, setSectionOffsets] = useState<Record<SectionKey, number>>({
    overview: 0,
    location: 0,
    access: 0,
    forecast: 0,
    visuals: 0
  });

  useEffect(() => {
    // Only re-fires if the viewed spot itself changes (e.g. navigating from
    // one spot's detail screen to another without unmounting).
    track('spot_view', spot.id);
  }, [spot.id]);

  const navigateToSpot = () => {
    track('navigate_pressed', spot.id);
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

  const hasVerifiedAccess = Boolean(spot.parking || spot.busStop);

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.container, isWide ? styles.containerWide : null]}
    >
      <Text style={styles.eyebrow}>Spot</Text>
      <Text style={styles.title}>{spot.name}</Text>
      <Text style={styles.subtitle}>{spot.distanceKm} km from Tromso center</Text>

      <View style={[styles.heroCard, isWide ? styles.heroCardWide : null]} onLayout={registerSection('overview')}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreCopy}>
            <Text style={styles.label}>Best window</Text>
            <Text style={styles.windowText}>
              {result ? `${formatLocalTime(result.bestWindowStart)} to ${formatLocalTime(result.bestWindowEnd)}` : 'Waiting for the next run'}
            </Text>
            <Text style={styles.heroNote}>
              {result
                ? `${trendLabel(result.trend)}, ${result.cloudCoverAtBestHour}% cloud cover at the best hour.`
                : 'Forecast metrics are still loading for this stop.'}
            </Text>
          </View>
          <View style={styles.scoreBadgeWrap}>
            <ScoreBadge score={result?.score ?? 0} size="lg" />
            <Text style={styles.chanceText}>{chanceLabel(result?.score)} chance</Text>
          </View>
        </View>

        <View style={styles.dataBand}>
          <View style={styles.bandItem}>
            <Text style={styles.bandLabel}>Cloud</Text>
            <Text style={styles.bandValue}>{result?.cloudCoverAtBestHour ?? '-'}%</Text>
          </View>
          <View style={[styles.bandItem, styles.bandItemDivided]}>
            <Text style={styles.bandLabel}>Temp</Text>
            <Text style={styles.bandValue}>{result?.temperatureAtBestHour ?? '-'}°C</Text>
          </View>
          <View style={[styles.bandItem, styles.bandItemDivided]}>
            <Text style={styles.bandLabel}>Wind</Text>
            <Text style={styles.bandValue}>{result?.windSpeedAtBestHour ?? '-'} m/s</Text>
          </View>
          <View style={[styles.bandItem, styles.bandItemDivided]}>
            <Text style={styles.bandLabel}>Distance</Text>
            <Text style={styles.bandValue}>{spot.distanceKm} km</Text>
          </View>
        </View>

        {hasVerifiedAccess ? (
          <View style={styles.accessRow}>
            {spot.busStop ? (
              <View style={styles.accessChip}>
                <Ionicons name="bus-outline" size={13} color={palette.auroraIce} />
                <Text style={styles.accessChipText}>{spot.busStop}</Text>
              </View>
            ) : null}
            {spot.parking ? (
              <View style={styles.accessChip}>
                <Text style={styles.accessChipGlyph}>P</Text>
                <Text style={styles.accessChipText}>{spot.parking}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.jumpRow}>
          <JumpButton label="Location" onPress={() => jumpTo('location')} />
          <JumpButton label="Access" onPress={() => jumpTo('access')} />
          <JumpButton label="Forecast" onPress={() => jumpTo('forecast')} />
          <JumpButton label="Visuals" onPress={() => jumpTo('visuals')} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open navigation to ${spot.name}`}
          style={({ pressed, focused }: WebPressableState) => [
            styles.navigateBtn,
            focused ? styles.focusRing : null,
            pressed ? styles.buttonPressed : null
          ]}
          onPress={navigateToSpot}
        >
          <Text style={styles.navigateText}>Open navigation</Text>
        </Pressable>
      </View>

      <View style={isWide ? styles.sectionsWide : null}>
        <View onLayout={registerSection('location')} style={isWide ? styles.sectionColumn : null}>
          <CollapsibleSection eyebrow="Position" title="Arrive at the viewing area" meta={`${spot.distanceKm} km`} defaultOpen>
            <View style={styles.mapWrap}>
              <View style={styles.webMapFallback}>
                <Text style={styles.description}>Map preview is simplified on web beta.</Text>
                <Pressable
                  accessibilityRole="button"
                  style={({ focused }: WebPressableState) => [styles.webMapBtn, focused ? styles.focusRing : null]}
                  onPress={navigateToSpot}
                >
                  <Text style={styles.webMapBtnText}>Open in Google Maps</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.description}>{spot.description}</Text>
          </CollapsibleSection>

          <View onLayout={registerSection('access')}>
            <CollapsibleSection eyebrow="Arrival" title="Parking and prep" defaultOpen={false}>
              <Text style={styles.blockTitle}>Parking</Text>
              <Text style={styles.description}>{access.parking.text}</Text>
              {access.parking.verified ? <Text style={styles.verifiedNote}>Verified with Tromsø kommune.</Text> : null}
              {access.bus ? (
                <>
                  <Text style={styles.blockTitle}>Bus stop</Text>
                  <Text style={styles.description}>{access.bus.text}</Text>
                  {access.bus.verified ? <Text style={styles.verifiedNote}>Verified with Tromsø kommune.</Text> : null}
                </>
              ) : null}
              <Text style={styles.blockTitle}>Dress recommendation</Text>
              <Text style={styles.description}>{result?.dressAdvice ?? 'No recommendation available yet.'}</Text>
            </CollapsibleSection>
          </View>
        </View>

        <View style={isWide ? styles.sectionColumn : null}>
          <View onLayout={registerSection('forecast')}>
            <CollapsibleSection
              eyebrow="Forecast"
              title="Cloud cover next hours"
              meta={forecastRows.length > 0 ? `${forecastRows.length} hours` : 'No hourly data'}
              defaultOpen={false}
            >
              {forecastRows.length > 0 ? (
                <>
                  <HourlyTimeline
                    points={forecastRows.map((hour) => ({ time: hour.time, value: 100 - hour.cloudCover }))}
                    toneFor={clearnessTone}
                    accessibilityLabel="Hourly sky clearness for this spot"
                  />
                  <Text style={styles.timelineCaption}>Taller, brighter bars mean clearer sky.</Text>
                </>
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
        </View>
      </View>
    </ScrollView>
  );
}

function JumpButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      style={({ pressed, focused }: WebPressableState) => [
        styles.jumpButton,
        focused ? styles.focusRing : null,
        pressed ? styles.buttonPressed : null
      ]}
      onPress={onPress}
    >
      <Text style={styles.jumpButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space.md,
    paddingBottom: space.xxl,
    backgroundColor: palette.night
  },
  containerWide: {
    maxWidth: 1080,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.xl
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  title: {
    ...typography.title,
    color: palette.textPrimary,
    marginTop: 2
  },
  subtitle: {
    ...typography.body,
    color: palette.textMuted,
    marginBottom: space.md
  },
  heroCard: {
    backgroundColor: palette.nightPanel,
    borderRadius: radius.xl,
    padding: space.md,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: space.sm,
    gap: space.md,
    ...elevation.sm
  },
  heroCardWide: {
    padding: space.lg
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm
  },
  scoreCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  scoreBadgeWrap: {
    alignItems: 'center',
    gap: space.xxs
  },
  label: {
    ...typography.eyebrow,
    fontSize: 10,
    color: palette.textMuted
  },
  windowText: {
    ...typography.heading,
    color: palette.textPrimary
  },
  heroNote: {
    ...typography.body,
    color: palette.textSecondary
  },
  chanceText: {
    ...typography.caption,
    color: palette.auroraMint,
    fontWeight: '700'
  },
  dataBand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.borderHairline
  },
  bandItem: {
    minWidth: 80,
    gap: 3
  },
  bandItemDivided: {
    borderLeftWidth: 1,
    borderLeftColor: palette.borderHairline,
    paddingLeft: space.md
  },
  bandLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    color: palette.textMuted
  },
  bandValue: {
    ...typography.bodyStrong,
    fontSize: 17,
    color: palette.textPrimary
  },
  accessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs
  },
  accessChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.xs,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceSunkenAlt,
    borderWidth: 1,
    borderColor: palette.borderHairline
  },
  accessChipGlyph: {
    ...typography.caption,
    fontWeight: '800',
    color: palette.auroraIce
  },
  accessChipText: {
    ...typography.caption,
    color: palette.textSecondary
  },
  jumpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs
  },
  jumpButton: {
    minHeight: 40,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong
  },
  jumpButtonText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.auroraMint
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any,
  navigateBtn: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.auroraGreen
  },
  navigateText: {
    ...typography.bodyStrong,
    color: palette.textOnAurora
  },
  sectionsWide: {
    flexDirection: 'row',
    gap: space.lg,
    alignItems: 'flex-start'
  },
  sectionColumn: {
    flex: 1,
    minWidth: 0
  },
  mapWrap: {
    height: 180,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  webMapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    backgroundColor: palette.surfaceOverlay
  },
  webMapBtn: {
    backgroundColor: palette.chipSurface,
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong,
    borderRadius: radius.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm
  },
  webMapBtnText: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  blockTitle: {
    ...typography.subheading,
    fontSize: 15,
    color: palette.textPrimary,
    marginTop: space.xxs,
    marginBottom: space.xxs
  },
  description: {
    ...typography.body,
    color: palette.textSecondary
  },
  verifiedNote: {
    ...typography.caption,
    color: palette.textMuted,
    marginTop: 2
  },
  timelineCaption: {
    ...typography.caption,
    color: palette.textMuted,
    marginTop: space.xs
  },
  imagesRow: {
    marginTop: 4
  },
  image: {
    width: 220,
    height: 150,
    borderRadius: radius.md,
    marginRight: space.xs,
    borderWidth: 1,
    borderColor: palette.cardBorder
  }
});
