import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { DataQualityBanner } from '../components/DataQualityBanner';
import { HourlyTimeline } from '../components/HourlyTimeline';
import { SpotCard } from '../components/SpotCard';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { elevation, motion, radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';
import type { AppDataQuality, AuroraLevel, DarknessSeasonState, GeneralForecastScore, KpTrend, Spot, SpotScoreResult } from '../types';

type Props = {
  onOpenSpot: (spotId: string) => void;
  loading: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
  dataQuality: AppDataQuality;
  kp: KpTrend;
  topSpots: SpotScoreResult[];
  closeSpots: SpotScoreResult[];
  spotsById: Record<string, Spot>;
  tonightScore: GeneralForecastScore | null;
  tomorrowScore: GeneralForecastScore | null;
  sightingPossibleFrom: string | null;
  darkness: DarknessSeasonState | null;
  level: AuroraLevel;
  refresh: () => Promise<void>;
};

function recommendationKeyFromLevel(level: AuroraLevel): string {
  if (level === 'great') return 'tonight.recommendation.great';
  if (level === 'possible') return 'tonight.recommendation.possible';
  return 'tonight.recommendation.low';
}

// GeneralForecastScore['chance'] is produced upstream (useForecast.ts) as
// the literal English words 'High'/'Medium'/'Low' -- map them back to
// translation keys here rather than changing that shared type.
function chanceValueToKey(chance: 'High' | 'Medium' | 'Low'): string {
  if (chance === 'High') return 'common.chance.high';
  if (chance === 'Medium') return 'common.chance.medium';
  return 'common.chance.low';
}

// KpTrend['dailyOutlook'][number]['label'] is produced upstream (src/api/kp.ts)
// as the literal English words 'Today'/'Tomorrow'/'Day 3'.
function outlookDayLabelKey(label: string): string {
  if (label === 'Today') return 'tonight.outlook.dayLabels.today';
  if (label === 'Tomorrow') return 'tonight.outlook.dayLabels.tomorrow';
  return 'tonight.outlook.dayLabels.day3';
}

const formatLocalTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

const formatUpdatedAt = formatLocalTime;

// darkness.seasonReturns is an ISO YYYY-MM-DD date (no time-of-day, no
// timezone conversion needed -- it's a calendar date, not an instant).
// Anchoring to local noon avoids any risk of the date shifting a day
// backward/forward under toLocaleDateString in edge-case timezones.
const formatSeasonReturnsDate = (isoDate: string, locale: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(locale, { month: 'long', day: 'numeric' });

type DecisionKey = 'goNow' | 'wait' | 'bestLater' | 'laterTonight';

function whyTitleKeyFromScore(score: number): string {
  if (score >= 70) return 'tonight.why.worthIt';
  if (score >= 45) return 'tonight.why.needsTiming';
  return 'tonight.why.difficult';
}

function chanceKeyFromScore(score: number): string {
  if (score >= 70) return 'common.chance.high';
  if (score >= 45) return 'common.chance.medium';
  return 'common.chance.low';
}

function decisionKey(score: number, isDaytimeNow: boolean, bestCloudCover?: number): DecisionKey {
  if (isDaytimeNow) return 'laterTonight';
  if (typeof bestCloudCover === 'number' && bestCloudCover > 80) return 'bestLater';
  if (score >= 65) return 'goNow';
  if (score >= 40) return 'wait';
  return 'bestLater';
}

function decisionStyle(label: DecisionKey) {
  if (label === 'goNow') {
    return { bg: palette.successSurface, border: palette.auroraGreen, text: palette.auroraMint };
  }
  if (label === 'laterTonight') {
    return { bg: palette.infoSurface, border: palette.auroraBlue, text: palette.textOnInfoSurface };
  }
  if (label === 'wait') {
    return { bg: palette.warningSurface, border: palette.warning, text: palette.textOnWarningSurface };
  }
  return { bg: palette.dangerSurface, border: palette.danger, text: palette.textOnDangerSurface };
}

function isLikelyDaytime(now: Date): boolean {
  const hour = now.getHours();
  return hour >= 8 && hour < 17;
}

function toneColor(score: number): string {
  if (score >= 70) return palette.auroraMint;
  if (score >= 45) return palette.warning;
  return palette.danger;
}

function scoreTone(score: number): string {
  if (score >= 70) return palette.auroraGreen;
  if (score >= 45) return palette.warning;
  return palette.danger;
}

export function TonightScreen({
  onOpenSpot,
  loading,
  error,
  lastUpdatedAt,
  dataQuality,
  kp,
  topSpots,
  closeSpots,
  spotsById,
  tonightScore,
  tomorrowScore,
  sightingPossibleFrom,
  darkness,
  level,
  refresh
}: Props) {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<any>();
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width >= 860;
  const heroAnim = useRef(new Animated.Value(0)).current;
  const secondaryAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const bestSpot = topSpots[0];
  const previewTopSpots = topSpots.slice(0, 2);
  const previewCloseSpots = closeSpots.slice(0, 2);
  const isDaytimeNow = isLikelyDaytime(new Date());
  const tonightScoreValue = tonightScore?.score ?? 0;
  const decision = decisionKey(tonightScoreValue, isDaytimeNow, bestSpot?.cloudCoverAtBestHour);
  const decisionColors = decisionStyle(decision);
  const bestSpotData = bestSpot ? spotsById[bestSpot.spotId] : undefined;
  const seasonClosed = darkness?.seasonClosed ?? false;
  // sightingPossibleFrom is derived from MET's sunset API and is always null
  // during polar day anyway (there's no sunset), so this would naturally
  // resolve to null when seasonClosed -- but that's accidental, not
  // intentional. Gate on seasonClosed explicitly so the polar-day state
  // (below) is the one honest source of truth here, not a side effect of an
  // unrelated upstream API returning null.
  const daytimeHint =
    !seasonClosed && isDaytimeNow && sightingPossibleFrom ? t('tonight.daytimeHint', { time: sightingPossibleFrom }) : null;
  const seasonReturnsDate =
    seasonClosed && darkness?.seasonReturns ? formatSeasonReturnsDate(darkness.seasonReturns, i18n.language) : null;

  const bandItems: { label: string; value: string; tone?: string }[] = [
    { label: t('tonight.band.chance'), value: t(chanceKeyFromScore(tonightScoreValue)) },
    { label: t('common.cloud'), value: `${tonightScore?.cloudCover ?? '-'}%`, tone: toneColor(100 - (tonightScore?.cloudCover ?? 100)) },
    { label: t('tonight.band.kpNow'), value: kp.current.toFixed(1), tone: toneColor(Math.round(kp.current * 18)) },
    { label: t('tonight.band.kpPeak'), value: kp.tonightPeak.toFixed(1), tone: toneColor(Math.round(kp.tonightPeak * 18)) },
    { label: t('tonight.band.updated'), value: lastUpdatedAt ? formatUpdatedAt(lastUpdatedAt) : '--:--' }
  ];

  const navigateToBestSpot = () => {
    if (!bestSpotData) return;

    const url = `https://www.google.com/maps/search/?api=1&query=${bestSpotData.lat},${bestSpotData.lon}`;
    void Linking.openURL(url);
  };

  useEffect(() => {
    if (reducedMotion) {
      heroAnim.setValue(1);
      secondaryAnim.setValue(1);
      listAnim.setValue(1);
      return;
    }

    Animated.stagger(110, [
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: motion.duration.enter,
        easing: motion.easing.out,
        useNativeDriver: true
      }),
      Animated.timing(secondaryAnim, {
        toValue: 1,
        duration: motion.duration.slow,
        easing: motion.easing.out,
        useNativeDriver: true
      }),
      Animated.timing(listAnim, {
        toValue: 1,
        duration: motion.duration.base,
        easing: motion.easing.out,
        useNativeDriver: true
      })
    ]).start();
  }, [heroAnim, listAnim, secondaryAnim, reducedMotion]);

  const riseFrom = (distance: number) => (reducedMotion ? 0 : distance);

  if (loading && topSpots.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.auroraGreen} />
        <Text style={styles.helper}>{t('tonight.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, isWideWeb ? styles.containerWide : null]}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
    >
      <View style={styles.atmosphereTop} />
      <View style={styles.atmosphereBottom} />

      {/* The hero is the one dominant recommendation block: go / when / where,
          readable without scrolling. Everything below is supporting detail. */}
      <Animated.View
        style={[
          styles.hero,
          {
            opacity: heroAnim,
            transform: [
              {
                translateY: heroAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [riseFrom(18), 0]
                })
              }
            ]
          }
        ]}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>{t('tonight.heroEyebrow')}</Text>
            <Text style={styles.heroTitle}>{t('tonight.heroTitle')}</Text>
            <Text style={styles.statusLabel}>
              {seasonClosed ? t('tonight.polarDay.statusLabel') : t(recommendationKeyFromLevel(level))}
            </Text>
          </View>

          {seasonClosed ? null : (
            <View style={styles.decisionCluster}>
              <View style={[styles.decisionPill, { backgroundColor: decisionColors.bg, borderColor: decisionColors.border }]}>
                <Text style={[styles.decisionText, { color: decisionColors.text }]}>{t(`tonight.decision.${decision}`)}</Text>
              </View>
              <Text style={styles.score}>{tonightScoreValue}</Text>
              <Text style={styles.scoreSuffix}>{t('tonight.scoreSuffix')}</Text>
            </View>
          )}
        </View>

        {seasonClosed ? (
          // Polar day (midnight sun): the sky never gets dark enough for
          // aurora tonight. This is seasonal truth, not an error -- calm
          // informational styling (same tone as the "later tonight" decision
          // state), not the warning/danger palette.
          <View style={styles.polarDayNotice}>
            <Ionicons name="partly-sunny" size={20} color={palette.textOnInfoSurface} />
            <View style={styles.polarDayCopy}>
              <Text style={styles.polarDayHeadline}>{t('tonight.polarDay.headline')}</Text>
              <Text style={styles.polarDayBody}>
                {t('tonight.polarDay.body', { date: seasonReturnsDate ?? t('tonight.polarDay.unknownDate') })}
              </Text>
            </View>
          </View>
        ) : (
          <>
            {daytimeHint ? (
              <View style={styles.daylightNotice}>
                <Ionicons name="sunny" size={18} color={palette.textOnWarningSurface} />
                <Text style={styles.daylightNoticeText}>{daytimeHint}</Text>
              </View>
            ) : null}

            <View style={styles.reasonBlock}>
              <Text style={styles.sectionKicker}>{t(whyTitleKeyFromScore(tonightScoreValue))}</Text>
              <View style={styles.dataBand}>
                {bandItems.map((item, index) => (
                  <View key={item.label} style={[styles.bandItem, index > 0 ? styles.bandItemDivided : null]}>
                    <Text style={styles.bandLabel}>{item.label}</Text>
                    <Text style={[styles.bandValue, item.tone ? { color: item.tone } : null]}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        <DataQualityBanner dataQuality={dataQuality} />

        <View style={styles.divider} />

        <View style={[styles.heroColumns, isWideWeb ? styles.heroColumnsWide : null]}>
          {seasonClosed ? null : (
            <View style={[styles.heroPrimary, isWideWeb ? styles.heroPrimaryWide : null]}>
              <Text style={styles.sectionKicker}>{t('common.bestWindow')}</Text>
              <Text style={styles.windowLine}>
                {bestSpot
                  ? t('tonight.windowRange', {
                      start: formatLocalTime(bestSpot.bestWindowStart),
                      end: formatLocalTime(bestSpot.bestWindowEnd)
                    })
                  : t('tonight.waitingForecast')}
              </Text>
              <Text style={styles.helper}>
                {bestSpot
                  ? t('tonight.bestWindowSummary', { cloud: bestSpot.cloudCoverAtBestHour, spot: bestSpot.spotName })
                  : t('tonight.pullToRefresh')}
              </Text>

              {bestSpot && bestSpot.hourlyScores.length > 0 ? (
                <HourlyTimeline
                  points={bestSpot.hourlyScores.map((hour) => ({ time: hour.time, value: hour.score }))}
                  highlightStart={bestSpot.bestWindowStart}
                  highlightEnd={bestSpot.bestWindowEnd}
                  toneFor={scoreTone}
                  accessibilityLabel={t('tonight.hourlyScoreA11y')}
                />
              ) : null}
            </View>
          )}

          {seasonClosed ? null : (
            // Gated the same way as heroPrimary above: during polar day every
            // spot ties at score 0, so "best spot" would be an arbitrary
            // tie-break -- showing it here (right next to an actionable
            // Navigate button) beside a headline saying it's too bright to
            // see anything would be actively misleading, not just unhelpful.
            <View style={[styles.heroSecondary, isWideWeb ? styles.heroSecondaryWide : null]}>
              <Text style={styles.sectionKicker}>{t('tonight.bestSpotNow')}</Text>
              {bestSpot && bestSpotData ? (
                <View style={styles.bestSpotBox}>
                  <Text style={styles.bestSpotName} numberOfLines={2}>
                    {bestSpot.spotName}
                  </Text>
                  <Text style={styles.bestSpotMeta}>{t('tonight.distanceCityCenter', { km: bestSpotData.distanceKm })}</Text>

                  <View style={styles.bestSpotActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('tonight.viewDetailsFor', { name: bestSpot.spotName })}
                      style={({ pressed, focused }: WebPressableState) => [
                        styles.secondaryButton,
                        Platform.OS === 'web' ? styles.secondaryButtonHover : null,
                        focused ? styles.focusRing : null,
                        pressed ? styles.buttonPressed : null
                      ]}
                      onPress={() => onOpenSpot(bestSpot.spotId)}
                    >
                      <Text style={styles.secondaryButtonText}>{t('tonight.viewDetails')}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('common.openNavigationTo', { name: bestSpot.spotName })}
                      style={({ pressed, focused }: WebPressableState) => [
                        styles.primaryButton,
                        Platform.OS === 'web' ? styles.primaryButtonHover : null,
                        focused ? styles.focusRing : null,
                        pressed ? styles.buttonPressed : null
                      ]}
                      onPress={navigateToBestSpot}
                    >
                      <Text style={styles.primaryButtonText}>{t('common.navigate')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.bestSpotBox}>
                  <Text style={styles.helper}>{t('tonight.noRecommendation')}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.quickNavRow,
          {
            opacity: secondaryAnim
          }
        ]}
      >
        <Pressable
          accessibilityRole="link"
          style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
          onPress={() => navigation.navigate('AllSpots')}
        >
          <Text style={styles.quickNavChipText}>{t('tonight.quickNav.fullSpotList')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
          onPress={() => navigation.navigate('SpotsMap')}
        >
          <Text style={styles.quickNavChipText}>{t('tonight.quickNav.map')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
          onPress={() => navigation.navigate('Live')}
        >
          <Text style={styles.quickNavChipText}>{t('tonight.quickNav.cameras')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
          onPress={() => navigation.navigate('AuroraMap')}
        >
          <Text style={styles.quickNavChipText}>{t('tonight.quickNav.auroraMap')}</Text>
        </Pressable>
      </Animated.View>

      {tomorrowScore || (kp.dailyOutlook && kp.dailyOutlook.length > 1) ? (
        <Animated.View
          style={[
            styles.outlookCard,
            {
              opacity: secondaryAnim,
              transform: [
                {
                  translateY: secondaryAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [riseFrom(16), 0]
                  })
                }
              ]
            }
          ]}
        >
          <Text style={styles.outlookEyebrow}>{t('tonight.outlook.eyebrow')}</Text>

          {tomorrowScore ? (
            <View style={styles.outlookRow}>
              <Text style={styles.outlookTitle}>{t('tonight.outlook.tomorrowEvening')}</Text>
              <View style={styles.dataBand}>
                <View style={styles.bandItem}>
                  <Text style={styles.bandLabel}>{t('tonight.band.chance')}</Text>
                  <Text style={styles.bandValue}>{t(chanceValueToKey(tomorrowScore.chance))}</Text>
                </View>
                <View style={[styles.bandItem, styles.bandItemDivided]}>
                  <Text style={styles.bandLabel}>{t('tonight.outlook.score')}</Text>
                  <Text style={styles.bandValue}>{tomorrowScore.score}</Text>
                </View>
                <View style={[styles.bandItem, styles.bandItemDivided]}>
                  <Text style={styles.bandLabel}>{t('common.cloud')}</Text>
                  <Text style={styles.bandValue}>{tomorrowScore.cloudCover}%</Text>
                </View>
                <View style={[styles.bandItem, styles.bandItemDivided]}>
                  <Text style={styles.bandLabel}>{t('tonight.outlook.peakKp')}</Text>
                  <Text style={styles.bandValue}>{tomorrowScore.peakKp.toFixed(1)}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {kp.dailyOutlook && kp.dailyOutlook.length > 1 ? (
            <View style={[styles.outlookRow, tomorrowScore ? styles.outlookRowDivided : null]}>
              <Text style={styles.outlookTitle}>{t('tonight.outlook.geomagnetic')}</Text>
              <View style={styles.dataBand}>
                {kp.dailyOutlook.slice(1, 4).map((item, index) => (
                  <View key={item.label} style={[styles.bandItem, index > 0 ? styles.bandItemDivided : null]}>
                    <Text style={styles.bandLabel}>{t(outlookDayLabelKey(item.label))}</Text>
                    <Text style={styles.bandValue}>{item.peak.toFixed(1)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.sectionHeader,
          {
            opacity: listAnim,
            transform: [
              {
                translateY: listAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [riseFrom(10), 0]
                })
              }
            ]
          }
        ]}
      >
        <Text style={styles.sectionTitle}>{t('tonight.topSpotsTitle')}</Text>
        <Text style={styles.sectionSubtitle}>{t('tonight.topSpotsSubtitle')}</Text>
      </Animated.View>
      <Animated.View style={{ opacity: listAnim }}>
        {previewTopSpots.map((result) => {
          const spot = spotsById[result.spotId];
          if (!spot) return null;

          return <SpotCard key={spot.id} spot={spot} result={result} onPress={() => onOpenSpot(spot.id)} />;
        })}
        {topSpots.length > previewTopSpots.length ? (
          <Pressable
            accessibilityRole="link"
            style={({ pressed, focused }: WebPressableState) => [styles.inlineCta, focused ? styles.focusRing : null, pressed ? styles.buttonPressed : null]}
            onPress={() => navigation.navigate('AllSpots')}
          >
            <Text style={styles.inlineCtaText}>{t('tonight.openAllRankedSpots')}</Text>
          </Pressable>
        ) : null}
      </Animated.View>

      {closeSpots.length > 0 ? (
        <>
          <Animated.View
            style={[
              styles.sectionHeader,
              {
                opacity: listAnim,
                transform: [
                  {
                    translateY: listAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [riseFrom(10), 0]
                    })
                  }
                ]
              }
            ]}
          >
            <Text style={styles.sectionTitle}>{t('tonight.closerAlternatives')}</Text>
            <Text style={styles.sectionSubtitle}>{t('tonight.closerAlternativesSubtitle')}</Text>
          </Animated.View>
          <Animated.View style={{ opacity: listAnim }}>
            {previewCloseSpots.map((result) => {
              const spot = spotsById[result.spotId];
              if (!spot) return null;

              return <SpotCard key={`close-${spot.id}`} spot={spot} result={result} onPress={() => onOpenSpot(spot.id)} />;
            })}
            {closeSpots.length > previewCloseSpots.length ? (
              <Pressable
                accessibilityRole="link"
                style={({ pressed, focused }: WebPressableState) => [
                  styles.inlineCta,
                  focused ? styles.focusRing : null,
                  pressed ? styles.buttonPressed : null
                ]}
                onPress={() => navigation.navigate('AllSpots')}
              >
                <Text style={styles.inlineCtaText}>{t('tonight.compareNearbySpots')}</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('tonight.errorTitle')}</Text>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed, focused }: WebPressableState) => [styles.retryButton, focused ? styles.focusRing : null, pressed ? styles.buttonPressed : null]}
            onPress={() => void refresh()}
          >
            <Text style={styles.retryButtonText}>{t('common.tryAgain')}</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space.md,
    paddingBottom: space.xxl,
    backgroundColor: palette.night
  },
  containerWide: {
    maxWidth: 920,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: space.xl
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.night
  },
  atmosphereTop: {
    position: 'absolute',
    top: -36,
    right: -48,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: palette.glowMint
  },
  atmosphereBottom: {
    position: 'absolute',
    top: 220,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: palette.glowBlue
  },
  hero: {
    backgroundColor: palette.nightPanel,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    ...elevation.lg,
    gap: space.md
  },
  heroTopRow: {
    flexDirection: 'row',
    // Lets decisionCluster (score pill/number, natural width, not flexed)
    // drop to its own line on very narrow screens instead of continuing to
    // squeeze heroCopy's minWidth floor below -- see heroCopy comment.
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md
  },
  heroCopy: {
    flex: 1,
    // A floor, not 0: long single-word/compound translations (e.g. German
    // "Aurora-Ausblick") need enough width to wrap at a natural word/hyphen
    // boundary rather than being squeezed so narrow that a sub-word has to
    // break mid-character. Copy should still be kept short enough to fit
    // comfortably (see src/i18n/locales) -- this is a layout safety net,
    // not a substitute for that. Paired with heroTopRow's flexWrap above.
    minWidth: 200,
    gap: space.xxs
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  heroTitle: {
    ...typography.display,
    color: palette.textPrimary
  },
  statusLabel: {
    ...typography.subheading,
    color: palette.auroraMint,
    marginTop: space.xxs
  },
  decisionCluster: {
    alignItems: 'flex-end',
    gap: space.xxs
  },
  decisionPill: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs
  },
  decisionText: {
    ...typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  score: {
    ...typography.numeralLg,
    color: palette.textPrimary
  },
  scoreSuffix: {
    ...typography.caption,
    color: palette.textMuted
  },
  daylightNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.warning,
    backgroundColor: palette.warningSurface
  },
  daylightNoticeText: {
    flex: 1,
    ...typography.body,
    color: palette.textOnWarningSurface
  },
  polarDayNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.auroraBlue,
    backgroundColor: palette.infoSurface
  },
  polarDayCopy: {
    flex: 1,
    gap: space.xxs
  },
  polarDayHeadline: {
    ...typography.bodyStrong,
    color: palette.textOnInfoSurface
  },
  polarDayBody: {
    ...typography.body,
    color: palette.textOnInfoSurface
  },
  reasonBlock: {
    gap: space.xs
  },
  sectionKicker: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  dataBand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.lg
  },
  bandItem: {
    minWidth: 76,
    gap: 3
  },
  bandItemDivided: {
    borderLeftWidth: 1,
    borderLeftColor: palette.borderHairline,
    paddingLeft: space.lg
  },
  bandLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 0.7,
    color: palette.textMuted
  },
  bandValue: {
    ...typography.subheading,
    color: palette.textPrimary
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: palette.borderHairline
  },
  heroColumns: {
    gap: space.md
  },
  heroColumnsWide: {
    flexDirection: 'row',
    alignItems: 'stretch'
  },
  heroPrimary: {
    gap: space.xs
  },
  heroPrimaryWide: {
    flex: 1.3
  },
  heroSecondary: {
    gap: space.xs
  },
  heroSecondaryWide: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: palette.borderHairline,
    paddingLeft: space.lg
  },
  windowLine: {
    ...typography.title,
    color: palette.textPrimary
  },
  helper: {
    ...typography.body,
    color: palette.textSecondary
  },
  bestSpotBox: {
    gap: space.xs
  },
  bestSpotName: {
    ...typography.heading,
    color: palette.textPrimary
  },
  bestSpotMeta: {
    ...typography.bodySmall,
    color: palette.textSecondary
  },
  bestSpotActions: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.xxs
  },
  primaryButton: {
    minHeight: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    backgroundColor: palette.auroraGreen
  },
  primaryButtonHover: {
    backgroundColor: palette.auroraGlow
  },
  primaryButtonText: {
    ...typography.bodyStrong,
    color: palette.textOnAurora
  },
  secondaryButton: {
    minHeight: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: palette.cardBorderStrong,
    backgroundColor: palette.chipSurface
  },
  secondaryButtonHover: {
    backgroundColor: palette.chipSurfaceActive
  },
  secondaryButtonText: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any,
  quickNavRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.lg
  },
  quickNavChip: {
    minHeight: 40,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong
  },
  quickNavChipText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.auroraMint
  },
  outlookCard: {
    marginBottom: space.lg,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    gap: space.sm
  },
  outlookEyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  outlookRow: {
    gap: space.xs
  },
  outlookRowDivided: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.borderHairline
  },
  outlookTitle: {
    ...typography.heading,
    color: palette.textPrimary
  },
  sectionHeader: {
    marginBottom: space.sm
  },
  sectionTitle: {
    ...typography.title,
    color: palette.textPrimary
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    color: palette.textMuted
  },
  inlineCta: {
    minHeight: 46,
    borderRadius: radius.md,
    marginTop: space.xxs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong,
    backgroundColor: palette.surfaceOverlay
  },
  inlineCtaText: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  error: {
    ...typography.body,
    color: palette.textOnDangerSurface
  },
  errorCard: {
    marginTop: space.xxs,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: palette.dangerSurface,
    borderWidth: 1,
    borderColor: palette.danger
  },
  errorTitle: {
    ...typography.heading,
    color: palette.textPrimary,
    marginBottom: space.xxs
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    marginTop: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.dangerSurface,
    borderWidth: 1,
    borderColor: palette.danger
  },
  retryButtonText: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  }
});
