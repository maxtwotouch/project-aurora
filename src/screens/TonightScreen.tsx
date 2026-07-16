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
import { palette } from '../theme/palette';
import { elevation, motion, radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';
import type { AppDataQuality, GeneralForecastScore, KpTrend, Spot, SpotScoreResult } from '../types';

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
  recommendation: string;
  refresh: () => Promise<void>;
};

const formatLocalTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

const formatUpdatedAt = formatLocalTime;

function whyTitleFromScore(score: number): string {
  if (score >= 70) return 'Why tonight is worth it';
  if (score >= 45) return 'Why tonight needs timing';
  return 'Why tonight looks difficult';
}

function chanceLabelFromScore(score: number): string {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

function decisionLabel(score: number, isDaytimeNow: boolean, bestCloudCover?: number): 'Go Now' | 'Wait' | 'Best Later' | 'Later Tonight' {
  if (isDaytimeNow) return 'Later Tonight';
  if (typeof bestCloudCover === 'number' && bestCloudCover > 80) return 'Best Later';
  if (score >= 65) return 'Go Now';
  if (score >= 40) return 'Wait';
  return 'Best Later';
}

function decisionStyle(label: 'Go Now' | 'Wait' | 'Best Later' | 'Later Tonight') {
  if (label === 'Go Now') {
    return { bg: palette.successSurface, border: palette.auroraGreen, text: palette.auroraMint };
  }
  if (label === 'Later Tonight') {
    return { bg: palette.infoSurface, border: palette.auroraBlue, text: palette.textOnInfoSurface };
  }
  if (label === 'Wait') {
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
  recommendation,
  refresh
}: Props) {
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
  const decision = decisionLabel(tonightScoreValue, isDaytimeNow, bestSpot?.cloudCoverAtBestHour);
  const decisionColors = decisionStyle(decision);
  const bestSpotData = bestSpot ? spotsById[bestSpot.spotId] : undefined;
  const daytimeHint = isDaytimeNow && sightingPossibleFrom
    ? `Daylight is still up. First realistic viewing window starts around ${sightingPossibleFrom}.`
    : null;

  const bandItems: { label: string; value: string; tone?: string }[] = [
    { label: 'Chance', value: chanceLabelFromScore(tonightScoreValue) },
    { label: 'Cloud', value: `${tonightScore?.cloudCover ?? '-'}%`, tone: toneColor(100 - (tonightScore?.cloudCover ?? 100)) },
    { label: 'KP now', value: kp.current.toFixed(1), tone: toneColor(Math.round(kp.current * 18)) },
    { label: 'KP peak', value: kp.tonightPeak.toFixed(1), tone: toneColor(Math.round(kp.tonightPeak * 18)) },
    { label: 'Updated', value: lastUpdatedAt ? formatUpdatedAt(lastUpdatedAt) : '--:--' }
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
        <Text style={styles.helper}>Loading tonight&apos;s field report...</Text>
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
            <Text style={styles.eyebrow}>Tonight</Text>
            <Text style={styles.heroTitle}>Aurora outlook</Text>
            <Text style={styles.statusLabel}>{recommendation}</Text>
          </View>

          <View style={styles.decisionCluster}>
            <View style={[styles.decisionPill, { backgroundColor: decisionColors.bg, borderColor: decisionColors.border }]}>
              <Text style={[styles.decisionText, { color: decisionColors.text }]}>{decision}</Text>
            </View>
            <Text style={styles.score}>{tonightScoreValue}</Text>
            <Text style={styles.scoreSuffix}>out of 100</Text>
          </View>
        </View>

        {daytimeHint ? (
          <View style={styles.daylightNotice}>
            <Ionicons name="sunny" size={18} color={palette.textOnWarningSurface} />
            <Text style={styles.daylightNoticeText}>{daytimeHint}</Text>
          </View>
        ) : null}

        <View style={styles.reasonBlock}>
          <Text style={styles.sectionKicker}>{whyTitleFromScore(tonightScoreValue)}</Text>
          <View style={styles.dataBand}>
            {bandItems.map((item, index) => (
              <View key={item.label} style={[styles.bandItem, index > 0 ? styles.bandItemDivided : null]}>
                <Text style={styles.bandLabel}>{item.label}</Text>
                <Text style={[styles.bandValue, item.tone ? { color: item.tone } : null]}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <DataQualityBanner dataQuality={dataQuality} />

        <View style={styles.divider} />

        <View style={[styles.heroColumns, isWideWeb ? styles.heroColumnsWide : null]}>
          <View style={[styles.heroPrimary, isWideWeb ? styles.heroPrimaryWide : null]}>
            <Text style={styles.sectionKicker}>Best window</Text>
            <Text style={styles.windowLine}>
              {bestSpot
                ? `${formatLocalTime(bestSpot.bestWindowStart)} to ${formatLocalTime(bestSpot.bestWindowEnd)}`
                : 'Waiting for fresh forecast data'}
            </Text>
            <Text style={styles.helper}>
              {bestSpot
                ? `${bestSpot.cloudCoverAtBestHour}% cloud cover at the strongest moment, at ${bestSpot.spotName}.`
                : 'Pull to refresh when forecast data becomes available.'}
            </Text>

            {bestSpot && bestSpot.hourlyScores.length > 0 ? (
              <HourlyTimeline
                points={bestSpot.hourlyScores.map((hour) => ({ time: hour.time, value: hour.score }))}
                highlightStart={bestSpot.bestWindowStart}
                highlightEnd={bestSpot.bestWindowEnd}
                toneFor={scoreTone}
                accessibilityLabel="Hourly aurora score tonight, with the best window highlighted"
              />
            ) : null}
          </View>

          <View style={[styles.heroSecondary, isWideWeb ? styles.heroSecondaryWide : null]}>
            <Text style={styles.sectionKicker}>Best spot now</Text>
            {bestSpot && bestSpotData ? (
              <View style={styles.bestSpotBox}>
                <Text style={styles.bestSpotName} numberOfLines={2}>
                  {bestSpot.spotName}
                </Text>
                <Text style={styles.bestSpotMeta}>{bestSpotData.distanceKm} km from the city center</Text>

                <View style={styles.bestSpotActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View details for ${bestSpot.spotName}`}
                    style={({ pressed, focused }: WebPressableState) => [
                      styles.secondaryButton,
                      Platform.OS === 'web' ? styles.secondaryButtonHover : null,
                      focused ? styles.focusRing : null,
                      pressed ? styles.buttonPressed : null
                    ]}
                    onPress={() => onOpenSpot(bestSpot.spotId)}
                  >
                    <Text style={styles.secondaryButtonText}>View details</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open navigation to ${bestSpot.spotName}`}
                    style={({ pressed, focused }: WebPressableState) => [
                      styles.primaryButton,
                      Platform.OS === 'web' ? styles.primaryButtonHover : null,
                      focused ? styles.focusRing : null,
                      pressed ? styles.buttonPressed : null
                    ]}
                    onPress={navigateToBestSpot}
                  >
                    <Text style={styles.primaryButtonText}>Navigate</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.bestSpotBox}>
                <Text style={styles.helper}>No spot recommendation yet. Try refreshing once the forecast feed stabilizes.</Text>
              </View>
            )}
          </View>
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
          <Text style={styles.quickNavChipText}>Full spot list</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
          onPress={() => navigation.navigate('SpotsMap')}
        >
          <Text style={styles.quickNavChipText}>Map</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
          onPress={() => navigation.navigate('Live')}
        >
          <Text style={styles.quickNavChipText}>Cameras</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
          onPress={() => navigation.navigate('AuroraMap')}
        >
          <Text style={styles.quickNavChipText}>Aurora map</Text>
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
          <Text style={styles.outlookEyebrow}>Looking ahead</Text>

          {tomorrowScore ? (
            <View style={styles.outlookRow}>
              <Text style={styles.outlookTitle}>Tomorrow evening</Text>
              <View style={styles.dataBand}>
                <View style={styles.bandItem}>
                  <Text style={styles.bandLabel}>Chance</Text>
                  <Text style={styles.bandValue}>{tomorrowScore.chance}</Text>
                </View>
                <View style={[styles.bandItem, styles.bandItemDivided]}>
                  <Text style={styles.bandLabel}>Score</Text>
                  <Text style={styles.bandValue}>{tomorrowScore.score}</Text>
                </View>
                <View style={[styles.bandItem, styles.bandItemDivided]}>
                  <Text style={styles.bandLabel}>Cloud</Text>
                  <Text style={styles.bandValue}>{tomorrowScore.cloudCover}%</Text>
                </View>
                <View style={[styles.bandItem, styles.bandItemDivided]}>
                  <Text style={styles.bandLabel}>Peak KP</Text>
                  <Text style={styles.bandValue}>{tomorrowScore.peakKp.toFixed(1)}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {kp.dailyOutlook && kp.dailyOutlook.length > 1 ? (
            <View style={[styles.outlookRow, tomorrowScore ? styles.outlookRowDivided : null]}>
              <Text style={styles.outlookTitle}>Geomagnetic outlook</Text>
              <View style={styles.dataBand}>
                {kp.dailyOutlook.slice(1, 4).map((item, index) => (
                  <View key={item.label} style={[styles.bandItem, index > 0 ? styles.bandItemDivided : null]}>
                    <Text style={styles.bandLabel}>{item.label}</Text>
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
        <Text style={styles.sectionTitle}>Top aurora spots right now</Text>
        <Text style={styles.sectionSubtitle}>Short preview here. Use the Spots tab for sorting and the full ranked list.</Text>
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
            <Text style={styles.inlineCtaText}>Open all ranked spots</Text>
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
            <Text style={styles.sectionTitle}>Closer alternatives</Text>
            <Text style={styles.sectionSubtitle}>Nearest options for a faster departure.</Text>
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
                <Text style={styles.inlineCtaText}>Compare nearby spots</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Forecast update failed</Text>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed, focused }: WebPressableState) => [styles.retryButton, focused ? styles.focusRing : null, pressed ? styles.buttonPressed : null]}
            onPress={() => void refresh()}
          >
            <Text style={styles.retryButtonText}>Try again</Text>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
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
