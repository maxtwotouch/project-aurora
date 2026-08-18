import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { ScoreBadge } from '../components/ScoreBadge';
import { useBottomTabBarSpace } from '../hooks/useBottomTabBarSpace';
import { useUserLocation } from '../hooks/useUserLocation';
import { useTranslation } from '../i18n/useTranslation';
import { getStoredItem, setStoredItem } from '../lib/storage';
import { trackUnlessPreview } from '../preview/trackUnlessPreview';
import { mapDarkStyle } from '../theme/mapDarkStyle';
import { palette } from '../theme/palette';
import type { Spot, SpotScoreResult } from '../types';

type Props = {
  spots: Spot[];
  rankedSpots: SpotScoreResult[];
  onOpenSpot: (spotId: string) => void;
};

const TROMSO_CENTER = {
  latitude: 69.6492,
  longitude: 18.9553,
  latitudeDelta: 0.45,
  longitudeDelta: 0.45
};

const LOCATE_BUTTON_SIZE = 44;
// Gap between the bottom sheet's top edge and the locate button above it,
// and between the button's top edge and the denied/unavailable note above
// that -- see this component's locateButtonBottom/locateNoteBottom below.
const LOCATE_BUTTON_GAP = 14;
const LOCATE_NOTE_GAP = 8;

// One-shot flag (see the auto-prompt effect below): set the FIRST time this
// screen ever auto-triggers the location permission request, so it never
// fires again on later visits/relaunches. Not location data itself -- just
// a boolean "have we already asked" marker -- so it's fine to persist via
// the shared storage helper (see src/lib/storage.ts's header) despite
// useUserLocation.ts's on-device-only constraint on the coordinates
// themselves.
const LOCATION_AUTO_PROMPT_STORAGE_KEY = 'aurora.locationAutoPromptDone.v1';

export function MapScreen({ spots, rankedSpots, onOpenSpot }: Props) {
  const { t } = useTranslation();
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const [selected, setSelected] = useState<Spot | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const hasCenteredOnUser = useRef(false);
  const { status: locationStatus, coords: userCoords, requestLocation } = useUserLocation();
  // Mirrors locationStatus into a ref so the auto-prompt effect below (which
  // intentionally runs only once, on mount) can read the LATEST status right
  // before firing rather than a value captured at mount time -- guards
  // against the rare race where the user taps the locate button themselves
  // while the auto-prompt's storage read is still in flight.
  const locationStatusRef = useRef(locationStatus);
  useEffect(() => {
    locationStatusRef.current = locationStatus;
  }, [locationStatus]);
  const tabBarSpace = useBottomTabBarSpace();
  // Measured height of whichever bottom sheet (selected-spot or empty) is
  // currently rendered -- both share this handler via onLayout so the
  // locate button/notes below can float clear of it instead of overlapping
  // it at a guessed fixed offset (see FIX 1 in this PR's review: the note
  // used to be positioned at a guessed fixed offset, which collided with
  // the sheet once de/fr/es strings wrapped to 3+ lines).
  const [sheetHeight, setSheetHeight] = useState(0);
  const handleSheetLayout = (event: LayoutChangeEvent) => {
    setSheetHeight(event.nativeEvent.layout.height);
  };
  // Bottom offset (from the screen's edge) clear of both the floating tab
  // bar (tabBarSpace -- see useBottomTabBarSpace's header comment) and the
  // bottom sheet's own 16px-from-edge placement + measured height.
  const locateButtonBottom = tabBarSpace + 16 + sheetHeight + LOCATE_BUTTON_GAP;
  const locateNoteBottom = locateButtonBottom + LOCATE_BUTTON_SIZE + LOCATE_NOTE_GAP;

  const scoreBySpot = useMemo(
    () => rankedSpots.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.spotId]: s.score }), {}),
    [rankedSpots]
  );
  const defaultSpot = useMemo(() => {
    const rankedIds = new Set(rankedSpots.map((item) => item.spotId));
    const candidates = spots.filter((spot) => rankedIds.has(spot.id));
    return [...(candidates.length > 0 ? candidates : spots)].sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;
  }, [rankedSpots, spots]);

  const navigateToSpot = (spot: Spot) => {
    trackUnlessPreview('navigate_pressed', spot.id);
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`;
    void Linking.openURL(url);
  };

  useEffect(() => {
    sheetAnim.setValue(0);
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.exp),
      useNativeDriver: true
    }).start();
  }, [selected, sheetAnim]);

  useEffect(() => {
    setSelected((current) => current ?? defaultSpot);
  }, [defaultSpot]);

  // Center the camera on the user once, the first time a position becomes
  // available -- deliberately not a "follow" behavior (see useUserLocation's
  // header comment: this is a display-only, one-shot recenter, and the user
  // stays free to pan afterwards).
  useEffect(() => {
    if (!userCoords || hasCenteredOnUser.current) return;
    hasCenteredOnUser.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08
      },
      600
    );
  }, [userCoords]);

  // Auto-trigger the SAME requestLocation() flow the locate button uses,
  // in-context, the first time the user ever opens this screen -- an
  // explicit product decision to prompt where location is relevant (looking
  // at the map) rather than at app launch or only via the button. Runs once
  // per screen instance (empty deps -- mount only) and the persisted flag
  // below means it's also a true one-shot across remounts/tab revisits and
  // app relaunches, not just this instance.
  //
  // The flag is written as soon as we know it's unset -- BEFORE
  // requestLocation() is called -- so a crash/kill mid-prompt can never
  // leave it unset and cause a second auto-prompt on the next open. That
  // write happens UNCONDITIONALLY once resolved+absent, regardless of
  // whether we then actually go on to call requestLocation(): if the user
  // has already reached for the locate button themselves (granted, denied,
  // requesting, or even a still-idle-but-in-flight retry) by the time the
  // storage read resolves, this still marks the flag done and skips calling
  // requestLocation() again -- harmless either way (the OS won't re-show
  // its own permission sheet for a second call), but leaving the flag
  // unset in that case would contradict this effect's once-ever intent.
  // useUserLocation's reducer always starts 'idle' on mount and never
  // inspects the OS's actual permission state up front, so gating on this
  // hook's own status (rather than trying to ask the OS) is the only signal
  // available here -- see useUserLocation.ts's header for why.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // src/lib/storage.ts swallows read/write errors by design (see its
      // header) -- a broken storage layer just means this flag never
      // persists and the auto-prompt re-arms every session; accepted.
      const alreadyPrompted = await getStoredItem(LOCATION_AUTO_PROMPT_STORAGE_KEY);
      if (cancelled || alreadyPrompted) return;
      await setStoredItem(LOCATION_AUTO_PROMPT_STORAGE_KEY, '1');
      if (cancelled || locationStatusRef.current !== 'idle') return;
      void requestLocation();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, see comment above.
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={TROMSO_CENTER}
        customMapStyle={mapDarkStyle}
        showsUserLocation={locationStatus === 'granted'}
      >
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.lat, longitude: spot.lon }}
            title={spot.name}
            description={t('mapScreen.scoreLabel', { score: scoreBySpot[spot.id] ?? 0 })}
            onPress={() => setSelected(spot)}
          />
        ))}
      </MapView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('map.location.locateButtonA11y')}
        accessibilityState={{ busy: locationStatus === 'requesting' }}
        disabled={locationStatus === 'requesting'}
        style={[styles.locateButton, { bottom: locateButtonBottom }]}
        onPress={() => void requestLocation()}
      >
        {locationStatus === 'requesting' ? (
          <ActivityIndicator size="small" color={palette.textPrimary} />
        ) : (
          <Ionicons
            name={locationStatus === 'granted' ? 'locate' : 'locate-outline'}
            size={20}
            color={palette.textPrimary}
          />
        )}
      </Pressable>

      {locationStatus === 'denied' || locationStatus === 'unavailable' ? (
        <View style={[styles.locationNote, { bottom: locateNoteBottom }]}>
          <Ionicons name="information-circle" size={16} color={palette.auroraIce} />
          <Text style={styles.locationNoteText}>
            {locationStatus === 'denied' ? t('map.location.deniedNote') : t('map.location.unavailableNote')}
          </Text>
          {locationStatus === 'denied' ? (
            <Pressable onPress={() => void Linking.openSettings()}>
              <Text style={styles.locationNoteLink}>{t('map.location.openSettings')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {selected ? (
        <Animated.View
          onLayout={handleSheetLayout}
          style={[
            styles.sheet,
            {
              opacity: sheetAnim,
              transform: [
                {
                  translateY: sheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [36, 0]
                  })
                }
              ]
            }
          ]}
        >
          <View style={styles.sheetTop}>
            <View style={styles.sheetCopy}>
              <Text style={styles.sheetEyebrow}>{t('mapScreen.selectedStop')}</Text>
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {selected.name}
              </Text>
              <Text style={styles.sheetMeta}>{t('common.distanceTromsoCenter', { km: selected.distanceKm })}</Text>
              <Text style={styles.sheetMeta}>{t('mapScreen.forecastScore', { score: scoreBySpot[selected.id] ?? 0 })}</Text>
            </View>
            <ScoreBadge score={scoreBySpot[selected.id] ?? 0} />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.ghostButton} onPress={() => setSelected(null)}>
              <Text style={styles.ghostButtonText}>{t('mapScreen.clear')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => onOpenSpot(selected.id)}>
              <Text style={styles.secondaryButtonText}>{t('mapScreen.details')}</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={() => navigateToSpot(selected)}>
              <Text style={styles.primaryButtonText}>{t('common.navigate')}</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          onLayout={handleSheetLayout}
          style={[
            styles.emptySheet,
            {
              opacity: sheetAnim,
              transform: [
                {
                  translateY: sheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0]
                  })
                }
              ]
            }
          ]}
        >
          <Text style={styles.emptyTitle}>{t('mapScreen.emptyTitle')}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.night
  },
  map: {
    flex: 1
  },
  locateButton: {
    position: 'absolute',
    right: 14,
    width: LOCATE_BUTTON_SIZE,
    height: LOCATE_BUTTON_SIZE,
    borderRadius: LOCATE_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12232fdc',
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  locationNote: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#112735e6',
    borderWidth: 1,
    borderColor: '#2c5265'
  },
  locationNoteText: {
    flex: 1,
    minWidth: '60%',
    color: palette.textSecondary,
    fontSize: 12,
    lineHeight: 16
  },
  locationNoteLink: {
    color: palette.auroraMint,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  sheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    backgroundColor: '#12232fdc',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.26,
    shadowRadius: 18,
    elevation: 7
  },
  emptySheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    backgroundColor: '#12232fd0',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  emptyTitle: {
    color: palette.textPrimary,
    fontSize: 17,
    fontWeight: '700'
  },
  sheetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  sheetCopy: {
    flex: 1,
    minWidth: 0
  },
  sheetEyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3
  },
  sheetTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    color: palette.textPrimary
  },
  sheetMeta: {
    marginTop: 5,
    color: palette.textSecondary,
    fontSize: 14
  },
  actions: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10
  },
  ghostButton: {
    minWidth: 78,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#355468',
    backgroundColor: '#132836'
  },
  ghostButtonText: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '700'
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: palette.cardBorderStrong,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#193240'
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    backgroundColor: palette.auroraGreen,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    color: palette.textPrimary,
    fontWeight: '700'
  },
  primaryButtonText: {
    color: palette.textOnAurora,
    fontWeight: '800'
  }
});
