import { useMemo } from 'react';
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
import { MapScreen } from './src/screens/MapScreen';
import { SpotDetailScreen } from './src/screens/SpotDetailScreen';
import { TonightScreen } from './src/screens/TonightScreen';
import { palette } from './src/theme/palette';
import type { KpTrend, Spot, SpotScoreResult } from './src/types';

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
  kp: KpTrend;
  topSpots: SpotScoreResult[];
  spotsById: Record<string, Spot>;
  auroraTonightScore: number;
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
  spotsById,
  auroraTonightScore,
  recommendation,
  refresh
}: TabsRootProps) {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: palette.auroraGreen,
        tabBarInactiveTintColor: palette.textSecondary,
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

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarStyle: {
          backgroundColor: palette.nightSoft,
          borderTopColor: palette.cardBorder,
          height: 66,
          paddingHorizontal: 6,
          paddingTop: 8,
          paddingBottom: 8
        },
        tabBarItemStyle: {
          minWidth: 0
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
          fontSize: 18,
          fontWeight: '700'
        }
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
            spotsById={spotsById}
            auroraTonightScore={auroraTonightScore}
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
              rankedSpots={forecast.rankedSpots}
              loading={forecast.loading}
              error={forecast.error}
              lastUpdatedAt={forecast.lastUpdatedAt}
              kp={forecast.kp}
              topSpots={forecast.topSpots}
              spotsById={forecast.spotsById}
              auroraTonightScore={forecast.auroraTonightScore}
              recommendation={forecast.recommendation}
              refresh={forecast.refresh}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="SpotDetail"
          options={({ route }) => ({ title: spotsById[route.params.spotId]?.name ?? 'Spot Details' })}
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
