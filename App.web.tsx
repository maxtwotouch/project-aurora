import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import type { Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
// See App.tsx for why these are imported per-weight rather than from the
// package root (avoids Metro bundling all 18 Fraunces weight/italic files).
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
import { MapScreen } from './src/screens/MapScreen.web';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SpotDetailScreen } from './src/screens/SpotDetailScreen.web';
import { TonightScreen } from './src/screens/TonightScreen';
import { palette } from './src/theme/palette';
import { radius, space, type WebPressableState } from './src/theme/tokens';
import { fraunces } from './src/theme/type';
import type { AppDataQuality, AuroraLevel, DarknessSeasonState, GeneralForecastScore, KpTrend, Spot, SpotScoreResult } from './src/types';

// Desktop web should not read as a phone screen inside a browser: full-bleed
// scroll surfaces are capped and centered so line lengths and layout stay
// sane on wide viewports. Mobile web (narrow) is unaffected (maxWidth only
// kicks in once content is already wider than the cap).
function WebPage({ children }: { children: ReactNode }) {
  return (
    <View style={styles.webPage}>
      <View style={styles.webPageInner}>{children}</View>
    </View>
  );
}

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
    card: palette.nightSoft,
    text: palette.textPrimary,
    border: palette.cardBorder,
    notification: palette.warning
  }
};

const typedSpots = spots as Spot[];

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
  onOpenSettings
}: TabsRootProps) {
  const { t } = useTranslation();

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: palette.auroraGreen,
        tabBarInactiveTintColor: palette.textSecondary,
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

          return <Icon size={size} color={color} focused={focused} />;
        },
        tabBarStyle: {
          backgroundColor: palette.nightSoft,
          borderTopColor: palette.cardBorder,
          height: 62,
          paddingHorizontal: 6,
          paddingTop: 4,
          paddingBottom: 6
        },
        tabBarItemStyle: {
          minWidth: 0,
          paddingTop: 2
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600'
        },
        headerStyle: {
          backgroundColor: palette.nightSoft
        },
        headerTintColor: palette.textPrimary,
        headerTitleStyle: {
          fontFamily: fraunces.bold,
          fontSize: 18,
          fontWeight: '700'
        },
        headerRight: () => (
          <SettingsButton accessibilityLabel={t('nav.settingsA11yLabel')} onPress={onOpenSettings} />
        )
      })}
    >
      <Tabs.Screen name="Tonight" options={{ title: t('nav.tabs.tonight') }}>
        {() => (
          <WebPage>
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
          </WebPage>
        )}
      </Tabs.Screen>
      <Tabs.Screen name="SpotsMap" options={{ title: t('nav.tabs.map') }}>
        {() => <MapScreen spots={typedSpots} rankedSpots={rankedSpots} onOpenSpot={onOpenSpot} />}
      </Tabs.Screen>
      <Tabs.Screen name="AllSpots" options={{ title: t('nav.tabs.spots') }}>
        {() => (
          <WebPage>
            <AllSpotsScreen
              rankedSpots={rankedSpots}
              spotsById={spotsById}
              dataQuality={dataQuality}
              loading={loading}
              refresh={refresh}
              onOpenSpot={onOpenSpot}
            />
          </WebPage>
        )}
      </Tabs.Screen>
      <Tabs.Screen name="AuroraMap" options={{ title: t('nav.tabs.aurora') }}>
        {() => (
          <WebPage>
            <AuroraMapScreen kp={kp} />
          </WebPage>
        )}
      </Tabs.Screen>
      <Tabs.Screen name="Live" options={{ title: t('nav.tabs.live') }}>
        {() => (
          <WebPage>
            <LiveCamerasScreen />
          </WebPage>
        )}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

export default function App() {
  // See App.tsx for the fuller rationale: not gated on `fontsLoaded`, so
  // the page never blocks on the display face -- text using it falls back
  // to the system font (web's own font-display: swap equivalent) until
  // registration completes and the tree next re-renders.
  useFonts({ Fraunces_600SemiBold, Fraunces_700Bold, Fraunces_900Black });

  const forecast = useForecast();
  const { t } = useTranslation();

  const spotsById = useMemo(
    () => typedSpots.reduce<Record<string, Spot>>((acc, spot) => ({ ...acc, [spot.id]: spot }), {}),
    []
  );

  return (
    // `initialWindowMetrics` is a no-op on web (always `null` there -- see
    // InitialWindow.ts vs InitialWindow.native.ts in
    // react-native-safe-area-context), so this doesn't change web behavior;
    // it's here purely so App.tsx and App.web.tsx stay structurally
    // identical. See App.tsx for the native-side rationale.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ConsentGate>
        {/* Explicit flex column -- see App.tsx for why this is spelled out
            as real Views rather than relying on ConsentGate's fragment to
            flatten into implicitly-correct flex siblings. */}
        <View style={styles.root}>
          {/* Mounted once here, above the whole navigator -- see
              PreviewModeBanner's own header comment for why. */}
          <PreviewModeBanner />
          <View style={styles.navRoot}>
            <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: palette.nightSoft
            },
            headerTintColor: palette.textPrimary
          }}
        >
          <Stack.Screen name="Tabs" options={{ headerShown: false }}>
            {({ navigation }) => (
              <TabsRoot
                onOpenSpot={(spotId) => {
                  navigation.navigate('SpotDetail', { spotId });
                }}
                onOpenSettings={() => navigation.navigate('Settings')}
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
                  style={({ focused }: WebPressableState) => [styles.backButton, focused ? styles.focusRing : null]}
                  onPress={() => navigation.goBack()}
                >
                  <Ionicons name="chevron-back" size={20} color={palette.textPrimary} />
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </Pressable>
              )
            })}
          >
            {({ route }) => (
              <WebPage>
                <SpotDetailScreen
                  spot={spotsById[route.params.spotId]}
                  result={forecast.rankedSpots.find((r) => r.spotId === route.params.spotId)}
                  forecast={forecast.forecastsBySpotId[route.params.spotId]}
                />
              </WebPage>
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
                  style={({ focused }: WebPressableState) => [styles.backButton, focused ? styles.focusRing : null]}
                  onPress={() => navigation.goBack()}
                >
                  <Ionicons name="chevron-back" size={20} color={palette.textPrimary} />
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </Pressable>
              )
            })}
          >
            {() => (
              <WebPage>
                <SettingsScreen />
              </WebPage>
            )}
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
  webPage: {
    flex: 1,
    backgroundColor: palette.night
  },
  webPageInner: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center'
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    paddingHorizontal: space.xs,
    paddingVertical: space.xxs,
    borderRadius: radius.pill
  },
  backText: {
    color: palette.textPrimary,
    fontWeight: '700'
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any
});
