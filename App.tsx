import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import type { Theme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import spots from './src/data/spots.json';
import { useForecast } from './src/hooks/useForecast';
import { AllSpotsScreen } from './src/screens/AllSpotsScreen';
import { AuroraMapScreen } from './src/screens/AuroraMapScreen';
import { LiveCamerasScreen } from './src/screens/LiveCamerasScreen';
import { MapScreen } from './src/screens/MapScreen.native';
import { SpotDetailScreen } from './src/screens/SpotDetailScreen.native';
import { TonightScreen } from './src/screens/TonightScreen';
import { palette } from './src/theme/palette';
import type { GeneralForecastScore, KpTrend, Spot, SpotScoreResult } from './src/types';

type RootStackParamList = {
  Tabs: undefined;
  SpotDetail: { spotId: string };
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

type TabsRootProps = {
  onOpenSpot: (spotId: string) => void;
  rankedSpots: SpotScoreResult[];
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

function TabsRoot({
  onOpenSpot,
  rankedSpots,
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
}: TabsRootProps) {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: palette.auroraGreen,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarIcon: ({ color, size, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'ellipse';

          if (route.name === 'Tonight') {
            iconName = focused ? 'moon' : 'moon-outline';
          } else if (route.name === 'SpotsMap') {
            iconName = focused ? 'map' : 'map-outline';
          } else if (route.name === 'AllSpots') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'AuroraMap') {
            iconName = focused ? 'color-wand' : 'color-wand-outline';
          } else if (route.name === 'Live') {
            iconName = focused ? 'videocam' : 'videocam-outline';
          }

          return (
            <View style={[styles.tabIconWrap, focused ? styles.tabIconWrapActive : null]}>
              <Ionicons name={iconName} size={size} color={color} />
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
          height: 78,
          paddingHorizontal: 10,
          paddingTop: 10,
          paddingBottom: 14
        },
        tabBarItemStyle: {
          minWidth: 0,
          borderRadius: 18
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
        headerShown: false,
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '800'
        },
        headerShadowVisible: false,
        headerTitleAlign: 'left',
        headerBackground: () => <View style={styles.headerBackground} />
      })}
    >
      <Tabs.Screen name="Tonight" options={{ title: 'Tonight' }}>
        {() => (
          <TonightScreen
            onOpenSpot={onOpenSpot}
            loading={loading}
            error={error}
            lastUpdatedAt={lastUpdatedAt}
            kp={kp}
            topSpots={topSpots}
            closeSpots={closeSpots}
            spotsById={spotsById}
            tonightScore={tonightScore}
            tomorrowScore={tomorrowScore}
            sightingPossibleFrom={sightingPossibleFrom}
            recommendation={recommendation}
            refresh={refresh}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="SpotsMap" options={{ title: 'Map' }}>
        {() => <MapScreen spots={typedSpots} rankedSpots={rankedSpots} onOpenSpot={onOpenSpot} />}
      </Tabs.Screen>
      <Tabs.Screen name="AllSpots" options={{ title: 'Spots' }}>
        {() => (
          <AllSpotsScreen
            rankedSpots={rankedSpots}
            spotsById={spotsById}
            loading={loading}
            refresh={refresh}
            onOpenSpot={onOpenSpot}
          />
        )}
      </Tabs.Screen>
      <Tabs.Screen name="AuroraMap" options={{ title: 'Aurora' }}>
        {() => <AuroraMapScreen kp={kp} />}
      </Tabs.Screen>
      <Tabs.Screen name="Live" options={{ title: 'Live' }}>
        {() => <LiveCamerasScreen />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

export default function App() {
  const forecast = useForecast();

  const spotsById = useMemo(
    () => typedSpots.reduce<Record<string, Spot>>((acc, spot) => ({ ...acc, [spot.id]: spot }), {}),
    []
  );

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: palette.night
          },
          headerTintColor: palette.textPrimary,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: '800'
          },
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
              rankedSpots={forecast.rankedSpots}
              loading={forecast.loading}
              error={forecast.error}
              lastUpdatedAt={forecast.lastUpdatedAt}
              kp={forecast.kp}
              topSpots={forecast.topSpots}
              closeSpots={forecast.closeSpots}
              spotsById={forecast.spotsById}
              tonightScore={forecast.tonightScore}
              tomorrowScore={forecast.tomorrowScore}
              sightingPossibleFrom={forecast.sightingPossibleFrom}
              recommendation={forecast.recommendation}
              refresh={forecast.refresh}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="SpotDetail"
          options={({ route, navigation }) => ({
            title: spotsById[route.params.spotId]?.name ?? 'Spot Details',
            headerBackVisible: false,
            headerLeft: () => (
              <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
                <Ionicons name="chevron-back" size={20} color={palette.textPrimary} />
                <Text style={styles.backText}>Back</Text>
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerBackground: {
    flex: 1,
    backgroundColor: palette.night
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#132330'
  },
  backText: {
    color: palette.textPrimary,
    fontWeight: '700'
  },
  tabIconWrap: {
    minWidth: 34,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999
  },
  tabIconWrapActive: {
    backgroundColor: '#214355'
  }
});
