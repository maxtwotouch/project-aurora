import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SpotCard } from '../components/SpotCard';
import { palette } from '../theme/palette';
import type { GeneralForecastScore, KpTrend, Spot, SpotScoreResult } from '../types';

type Props = {
  onOpenSpot: (spotId: string) => void;
  loading: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
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

function whyTitleFromScore(score: number): string {
  if (score >= 70) return 'Why Tonight Is Worth It';
  if (score >= 45) return 'Why Tonight Needs Timing';
  return 'Why Tonight Looks Difficult';
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
    return { bg: palette.infoSurface, border: palette.auroraBlue, text: palette.auroraIce };
  }
  if (label === 'Wait') {
    return { bg: palette.warningSurface, border: palette.warning, text: '#fae7a3' };
  }
  return { bg: palette.dangerSurface, border: palette.danger, text: '#ffd2d8' };
}

function isLikelyDaytime(now: Date): boolean {
  const hour = now.getHours();
  return hour >= 8 && hour < 17;
}

const formatUpdatedAt = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

function metricTone(score: number) {
  if (score >= 70) return styles.metricToneGood;
  if (score >= 45) return styles.metricToneMixed;
  return styles.metricToneLow;
}

export function TonightScreen({
  onOpenSpot,
  loading,
  error,
  lastUpdatedAt,
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
  const heroAnim = useRef(new Animated.Value(0)).current;
  const secondaryAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const bestSpot = topSpots[0];
  const isDaytimeNow = isLikelyDaytime(new Date());
  const tonightScoreValue = tonightScore?.score ?? 0;
  const decision = decisionLabel(tonightScoreValue, isDaytimeNow, bestSpot?.cloudCoverAtBestHour);
  const decisionColors = decisionStyle(decision);
  const bestSpotData = bestSpot ? spotsById[bestSpot.spotId] : undefined;
  const daytimeHint = isDaytimeNow && sightingPossibleFrom
    ? `Daylight is still up. First realistic viewing window starts around ${sightingPossibleFrom}.`
    : null;

  const navigateToBestSpot = () => {
    if (!bestSpotData) return;

    const url = `https://www.google.com/maps/search/?api=1&query=${bestSpotData.lat},${bestSpotData.lon}`;
    void Linking.openURL(url);
  };

  useEffect(() => {
    Animated.stagger(110, [
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true
      }),
      Animated.timing(secondaryAnim, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true
      }),
      Animated.timing(listAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true
      })
    ]).start();
  }, [heroAnim, listAnim, secondaryAnim]);

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
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
    >
      <View style={styles.atmosphereTop} />
      <View style={styles.atmosphereBottom} />

      <Animated.View
        style={[
          styles.hero,
          {
            opacity: heroAnim,
            transform: [
              {
                translateY: heroAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0]
                })
              }
            ]
          }
        ]}
      >
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>Tonight</Text>
            <Text style={styles.heroTitle}>Aurora outlook</Text>
            <Text style={styles.heroIntro}>
              Best window, strongest spot, and live conditions.
            </Text>
          </View>
          <View style={styles.statusCluster}>
            <View style={[styles.decisionPill, { backgroundColor: decisionColors.bg, borderColor: decisionColors.border }]}>
              <Text style={[styles.decisionText, { color: decisionColors.text }]}>{decision}</Text>
            </View>
            <Text style={styles.statusLabel}>{recommendation}</Text>
            <Text style={styles.score}>{tonightScoreValue}</Text>
            <Text style={styles.scoreSuffix}>out of 100</Text>
          </View>
        </View>

        <View style={styles.metricsBand}>
          <View style={styles.metricBandItem}>
            <Text style={styles.metricBandLabel}>Chance</Text>
            <Text style={styles.metricBandValue}>{chanceLabelFromScore(tonightScoreValue)}</Text>
          </View>
          <View style={styles.metricBandItem}>
            <Text style={styles.metricBandLabel}>KP now</Text>
            <Text style={styles.metricBandValue}>{kp.current.toFixed(1)}</Text>
          </View>
          <View style={styles.metricBandItem}>
            <Text style={styles.metricBandLabel}>KP peak</Text>
            <Text style={styles.metricBandValue}>{kp.tonightPeak.toFixed(1)}</Text>
          </View>
          <View style={styles.metricBandItem}>
            <Text style={styles.metricBandLabel}>Updated</Text>
            <Text style={styles.metricBandValue}>{lastUpdatedAt ? formatUpdatedAt(lastUpdatedAt) : '--:--'}</Text>
          </View>
        </View>

        {daytimeHint ? (
          <View style={styles.daylightNotice}>
            <Ionicons name="sunny" size={18} color="#ffe49a" />
            <Text style={styles.daylightNoticeText}>{daytimeHint}</Text>
          </View>
        ) : null}

        <View style={styles.heroColumns}>
          <View style={styles.heroPrimary}>
            <Text style={styles.sectionKicker}>Best window</Text>
            <Text style={styles.windowLine}>
              {bestSpot
                ? `${formatLocalTime(bestSpot.bestWindowStart)} to ${formatLocalTime(bestSpot.bestWindowEnd)}`
                : 'Waiting for fresh forecast data'}
            </Text>
            <Text style={styles.helper}>
              {bestSpot
                ? `${bestSpot.cloudCoverAtBestHour}% cloud cover at the strongest moment.`
                : 'Pull to refresh when forecast data becomes available.'}
            </Text>

            <View style={styles.reasonPanel}>
              <Text style={styles.reasonTitle}>{whyTitleFromScore(tonightScoreValue)}</Text>
              <View style={styles.reasonMetrics}>
                <View style={[styles.metricCard, metricTone(100 - (tonightScore?.cloudCover ?? 100))]}>
                  <Text style={styles.metricLabel}>Cloud</Text>
                  <Text style={styles.metricValue}>{tonightScore?.cloudCover ?? '-'}%</Text>
                </View>
                <View style={[styles.metricCard, metricTone(Math.round(kp.current * 18))]}>
                  <Text style={styles.metricLabel}>KP now</Text>
                  <Text style={styles.metricValue}>{kp.current.toFixed(1)}</Text>
                </View>
                <View style={[styles.metricCard, metricTone(Math.round(kp.tonightPeak * 18))]}>
                  <Text style={styles.metricLabel}>KP peak</Text>
                  <Text style={styles.metricValue}>{kp.tonightPeak.toFixed(1)}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.heroSecondary}>
            <Text style={styles.sectionKicker}>Best spot now</Text>
            {bestSpot && bestSpotData ? (
              <View style={styles.bestSpotBox}>
                <Text style={styles.bestSpotName} numberOfLines={2}>
                  {bestSpot.spotName}
                </Text>
                <Text style={styles.bestSpotMeta}>
                  {bestSpotData.distanceKm} km from the city center
                </Text>
                <Text style={styles.bestSpotMeta}>
                  Clearest stretch: {formatLocalTime(bestSpot.bestWindowStart)} to {formatLocalTime(bestSpot.bestWindowEnd)}
                </Text>

                <View style={styles.bestSpotActions}>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      Platform.OS === 'web' ? styles.secondaryButtonHover : null,
                      pressed ? styles.buttonPressed : null
                    ]}
                    onPress={() => onOpenSpot(bestSpot.spotId)}
                  >
                    <Text style={styles.secondaryButtonText}>View details</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.primaryButton,
                      Platform.OS === 'web' ? styles.primaryButtonHover : null,
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

      {tomorrowScore ? (
        <Animated.View
          style={[
            styles.outlookCard,
            {
              opacity: secondaryAnim,
              transform: [
                {
                  translateY: secondaryAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [16, 0]
                  })
                }
              ]
            }
          ]}
        >
          <View style={styles.outlookHeader}>
            <View>
              <Text style={styles.outlookEyebrow}>Tomorrow</Text>
              <Text style={styles.outlookTitle}>Early read for the next evening</Text>
            </View>
            <Text style={styles.outlookChance}>{tomorrowScore.chance}</Text>
          </View>
          <View style={styles.outlookGrid}>
            <View style={styles.outlookTile}>
              <Text style={styles.outlookTileLabel}>Score</Text>
              <Text style={styles.outlookTileValue}>{tomorrowScore.score}</Text>
            </View>
            <View style={styles.outlookTile}>
              <Text style={styles.outlookTileLabel}>Cloud</Text>
              <Text style={styles.outlookTileValue}>{tomorrowScore.cloudCover}%</Text>
            </View>
            <View style={styles.outlookTile}>
              <Text style={styles.outlookTileLabel}>Peak KP</Text>
              <Text style={styles.outlookTileValue}>{tomorrowScore.peakKp.toFixed(1)}</Text>
            </View>
          </View>
        </Animated.View>
      ) : null}

      {kp.dailyOutlook && kp.dailyOutlook.length > 1 ? (
        <Animated.View
          style={[
            styles.forecastStrip,
            {
              opacity: secondaryAnim,
              transform: [
                {
                  translateY: secondaryAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0]
                  })
                }
              ]
            }
          ]}
        >
          <Text style={styles.stripTitle}>Upcoming geomagnetic outlook</Text>
          <View style={styles.stripRow}>
            {kp.dailyOutlook.slice(1, 4).map((item) => (
              <View key={item.label} style={styles.stripTile}>
                <Text style={styles.stripLabel}>{item.label}</Text>
                <Text style={styles.stripValue}>{item.peak.toFixed(1)}</Text>
              </View>
            ))}
          </View>
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
                  outputRange: [10, 0]
                })
              }
            ]
          }
        ]}
      >
        <Text style={styles.sectionTitle}>Top aurora spots right now</Text>
        <Text style={styles.sectionSubtitle}>Ranked for immediacy, cloud cover, and practical viewing quality.</Text>
      </Animated.View>
      <Animated.View style={{ opacity: listAnim }}>
        {topSpots.map((result) => {
        const spot = spotsById[result.spotId];
        if (!spot) return null;

        return <SpotCard key={spot.id} spot={spot} result={result} onPress={() => onOpenSpot(spot.id)} />;
        })}
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
                      outputRange: [10, 0]
                    })
                  }
                ]
              }
            ]}
          >
            <Text style={styles.sectionTitle}>Closer alternatives</Text>
            <Text style={styles.sectionSubtitle}>Shorter drives if you want a quicker departure from Tromso.</Text>
          </Animated.View>
          <Animated.View style={{ opacity: listAnim }}>
            {closeSpots.map((result) => {
            const spot = spotsById[result.spotId];
            if (!spot) return null;

            return <SpotCard key={`close-${spot.id}`} spot={spot} result={result} onPress={() => onOpenSpot(spot.id)} />;
            })}
          </Animated.View>
        </>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Forecast update failed</Text>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => void refresh()}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 32,
    backgroundColor: palette.night
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
    backgroundColor: '#82f3c41f'
  },
  atmosphereBottom: {
    position: 'absolute',
    top: 220,
    left: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#91beff14'
  },
  hero: {
    backgroundColor: palette.nightPanel,
    borderRadius: 28,
    padding: 22,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.26,
    shadowRadius: 28,
    elevation: 8,
    gap: 18
  },
  heroHeader: {
    gap: 18
  },
  heroCopy: {
    gap: 6
  },
  eyebrow: {
    color: palette.auroraMint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase'
  },
  heroTitle: {
    color: palette.textPrimary,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    maxWidth: 420
  },
  heroIntro: {
    color: palette.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 540
  },
  statusCluster: {
    alignSelf: 'flex-start',
    minWidth: 168,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#101d27',
    borderWidth: 1,
    borderColor: '#284657'
  },
  decisionPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 10
  },
  decisionText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  statusLabel: {
    color: palette.auroraMint,
    fontSize: 17,
    fontWeight: '700'
  },
  score: {
    color: palette.textPrimary,
    fontSize: 54,
    lineHeight: 58,
    fontWeight: '800',
    marginTop: 8
  },
  scoreSuffix: {
    color: palette.textMuted,
    fontSize: 13
  },
  metricsBand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  metricBandItem: {
    minWidth: 104,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: '#101d27',
    borderWidth: 1,
    borderColor: '#274253'
  },
  metricBandLabel: {
    color: palette.textMuted,
    fontSize: 11,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  metricBandValue: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '700'
  },
  daylightNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#726134',
    backgroundColor: '#3a3119'
  },
  daylightNoticeText: {
    flex: 1,
    color: '#ffe7af',
    fontSize: 14,
    lineHeight: 20
  },
  heroColumns: {
    gap: 16
  },
  heroPrimary: {
    gap: 10
  },
  heroSecondary: {
    gap: 10
  },
  sectionKicker: {
    color: palette.auroraMint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase'
  },
  windowLine: {
    color: palette.textPrimary,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800'
  },
  helper: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  reasonPanel: {
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#244150'
  },
  reasonTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10
  },
  reasonMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  metricCard: {
    minWidth: 96,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1
  },
  metricToneGood: {
    backgroundColor: '#15352e',
    borderColor: '#2d8d73'
  },
  metricToneMixed: {
    backgroundColor: '#41371c',
    borderColor: '#8c7440'
  },
  metricToneLow: {
    backgroundColor: '#41222b',
    borderColor: '#8a4c5a'
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
    fontSize: 22,
    fontWeight: '800'
  },
  bestSpotBox: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#101d27',
    borderWidth: 1,
    borderColor: '#274253',
    gap: 8
  },
  bestSpotName: {
    color: palette.textPrimary,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800'
  },
  bestSpotMeta: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20
  },
  bestSpotActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6
  },
  primaryButton: {
    minHeight: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: palette.auroraGreen
  },
  primaryButtonHover: {
    backgroundColor: '#79f4ca'
  },
  primaryButtonText: {
    color: palette.textOnAurora,
    fontWeight: '800',
    fontSize: 14
  },
  secondaryButton: {
    minHeight: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: palette.cardBorderStrong,
    backgroundColor: '#18303f'
  },
  secondaryButtonHover: {
    backgroundColor: '#1d394a'
  },
  secondaryButtonText: {
    color: palette.textPrimary,
    fontWeight: '700',
    fontSize: 14
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  },
  outlookCard: {
    marginBottom: 18,
    padding: 18,
    borderRadius: 24,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  outlookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14
  },
  outlookEyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 4
  },
  outlookTitle: {
    color: palette.textPrimary,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    maxWidth: 280
  },
  outlookChance: {
    color: palette.auroraMint,
    fontSize: 16,
    fontWeight: '700'
  },
  outlookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  outlookTile: {
    minWidth: 98,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: palette.cardElevated,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  outlookTileLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4
  },
  outlookTileValue: {
    color: palette.textPrimary,
    fontSize: 21,
    fontWeight: '800'
  },
  forecastStrip: {
    marginBottom: 18,
    padding: 16,
    borderRadius: 22,
    backgroundColor: '#10202b',
    borderWidth: 1,
    borderColor: '#264455'
  },
  stripTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12
  },
  stripRow: {
    flexDirection: 'row',
    gap: 10
  },
  stripTile: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#16303f'
  },
  stripLabel: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4
  },
  stripValue: {
    color: palette.textPrimary,
    fontSize: 20,
    fontWeight: '800'
  },
  sectionHeader: {
    marginBottom: 12
  },
  sectionTitle: {
    color: palette.textPrimary,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    marginBottom: 4
  },
  sectionSubtitle: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  error: {
    color: '#ffd5db',
    fontSize: 14,
    lineHeight: 21
  },
  errorCard: {
    marginTop: 6,
    padding: 16,
    borderRadius: 22,
    backgroundColor: palette.dangerSurface,
    borderWidth: 1,
    borderColor: palette.danger
  },
  errorTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5b2c36'
  },
  retryButtonText: {
    color: palette.textPrimary,
    fontWeight: '700'
  }
});
