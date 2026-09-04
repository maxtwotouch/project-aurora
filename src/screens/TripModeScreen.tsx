import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { ScoreBadge } from '../components/ScoreBadge';
import { NowcastPanel } from '../components/tonight/NowcastPanel';
import { TripAreaMap } from '../components/trip/TripAreaMap';
import { rankNearbySpots } from '../components/trip/nearby';
import { captureAllowed } from '../analytics/personalAnalytics';
import { useUserLocation } from '../hooks/useUserLocation';
import { useTranslation } from '../i18n/useTranslation';
import { formatClockTime } from '../lib/formatClockTime';
import { trackUnlessPreview } from '../preview/trackUnlessPreview';
import { beginTripSession, finishTripSession, useTripSession } from '../trip/tripSession';
import { palette } from '../theme/palette';
import { focusRing } from '../theme/focusRing';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';
import type { KpTrend, NowcastSummary, Spot, SpotScoreResult } from '../types';

type Props = {
  spots: Spot[];
  rankedSpots: SpotScoreResult[];
  spotsById: Record<string, Spot>;
  kp: KpTrend;
  nowcast: NowcastSummary | undefined;
  loading: boolean;
  onOpenSpot: (spotId: string) => void;
};

const LOCATION_REFRESH_MS = 60_000;

/**
 * Trip Mode's own screen (see App.tsx's `TripMode` route). A single,
 * platform-shared file -- the one thing that genuinely differs per
 * platform, the "your area" map, is factored out into
 * `components/trip/TripAreaMap.native.tsx` / `.web.tsx` (same split as
 * MapScreen.native/web, just one level lower).
 *
 * LIFECYCLE: INACTIVE -> Start (permission check) -> ACTIVE (live nearby
 * guidance, position refreshed on a 60s interval while this screen is
 * focused) -> End -> INACTIVE. This is a user-facing PRODUCT feature, not a
 * consent (see src/trip/tripSession.ts's header) -- it works identically
 * whether or not the tourism-insights consent is on, and `trip_mode_toggled`
 * only ever records the on/off toggle state, never a coordinate.
 *
 * PRIVACY: `location.requestLocation()` (src/hooks/useUserLocation.ts) is
 * the ONLY location call this screen makes -- never `watchPositionAsync`,
 * which is the presence engine's job (src/hooks/useTripPresence.ts), not
 * this screen's. Positions are used on-device only, exactly as that hook's
 * header states, and are never read from here into anything that persists
 * or transmits them.
 */
export function TripModeScreen({ spots, rankedSpots, spotsById, kp, nowcast, loading, onOpenSpot }: Props) {
  const { t } = useTranslation();
  const session = useTripSession();
  const location = useUserLocation();
  const insets = useSafeAreaInsets();
  const [permissionDenied, setPermissionDenied] = useState(false);

  const nearby = useMemo(
    () => rankNearbySpots(location.coords, spots, rankedSpots),
    [location.coords, spots, rankedSpots]
  );
  const scoreBySpotId = useMemo(
    () => rankedSpots.reduce<Record<string, number>>((acc, result) => ({ ...acc, [result.spotId]: result.score }), {}),
    [rankedSpots]
  );
  const bestNearby = nearby[0];
  const otherNearby = nearby.slice(1, 4);

  // Keep the position fresh while Trip Mode is active AND this screen is
  // the one currently on screen -- cleared on blur/unmount/session end so
  // it never keeps polling in the background (that would duplicate the
  // presence engine's own, separately-gated sampling).
  useFocusEffect(
    useCallback(() => {
      if (!session.active) return;
      const id = setInterval(() => {
        void location.requestLocation();
      }, LOCATION_REFRESH_MS);
      return () => clearInterval(id);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- location.requestLocation is a stable useCallback identity.
    }, [session.active])
  );

  const handleStart = async () => {
    if (Platform.OS === 'web') {
      // The browser's own permission prompt happens inside
      // location.requestLocation() itself -- no separate expo-location call
      // needed (or reliably available) on web.
      setPermissionDenied(false);
      beginTripSession();
      captureAllowed('trip_mode_toggled', { enabled: true });
      void location.requestLocation();
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setPermissionDenied(false);
      beginTripSession();
      captureAllowed('trip_mode_toggled', { enabled: true });
      void location.requestLocation();
    } else {
      setPermissionDenied(true);
    }
  };

  const handleEnd = () => {
    finishTripSession();
    captureAllowed('trip_mode_toggled', { enabled: false });
  };

  const navigateToSpot = (spot: Spot) => {
    trackUnlessPreview('navigate_pressed', spot.id);
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`);
  };

  const contentPadding = { paddingBottom: Math.max(space.xxl, insets.bottom + space.md) };

  if (!session.active) {
    return (
      <ScrollView contentContainerStyle={[styles.container, contentPadding]}>
        <Text style={styles.eyebrow}>{t('tripMode.eyebrow')}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {t('tripMode.title')}
        </Text>
        <Text style={styles.introBody}>{t('tripMode.introBody')}</Text>

        <Pressable
          accessibilityRole="button"
          style={({ pressed, focused }: WebPressableState) => [
            styles.startButton,
            focused ? focusRing : null,
            pressed ? styles.buttonPressed : null
          ]}
          onPress={() => void handleStart()}
        >
          <Text style={styles.startButtonText}>{t('tripMode.startButton')}</Text>
        </Pressable>

        {permissionDenied ? (
          <View style={styles.permissionNote}>
            <Text style={styles.permissionText}>{t('tripMode.permissionDenied')}</Text>
            <Pressable accessibilityRole="link" hitSlop={8} onPress={() => void Linking.openSettings()}>
              <Text style={styles.permissionLink}>{t('map.location.openSettings')}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, contentPadding]}>
      <Text style={styles.activeSince}>
        {t('tripMode.activeSince', {
          time: formatClockTime(new Date(session.startedAtMs ?? Date.now()).toISOString())
        })}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionKicker} accessibilityRole="header">
          {t('tripMode.yourArea')}
        </Text>
        {location.coords === null ? (
          <View style={styles.locatingRow}>
            <ActivityIndicator size="small" color={palette.auroraGreen} />
            <Text style={styles.locatingText}>{t('tripMode.locating')}</Text>
          </View>
        ) : (
          <TripAreaMap coords={location.coords} spots={nearby.map((entry) => entry.spot)} scoreBySpotId={scoreBySpotId} />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionKicker} accessibilityRole="header">
          {t('tripMode.bestNearby')}
        </Text>
        {bestNearby ? (
          <View style={styles.bestCard}>
            <View style={styles.bestTopRow}>
              <Text style={styles.bestName} numberOfLines={2}>
                {bestNearby.spot.name}
              </Text>
              <ScoreBadge score={bestNearby.result?.score ?? 0} />
            </View>
            <Text style={styles.bestMeta}>{t('tripMode.distanceAway', { km: bestNearby.distanceKm })}</Text>
            <View style={styles.bestActions}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={t('tripMode.navigateTo', { name: bestNearby.spot.name })}
                style={({ pressed, focused }: WebPressableState) => [
                  styles.secondaryButton,
                  focused ? focusRing : null,
                  pressed ? styles.buttonPressed : null
                ]}
                onPress={() => navigateToSpot(bestNearby.spot)}
              >
                <Text style={styles.secondaryButtonText}>{t('common.navigate')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed, focused }: WebPressableState) => [
                  styles.primaryButton,
                  focused ? focusRing : null,
                  pressed ? styles.buttonPressed : null
                ]}
                onPress={() => onOpenSpot(bestNearby.spot.id)}
              >
                <Text style={styles.primaryButtonText}>{t('tonight.viewDetails')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.helper}>{t('tripMode.noNearby')}</Text>
        )}
      </View>

      {otherNearby.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionKicker} accessibilityRole="header">
            {t('tripMode.otherNearby')}
          </Text>
          {otherNearby.map((entry) => (
            <Pressable
              key={entry.spot.id}
              accessibilityRole="button"
              accessibilityLabel={entry.spot.name}
              style={({ pressed, focused }: WebPressableState) => [
                styles.row,
                focused ? focusRing : null,
                pressed ? styles.rowPressed : null
              ]}
              onPress={() => onOpenSpot(entry.spot.id)}
            >
              <Text style={styles.rowName} numberOfLines={1}>
                {entry.spot.name}
              </Text>
              <Text style={styles.rowMeta}>{`· ${t('common.kmValue', { km: entry.distanceKm })}`}</Text>
              <ScoreBadge score={entry.result?.score ?? 0} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionKicker} accessibilityRole="header">
            {t('tripMode.tonightSection')}
          </Text>
          {loading ? <ActivityIndicator size="small" color={palette.textMuted} /> : null}
        </View>
        {bestNearby?.result ? (
          <>
            <Text style={styles.tonightWindow}>
              {t('tripMode.bestWindow', {
                start: formatClockTime(bestNearby.result.bestWindowStart),
                end: formatClockTime(bestNearby.result.bestWindowEnd)
              })}
            </Text>
            <View style={styles.tileRow}>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>{t('tripMode.cloudLabel')}</Text>
                <Text style={styles.tileValue}>{`${bestNearby.result.cloudCoverAtBestHour}%`}</Text>
              </View>
              <View style={styles.tile}>
                <Text style={styles.tileLabel}>{t('tripMode.kpLabel')}</Text>
                <Text style={styles.tileValue}>{kp.current.toFixed(1)}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.helper}>{t('tripMode.noForecast')}</Text>
        )}
        {nowcast ? <NowcastPanel nowcast={nowcast} seasonClosed={false} /> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionKicker} accessibilityRole="header">
          {t('tripMode.visitedSection')}
        </Text>
        {session.visitedSpotIds.length > 0 ? (
          session.visitedSpotIds.map((spotId) => {
            const spot = spotsById[spotId];
            if (!spot) return null;
            return (
              <Pressable
                key={spotId}
                accessibilityRole="button"
                accessibilityLabel={spot.name}
                style={({ pressed, focused }: WebPressableState) => [
                  styles.row,
                  focused ? focusRing : null,
                  pressed ? styles.rowPressed : null
                ]}
                onPress={() => onOpenSpot(spotId)}
              >
                <Text style={styles.rowName} numberOfLines={1}>
                  {spot.name}
                </Text>
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.helper}>{t('tripMode.visitedNone')}</Text>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        style={({ pressed, focused }: WebPressableState) => [
          styles.endButton,
          focused ? focusRing : null,
          pressed ? styles.buttonPressed : null
        ]}
        onPress={handleEnd}
      >
        <Text style={styles.endButtonText}>{t('tripMode.endButton')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space.md,
    backgroundColor: palette.night,
    gap: space.lg
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  title: {
    ...typography.title,
    color: palette.textPrimary
  },
  introBody: {
    ...typography.body,
    color: palette.textSecondary
  },
  startButton: {
    marginTop: space.sm,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: palette.auroraGreen
  },
  startButtonText: {
    ...typography.bodyStrong,
    color: palette.textOnAurora
  },
  permissionNote: {
    marginTop: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceSunken,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    gap: space.xxs
  },
  permissionText: {
    ...typography.bodySmall,
    color: palette.textSecondary
  },
  permissionLink: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.auroraMint,
    textDecorationLine: 'underline'
  },
  activeSince: {
    ...typography.caption,
    color: palette.textMuted
  },
  section: {
    gap: space.xs
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionKicker: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  locatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm
  },
  locatingText: {
    ...typography.bodySmall,
    color: palette.textSecondary
  },
  bestCard: {
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: palette.nightPanel,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    gap: space.xs
  },
  bestTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.sm
  },
  bestName: {
    ...typography.heading,
    flex: 1,
    color: palette.textPrimary
  },
  bestMeta: {
    ...typography.bodySmall,
    color: palette.textSecondary
  },
  bestActions: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.xxs
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    backgroundColor: palette.auroraGreen
  },
  primaryButtonText: {
    ...typography.bodyStrong,
    color: palette.textOnAurora
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: palette.cardBorderStrong,
    backgroundColor: palette.chipSurface
  },
  secondaryButtonText: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  helper: {
    ...typography.body,
    color: palette.textSecondary
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingVertical: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderHairline
  },
  rowPressed: {
    opacity: 0.8
  },
  rowName: {
    ...typography.bodyStrong,
    flex: 1,
    color: palette.textPrimary
  },
  rowMeta: {
    ...typography.bodySmall,
    color: palette.textMuted
  },
  tonightWindow: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  tileRow: {
    flexDirection: 'row',
    gap: space.sm
  },
  tile: {
    flex: 1,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceSunken,
    borderWidth: 1,
    borderColor: palette.borderHairline,
    gap: 2
  },
  tileLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    color: palette.textMuted
  },
  tileValue: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  endButton: {
    marginTop: space.sm,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.cardBorderStrong,
    backgroundColor: 'transparent'
  },
  endButtonText: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  }
});
