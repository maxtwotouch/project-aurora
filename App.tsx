import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import type { Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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
          height: 70 + insets.bottom,
          paddingHorizontal: 10,
          paddingTop: 6,
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
        headerStyle: {
          backgroundColor: palette.night
        },
        headerTintColor: palette.textPrimary,
        headerShown: true,
        headerTitle: ({ children }) => (
          <HeaderTitleText key={fontsLoaded ? 'fraunces' : 'system'}>{children}</HeaderTitleText>
        ),
        headerShadowVisible: false,
        headerTitleAlign: 'left',
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
    <SafeAreaProvider>
      <ConsentGate>
        {/* Mounted once here, above the whole navigator, rather than per
            screen -- see PreviewModeBanner's own header comment for why. */}
        <PreviewModeBanner />
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
      </ConsentGate>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  headerBackground: {
    flex: 1,
    backgroundColor: palette.night
  },
  headerTitleText: {
    fontFamily: fraunces.bold,
    fontSize: 18,
    fontWeight: '700',
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
    marginTop: -2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999
  },
  tabIconWrapActive: {
    backgroundColor: '#214355'
  }
});
