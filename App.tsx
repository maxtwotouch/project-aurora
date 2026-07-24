import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import type { Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
// Importing from each weight's own subpath (rather than the package root)
// keeps Metro from bundling all 18 Fraunces weight/italic files -- the
// aggregate `@expo-google-fonts/fraunces` entry point requires every one of
// them at module-eval time regardless of which named exports are used.
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { Fraunces_900Black } from '@expo-google-fonts/fraunces/900Black';

import spots from './src/data/spots.json';
import { ConsentGate } from './src/components/ConsentGate';
import { AuroraIcon, LiveIcon, MapIcon, SpotsIcon, TonightIcon } from './src/components/icons';
import { PreviewModeBanner } from './src/components/PreviewModeBanner';
import { SettingsButton } from './src/components/SettingsButton';
import { useForecast } from './src/hooks/useForecast';
import { useTranslation } from './src/i18n/useTranslation';
import { AllSpotsScreen } from './src/screens/AllSpotsScreen';
import { AuroraMapScreen } from './src/screens/AuroraMapScreen';
import { LiveCamerasScreen } from './src/screens/LiveCamerasScreen';
import { MapScreen } from './src/screens/MapScreen.native';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SpotDetailScreen } from './src/screens/SpotDetailScreen.native';
import { TonightScreen } from './src/screens/TonightScreen';
import { palette } from './src/theme/palette';
import { space } from './src/theme/tokens';
import { fraunces } from './src/theme/type';
import type { AppDataQuality, AuroraLevel, DarknessSeasonState, GeneralForecastScore, KpTrend, Spot, SpotScoreResult } from './src/types';

type RootStackParamList = {
  Tabs: undefined;
  SpotDetail: { spotId: string };
  Settings: undefined;
};

type TabsParamList = {
  Tonight: undefined;
  SpotsMap: undefined;
  AllSpots: undefined;
  AuroraMap: undefined;
  Live: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabsParamList>();
const navTheme: Theme = {
  dark: true,
  colors: {
    primary: palette.auroraGreen,
    background: palette.night,
    card: palette.nightPanel,
    text: palette.textPrimary,
    border: palette.cardBorder,
    notification: palette.warning
  }
};

const typedSpots = spots as Spot[];

/**
 * Custom header title component instead of headerTitleStyle.fontFamily:
 * iOS measures the title's width when it first renders (system font,
 * since Fraunces loads async and we deliberately don't gate rendering on
 * it) and does not re-measure when the wider serif swaps in -- producing
 * "Toni..." truncation on device. Keying this component on fontsLoaded
 * remounts it when Fraunces arrives, forcing a fresh measurement.
 */
function HeaderTitleText({ children }: { children?: React.ReactNode }) {
  return (
    <Text numberOfLines={1} style={styles.headerTitleText}>
      {children}
    </Text>
  );
}

type TabsRootProps = {
  onOpenSpot: (spotId: string) => void;
  rankedSpots: SpotScoreResult[];
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
  onOpenSettings: () => void;
  fontsLoaded: boolean;
};

function TabsRoot({
  onOpenSpot,
  rankedSpots,
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
  refresh,
  onOpenSettings,
  fontsLoaded
}: TabsRootProps) {
  const { t } = useTranslation();
  // Bottom-tabs' own SafeAreaProviderCompat wraps its content *below* this
  // point in the tree (see @react-navigation/bottom-tabs BottomTabView), not
  // above it -- so this reads from the SafeAreaProvider mounted at the App
  // root (see App.tsx's default export) instead. On a home-indicator iPhone,
  // insets.bottom is the ~34pt system bar height; on web/older devices with
  // no inset, it's 0, so the values below collapse back to the previous
  // hardcoded height/padding exactly.
  const insets = useSafeAreaInsets();

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: palette.auroraGreen,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarIcon: ({ color, size, focused }) => {
          let Icon = TonightIcon;

          if (route.name === 'SpotsMap') {
            Icon = MapIcon;
          } else if (route.name === 'AllSpots') {
            Icon = SpotsIcon;
          } else if (route.name === 'AuroraMap') {
            Icon = AuroraIcon;
          } else if (route.name === 'Live') {
            Icon = LiveIcon;
          }

          return (
            <View style={[styles.tabIconWrap, focused ? styles.tabIconWrapActive : null]}>
              <Icon size={size} color={color} focused={focused} />
            </View>
          );
        },
        tabBarShowLabel: true,
        sceneStyle: {
          backgroundColor: palette.night
        },
        tabBarStyle: {
          backgroundColor: '#10202be8',
          borderTopColor: '#264455',
          // Previously a hardcoded height: 70 / paddingBottom: 8, which
          // overrode the inset handling the navigator would otherwise apply
          // -- on home-indicator iPhones the tab bar sat flush against the
          // system bar with no clearance. Growing both by insets.bottom (0
          // on web/older devices, so this is a no-op there) reserves exactly
          // that much extra space instead.
          //
          // Height 70->74 and paddingTop 6->8 (+4 each, in lockstep) fix a
          // second, separate crowding bug reported on device: the active
          // tab's icon chip (tabIconWrapActive below) sat only ~6px under
          // the bar's top border (paddingTop 6 + tabBarItemStyle's
          // paddingTop 2, cancelled back down by tabIconWrap's own
          // marginTop: -2). Bumping paddingTop by the same +4 the height
          // grows by keeps the icon/label row's own share of the bar
          // unchanged (so labels don't get newly cramped) while giving the
          // chip ~10px of clearance above it (still comfortably >= the 6px
          // floor) instead of ~6px.
          height: 74 + insets.bottom,
          paddingHorizontal: 10,
          paddingTop: 8,
          paddingBottom: 8 + Math.max(insets.bottom, 0)
        },
        tabBarItemStyle: {
          minWidth: 0,
          borderRadius: 18,
          paddingTop: 2
        },
        tabBarActiveBackgroundColor: '#16303f',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.2
        },
        // Deliberately NOT setting an explicit `height` here to fix the
        // "excessive empty space above the header title" report. Traced
        // through @react-navigation/elements' Header component (the version
        // pinned by this project's package-lock, 1.3.31): it already detects
        // Dynamic Island devices (insets.top > 50) and shaves 5pt off the
        // status-bar spacer it reserves above the fixed 44pt iOS title row,
        // specifically to avoid over-reserving space on exactly this class
        // of device -- i.e. there's no inset double-count to fix at the
        // headerStyle/height level. A hardcoded `insets.top + 52` override
        // would in fact make the header *taller* than that already-corrected
        // default (e.g. ~111pt vs ~98pt on a 59pt-inset Dynamic Island
        // phone), the opposite of what's needed. The more likely real
        // contributor is the custom title Text's own line box -- see
        // headerTitleText's `lineHeight` below.
        headerStyle: {
          backgroundColor: palette.night
        },
        headerTintColor: palette.textPrimary,
        headerShown: true,
        // The native stack this navigator sits inside already insets its screen
        // content by the top safe area, so the default headerStatusBarHeight
        // (== insets.top) reserved it a *second* time -- a ~notch-height dead
        // band above the title (the "empty space at the top" report). Pinning it
        // to 0 leaves the single stack-provided inset, so the title clears the
        // status bar without the double count. (The preview banner cancels that
        // same stack inset with its own negative margin -- see PreviewModeBanner.)
        headerStatusBarHeight: 0,
        headerTitle: ({ children }) => (
          <HeaderTitleText key={fontsLoaded ? 'fraunces' : 'system'}>{children}</HeaderTitleText>
        ),
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        // @react-navigation/elements' Header defaults this title container to
        // marginHorizontal: 16 (Header.js `styles.title`), which is where
        // "Tonight"/"Spots" sat before this change -- flush with the
        // *screen's own* content padding (space.md, e.g. TonightScreen's
        // ScrollView `container`), but not with what a card actually reads
        // as its content gutter: every SpotCard (src/components/SpotCard.
        // tsx) adds its own `padding: space.md` on top of that screen
        // padding, so a card's spot-name text sits a further space.md to
        // the right of the card's edge. That's the same gap SpotListSection
        // (src/components/tonight/SpotListSection.tsx) needed closing for
        // its own headings -- see that file's `sectionHeader` comment.
        // Doubling the token here (space.md * 2) lines the header title up
        // with that same card-text gutter instead of the card's outer edge.
        headerTitleContainerStyle: {
          marginHorizontal: space.md * 2
        },
        headerBackground: () => <View style={styles.headerBackground} />,
        headerRight: () => (
          <SettingsButton accessibilityLabel={t('nav.settingsA11yLabel')} onPress={onOpenSettings} />
        )
      })}
    >
      <Tabs.Screen name="Tonight" options={{ title: t('nav.tabs.tonight') }}>
        {() => (
          <TonightScreen
            onOpenSpot={onOpenSpot}
            loading={loading}
            error={error}
            lastUpdatedAt={lastUpdatedAt}
            dataQuality={dataQuality}
            kp={kp}
            topSpots={topSpots}
            closeSpots={closeSpots}
            spotsById={spotsById}
            tonightScore={tonightScore}
            tomorrowScore={tomorrowScore}
            sightingPossibleFrom={sightingPossibleFrom}
            darkness={darkness}
            level={level}
            refresh={refresh}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="SpotsMap" options={{ title: t('nav.tabs.map') }}>
        {() => <MapScreen spots={typedSpots} rankedSpots={rankedSpots} onOpenSpot={onOpenSpot} />}
      </Tabs.Screen>
      <Tabs.Screen name="AllSpots" options={{ title: t('nav.tabs.spots') }}>
        {() => (
          <AllSpotsScreen
            rankedSpots={rankedSpots}
            spotsById={spotsById}
            dataQuality={dataQuality}
            loading={loading}
            refresh={refresh}
            onOpenSpot={onOpenSpot}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="AuroraMap" options={{ title: t('nav.tabs.aurora') }}>
        {() => <AuroraMapScreen kp={kp} />}
      </Tabs.Screen>
      <Tabs.Screen name="Live" options={{ title: t('nav.tabs.live') }}>
        {() => <LiveCamerasScreen />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

export default function App() {
  // Deliberately not awaited/gated: we call useFonts (it kicks off async
  // loading) but never branch render on its `fontsLoaded` boolean, so the
  // app never sits on a blank/loading screen waiting for a display face.
  // `typography.display/title/numeralMd/numeralLg` (src/theme/type.ts)
  // reference these Fraunces family names directly; React Native falls
  // back to the system font for any not-yet-registered `fontFamily`, so
  // the very first frame renders in the system font and swaps to Fraunces
  // once loading completes and the tree next re-renders (forecast refresh,
  // navigation, etc. all trigger that naturally) -- a brief, deliberate
  // FOUT-style swap rather than a loading gate.
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, Fraunces_700Bold, Fraunces_900Black });

  const forecast = useForecast();
  const { t } = useTranslation();

  const spotsById = useMemo(
    () => typedSpots.reduce<Record<string, Spot>>((acc, spot) => ({ ...acc, [spot.id]: spot }), {}),
    []
  );

  return (
    // `initialMetrics` makes the very first render already know the device's
    // safe-area frame/insets instead of waiting on an async native
    // measurement round-trip. Without it, this provider's `insets` state
    // starts `null` and (per react-native-safe-area-context) renders none of
    // its children until that first measurement resolves -- on a real
    // device that resolves fast enough to be invisible for a *simple* tree,
    // but every consumer downstream (this banner, the navigator's own compat
    // safe-area provider, the header's inset math) re-renders/re-measures
    // the instant it flips from null to a value, which is exactly the kind
    // of one-time layout jump that produces a stuck/miscomputed gap on iOS.
    // `initialWindowMetrics` is the synchronous value react-navigation's own
    // internal `SafeAreaProviderCompat` already falls back to, so passing it
    // here just makes our root provider agree with it from frame one instead
    // of racing it.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ConsentGate>
        {/* Explicit flex column: the banner (fixed content height, its own
            insets.top padding) followed by a `flex: 1` sibling that owns all
            remaining space for the navigator. Written out as real Views
            (rather than relying on ConsentGate's bare `<>{children}</>`
            fragment flattening into implicitly-correct flex siblings) so
            there is no ambiguity about whether every layer between the root
            and the navigator carries the sizing it needs. */}
        <View style={styles.root}>
          {/* Mounted once here, above the whole navigator, rather than per
              screen -- see PreviewModeBanner's own header comment for why. */}
          <PreviewModeBanner />
          <View style={styles.navRoot}>
            <NavigationContainer theme={navTheme}>
              <Stack.Navigator
                screenOptions={{
                  headerStyle: {
                    backgroundColor: palette.night
                  },
                  headerTintColor: palette.textPrimary,
                  headerShadowVisible: false,
                  headerTitle: ({ children }) => (
                    <HeaderTitleText key={fontsLoaded ? 'fraunces' : 'system'}>{children}</HeaderTitleText>
                  ),
                  headerTitleAlign: 'left',
                  headerBackground: () => <View style={styles.headerBackground} />
                }}
              >
                <Stack.Screen name="Tabs" options={{ headerShown: false }}>
                  {({ navigation }) => (
                    <TabsRoot
                      onOpenSpot={(spotId) => {
                        navigation.navigate('SpotDetail', { spotId });
                      }}
                      onOpenSettings={() => navigation.navigate('Settings')}
                      fontsLoaded={fontsLoaded}
                      rankedSpots={forecast.rankedSpots}
                      loading={forecast.loading}
                      error={forecast.error}
                      lastUpdatedAt={forecast.lastUpdatedAt}
                      dataQuality={forecast.dataQuality}
                      kp={forecast.kp}
                      topSpots={forecast.topSpots}
                      closeSpots={forecast.closeSpots}
                      spotsById={forecast.spotsById}
                      tonightScore={forecast.tonightScore}
                      tomorrowScore={forecast.tomorrowScore}
                      sightingPossibleFrom={forecast.sightingPossibleFrom}
                      darkness={forecast.darkness}
                      level={forecast.level}
                      refresh={forecast.refresh}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen
                  name="SpotDetail"
                  options={({ route, navigation }) => ({
                    title: spotsById[route.params.spotId]?.name ?? t('common.spotDetailsFallback'),
                    headerBackVisible: false,
                    headerLeft: () => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('common.goBack')}
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                      >
                        <Ionicons name="chevron-back" size={20} color={palette.textPrimary} />
                        <Text style={styles.backText}>{t('common.back')}</Text>
                      </Pressable>
                    )
                  })}
                >
                  {({ route }) => (
                    <SpotDetailScreen
                      spot={spotsById[route.params.spotId]}
                      result={forecast.rankedSpots.find((r) => r.spotId === route.params.spotId)}
                      forecast={forecast.forecastsBySpotId[route.params.spotId]}
                    />
                  )}
                </Stack.Screen>
                <Stack.Screen
                  name="Settings"
                  options={({ navigation }) => ({
                    title: t('settings.title'),
                    headerBackVisible: false,
                    headerLeft: () => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('common.goBack')}
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                      >
                        <Ionicons name="chevron-back" size={20} color={palette.textPrimary} />
                        <Text style={styles.backText}>{t('common.back')}</Text>
                      </Pressable>
                    )
                  })}
                >
                  {() => <SettingsScreen />}
                </Stack.Screen>
              </Stack.Navigator>
            </NavigationContainer>
          </View>
        </View>
      </ConsentGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  navRoot: {
    flex: 1
  },
  headerBackground: {
    flex: 1,
    backgroundColor: palette.night
  },
  headerTitleText: {
    fontFamily: fraunces.bold,
    fontSize: 20,
    // Explicit lineHeight, close to fontSize: without one, iOS falls back
    // to Fraunces' own font-file line-height metrics for this Text's line
    // box, which (like a lot of display/editorial serif faces) are
    // noticeably taller than its fontSize suggests. The header's title row
    // centers this Text via justifyContent: 'center' (Header.js, `styles.
    // title`), so an oversized, font-driven line box reads as extra dead
    // space padding the title away from the header's actual content edges
    // -- part of what read as "excessive empty space above the title" on
    // device. Pinning it keeps the line box (and therefore the title's
    // vertical position) predictable regardless of which font is currently
    // loaded (system font pre-Fraunces-swap, then Fraunces after).
    lineHeight: 25,
    fontWeight: '700',
    // Floor the title's box width so numberOfLines={1} can't clip it to
    // "Toni...". iOS sizes this Text to its measured intrinsic width on first
    // paint -- and because Fraunces loads async (see HeaderTitleText / the
    // useFonts comment), that first measurement is often the *narrower* system
    // font's, after which the wider Fraunces glyphs swap in and overflow the
    // already-fixed box. The fontsLoaded-keyed remount is meant to force a
    // re-measure, but this floor makes the outcome robust regardless of
    // measurement timing: every header title in the app ("Tonight",
    // "Settings", "Aurora", ...) fits within 140pt in Fraunces bold 18, and
    // 140pt still leaves room for the headerRight settings button / headerLeft
    // back button on the narrowest supported phones.
    minWidth: 140,
    color: palette.textPrimary
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.nightPanel
  },
  backText: {
    color: palette.textPrimary,
    fontWeight: '700'
  },
  tabIconWrap: {
    minWidth: 34,
    minHeight: 28,
    // Was -2, which existed purely to cancel tabBarItemStyle's paddingTop: 2
    // back out (net clearance above this chip == tabBarStyle.paddingTop
    // alone, 6px pre-fix) -- see the tabBarStyle comment above for why that
    // was too tight. Dropping the cancellation lets the bar's own +4px
    // paddingTop bump actually reach this chip instead of being absorbed.
    marginTop: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999
  },
  tabIconWrapActive: {
    backgroundColor: '#214355'
  }
});
