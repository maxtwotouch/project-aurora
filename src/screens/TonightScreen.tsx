import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
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

import { HeroSection } from '../components/tonight/HeroSection';
import { OutlookCard } from '../components/tonight/OutlookCard';
import { QuickNavChips } from '../components/tonight/QuickNavChips';
import { SpotListSection } from '../components/tonight/SpotListSection';
import { decisionKey, isLikelyDaytime } from '../components/tonight/decision';
import { useBottomTabBarSpace } from '../hooks/useBottomTabBarSpace';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { motion, radius, space, type WebPressableState } from '../theme/tokens';
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
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const reducedMotion = useReducedMotion();
  const tabBarSpace = useBottomTabBarSpace();
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
  const bestSpotData = bestSpot ? spotsById[bestSpot.spotId] : undefined;
  const seasonClosed = darkness?.seasonClosed ?? false;
  // sightingPossibleFrom is derived from MET's sunset API and is always null
  // during polar day anyway (there's no sunset), so this would naturally
  // resolve to null when seasonClosed -- but that's accidental, not
  // intentional. Gate on seasonClosed explicitly so the polar-day state
  // (rendered in HeroSection) is the one honest source of truth here, not a
  // side effect of an unrelated upstream API returning null.
  const daytimeHint =
    !seasonClosed && isDaytimeNow && sightingPossibleFrom ? t('tonight.daytimeHint', { time: sightingPossibleFrom }) : null;
  // Suppress the "Looking ahead / Tomorrow evening" band when it would just
  // say the same thing twice as the hero's polar-day notice (tonight closed
  // AND tomorrow evening also scores 0). If tomorrow genuinely clears the
  // darkness threshold while tonight doesn't (the season-opening night),
  // tomorrowScore.score is non-zero and this stays true -- the card is
  // meant to show that "tomorrow it begins" case.
  const showTomorrowEvening = Boolean(tomorrowScore) && !(seasonClosed && tomorrowScore?.score === 0);

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
      contentContainerStyle={[
        styles.container,
        isWideWeb ? styles.containerWide : null,
        // Clear the floating tab bar (see useBottomTabBarSpace); space.xxl is
        // the on-web/no-tab-bar breathing-room floor.
        { paddingBottom: Math.max(space.xxl, tabBarSpace + space.md) }
      ]}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} />}
    >
      <View style={styles.atmosphereTop} />
      <View style={styles.atmosphereBottom} />

      {/* The hero is the one dominant recommendation block: go / when / where,
          readable without scrolling. Everything below is supporting detail. */}
      <HeroSection
        heroAnim={heroAnim}
        riseFrom={riseFrom}
        isWideWeb={isWideWeb}
        level={level}
        seasonClosed={seasonClosed}
        decision={decision}
        tonightScoreValue={tonightScoreValue}
        tonightScore={tonightScore}
        kp={kp}
        lastUpdatedAt={lastUpdatedAt}
        daytimeHint={daytimeHint}
        seasonReturns={darkness?.seasonReturns ?? null}
        dataQuality={dataQuality}
        bestSpot={bestSpot}
        bestSpotData={bestSpotData}
        onOpenSpot={onOpenSpot}
      />

      <QuickNavChips opacity={secondaryAnim} />

      <OutlookCard
        opacity={secondaryAnim}
        riseFrom={riseFrom}
        showTomorrowEvening={showTomorrowEvening}
        tomorrowScore={tomorrowScore}
        dailyOutlook={kp.dailyOutlook}
      />

      <SpotListSection
        listAnim={listAnim}
        riseFrom={riseFrom}
        title={t('tonight.topSpotsTitle')}
        subtitle={t('tonight.topSpotsSubtitle')}
        results={previewTopSpots}
        totalCount={topSpots.length}
        spotsById={spotsById}
        onOpenSpot={onOpenSpot}
        ctaLabel={t('tonight.openAllRankedSpots')}
        onCtaPress={() => navigation.navigate('AllSpots')}
      />

      {closeSpots.length > 0 ? (
        <SpotListSection
          listAnim={listAnim}
          riseFrom={riseFrom}
          title={t('tonight.closerAlternatives')}
          subtitle={t('tonight.closerAlternativesSubtitle')}
          results={previewCloseSpots}
          totalCount={closeSpots.length}
          spotsById={spotsById}
          onOpenSpot={onOpenSpot}
          ctaLabel={t('tonight.compareNearbySpots')}
          onCtaPress={() => navigation.navigate('AllSpots')}
          keyPrefix="close-"
        />
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
  helper: {
    ...typography.body,
    color: palette.textSecondary
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
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any
});
