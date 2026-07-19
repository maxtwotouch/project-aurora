import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { CollapsibleSection } from '../components/CollapsibleSection';
import { HourlyTimeline } from '../components/HourlyTimeline';
import { ScoreBadge } from '../components/ScoreBadge';
import { SpotHeroImage } from '../components/SpotHeroImage';
import { DataBand } from '../components/tonight/DataBand';
import { getSpotAccessInfo, getSpotImages } from '../data/spotExtras';
import { getLocalizedSpotDescription } from '../data/spotDescriptions';
import { getCurrentLanguage } from '../i18n';
import { useTranslation } from '../i18n/useTranslation';
import { trackUnlessPreview } from '../preview/trackUnlessPreview';
import { dressLevelFromColdScore } from '../scoring/score';
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

function trendLabelKey(trend: SpotScoreResult['trend'] | undefined): string {
  if (trend === 'good_now') return 'common.trend.goodNow';
  if (trend === 'improving') return 'common.trend.improving';
  return 'common.trend.limited';
}

function chanceLabelKey(score: number | undefined): string | null {
  if (typeof score !== 'number') return null;
  if (score >= 70) return 'common.chance.high';
  if (score >= 45) return 'common.chance.medium';
  return 'common.chance.low';
}

function clearnessTone(clearness: number): string {
  if (clearness >= 65) return palette.auroraGreen;
  if (clearness >= 30) return palette.warning;
  return palette.danger;
}

// Uses the shared threshold helper from src/scoring/score.ts (also used by
// SpotDetailScreen.native.tsx) so the >=80/60/40 cold-score bands live in one
// place; only the i18n key mapping lives here at the display layer.
function dressAdviceKeyFromColdScore(coldScore: number): string {
  return `spotDetail.dressAdvice.${dressLevelFromColdScore(coldScore)}`;
}

export function SpotDetailScreen({ spot, result, forecast }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const images = getSpotImages(spot);
  const access = getSpotAccessInfo(spot);
  const forecastRows = (forecast ?? []).slice(0, 10);
  const scrollRef = useRef<ScrollView | null>(null);
  // See SpotDetailScreen.native.tsx for the fuller rationale -- same
  // first-image-only, fail-open-to-plain-header behavior on both variants.
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const showPhotoHero = images.length > 0 && !heroImageFailed;
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
    trackUnlessPreview('spot_view', spot.id);
  }, [spot.id]);

  const navigateToSpot = () => {
    trackUnlessPreview('navigate_pressed', spot.id);
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
  const chanceKey = chanceLabelKey(result?.score);

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.container, isWide ? styles.containerWide : null]}
    >
      {!showPhotoHero ? (
        <>
          <Text style={styles.eyebrow}>{t('spotDetail.eyebrow')}</Text>
          <Text style={styles.title}>{spot.name}</Text>
          <Text style={styles.subtitle}>{t('common.distanceTromsoCenter', { km: spot.distanceKm })}</Text>
        </>
      ) : null}

      <View style={styles.heroCard} onLayout={registerSection('overview')}>
        {showPhotoHero ? (
          <SpotHeroImage
            image={images[0]}
            name={spot.name}
            score={result?.score}
            onError={() => setHeroImageFailed(true)}
          />
        ) : null}

        <View style={[styles.heroCardBody, isWide ? styles.heroCardBodyWide : null]}>
          <View style={styles.scoreRow}>
            <View style={styles.scoreCopy}>
              <Text style={styles.label}>{t('common.bestWindow')}</Text>
              <Text style={styles.windowText}>
                {result
                  ? t('tonight.windowRange', { start: formatLocalTime(result.bestWindowStart), end: formatLocalTime(result.bestWindowEnd) })
                  : t('spotDetail.waitingNextRunWeb')}
              </Text>
              <Text style={styles.heroNote}>
                {result
                  ? t('spotDetail.trendCloudSummary', { trend: t(trendLabelKey(result.trend)), cloud: result.cloudCoverAtBestHour })
                  : t('spotDetail.forecastLoadingWeb')}
              </Text>
            </View>
            <View style={styles.scoreBadgeWrap}>
              <ScoreBadge score={result?.score ?? 0} size="lg" />
              <Text style={styles.chanceText}>
                {t('spotDetail.chanceSuffix', { chance: chanceKey ? t(chanceKey) : '-' })}
              </Text>
            </View>
          </View>

          <DataBand
            items={[
              { label: t('common.cloud'), value: `${result?.cloudCoverAtBestHour ?? '-'}%` },
              { label: t('spotDetail.band.temp'), value: `${result?.temperatureAtBestHour ?? '-'}°C` },
              { label: t('spotDetail.band.wind'), value: `${result?.windSpeedAtBestHour ?? '-'} m/s` },
              { label: t('common.distance'), value: t('common.kmValue', { km: spot.distanceKm }) }
            ]}
            style={styles.dataBandOverride}
            itemStyle={styles.bandItemOverride}
            dividerStyle={styles.bandDividerOverride}
            labelStyle={styles.bandLabelOverride}
            valueStyle={styles.bandValueOverride}
          />

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
            <JumpButton label={t('spotDetail.jump.location')} onPress={() => jumpTo('location')} />
            <JumpButton label={t('spotDetail.jump.access')} onPress={() => jumpTo('access')} />
            <JumpButton label={t('spotDetail.jump.forecast')} onPress={() => jumpTo('forecast')} />
            <JumpButton label={t('spotDetail.jump.visuals')} onPress={() => jumpTo('visuals')} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.openNavigationTo', { name: spot.name })}
            style={({ pressed, focused }: WebPressableState) => [
              styles.navigateBtn,
              focused ? styles.focusRing : null,
              pressed ? styles.buttonPressed : null
            ]}
            onPress={navigateToSpot}
          >
            <Text style={styles.navigateText}>{t('spotDetail.openNavigation')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={isWide ? styles.sectionsWide : null}>
        <View onLayout={registerSection('location')} style={isWide ? styles.sectionColumn : null}>
          <CollapsibleSection
            eyebrow={t('spotDetail.position.eyebrow')}
            title={t('spotDetail.position.title')}
            meta={t('common.kmValue', { km: spot.distanceKm })}
            defaultOpen
          >
            <View style={styles.mapWrap}>
              <View style={styles.webMapFallback}>
                <Text style={styles.description}>{t('spotDetail.mapPreviewSimplified')}</Text>
                <Pressable
                  accessibilityRole="button"
                  style={({ focused }: WebPressableState) => [styles.webMapBtn, focused ? styles.focusRing : null]}
                  onPress={navigateToSpot}
                >
                  <Text style={styles.webMapBtnText}>{t('spotDetail.openInGoogleMaps')}</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.description}>{getLocalizedSpotDescription(spot, getCurrentLanguage())}</Text>
          </CollapsibleSection>

          <View onLayout={registerSection('access')}>
            <CollapsibleSection eyebrow={t('spotDetail.arrival.eyebrow')} title={t('spotDetail.arrival.title')} defaultOpen={false}>
              <Text style={styles.blockTitle}>{t('common.parking')}</Text>
              <Text style={styles.description}>{access.parking.text}</Text>
              {access.parking.verified ? <Text style={styles.verifiedNote}>{t('spotDetail.verifiedKommune')}</Text> : null}
              {access.bus ? (
                <>
                  <Text style={styles.blockTitle}>{t('spotDetail.busStopLabel')}</Text>
                  <Text style={styles.description}>{access.bus.text}</Text>
                  {access.bus.verified ? <Text style={styles.verifiedNote}>{t('spotDetail.verifiedKommune')}</Text> : null}
                </>
              ) : null}
              <Text style={styles.blockTitle}>{t('spotDetail.dressRecommendationLabel')}</Text>
              <Text style={styles.description}>
                {typeof result?.coldScore === 'number' ? t(dressAdviceKeyFromColdScore(result.coldScore)) : t('spotDetail.noDressRecommendation')}
              </Text>
            </CollapsibleSection>
          </View>
        </View>

        <View style={isWide ? styles.sectionColumn : null}>
          <View onLayout={registerSection('forecast')}>
            <CollapsibleSection
              eyebrow={t('spotDetail.jump.forecast')}
              title={t('spotDetail.cloudForecastTitleWeb')}
              meta={forecastRows.length > 0 ? t('spotDetail.hoursCount', { count: forecastRows.length }) : t('spotDetail.noHourlyData')}
              defaultOpen={false}
            >
              {forecastRows.length > 0 ? (
                <>
                  <HourlyTimeline
                    points={forecastRows.map((hour) => ({ time: hour.time, value: 100 - hour.cloudCover }))}
                    toneFor={clearnessTone}
                    accessibilityLabel={t('spotDetail.hourlyClearnessA11y')}
                  />
                  <Text style={styles.timelineCaption}>{t('spotDetail.timelineCaption')}</Text>
                </>
              ) : (
                <Text style={styles.description}>{t('spotDetail.noCloudData')}</Text>
              )}
            </CollapsibleSection>
          </View>

          <View onLayout={registerSection('visuals')}>
            <CollapsibleSection
              eyebrow={t('spotDetail.visuals.eyebrow')}
              title={t('spotDetail.visuals.title')}
              meta={images.length > 0 ? t('spotDetail.photosCount', { count: images.length }) : t('spotDetail.noPhotosYet')}
              defaultOpen={false}
            >
              {images.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
                  {images.map((image) => (
                    <View key={image.url} style={styles.imageTile}>
                      <Image source={{ uri: image.url }} style={styles.image} resizeMode="cover" />
                      <Text style={styles.imageCredit} numberOfLines={1}>
                        {t('spotDetail.photoCredit', { author: image.author, license: image.license })}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.description}>{t('spotDetail.noPhotosText')}</Text>
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
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: space.sm,
    ...elevation.sm
  },
  // See heroCardBody in SpotDetailScreen.native.tsx -- same reasoning:
  // padding lives here instead of on heroCard so a photo hero can bleed to
  // the card's own edges above this block.
  heroCardBody: {
    padding: space.md,
    gap: space.md
  },
  heroCardBodyWide: {
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
  // DataBand override styles: DataBand's own defaults match TonightScreen's
  // hero band (gap: space.lg, minWidth: 76, paddingLeft: space.lg, a tighter
  // eyebrow letterSpacing, and subheading-sized values). These overrides
  // reproduce this screen's own historical dataBand/bandItem values exactly
  // (previously duplicated verbatim in SpotDetailScreen.native.tsx) so
  // adopting the shared component here is pixel-equivalent to the markup it
  // replaces.
  dataBandOverride: {
    gap: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.borderHairline
  },
  bandItemOverride: {
    minWidth: 80
  },
  bandDividerOverride: {
    paddingLeft: space.md
  },
  bandLabelOverride: {
    letterSpacing: typography.eyebrow.letterSpacing
  },
  bandValueOverride: {
    lineHeight: typography.bodyStrong.lineHeight
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
  imageTile: {
    width: 220,
    marginRight: space.xs
  },
  image: {
    width: 220,
    height: 150,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  imageCredit: {
    ...typography.caption,
    color: palette.textMuted,
    marginTop: 3
  }
});
