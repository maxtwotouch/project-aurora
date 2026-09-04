import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { useTranslation } from '../../i18n/useTranslation';
import { mapDarkStyle } from '../../theme/mapDarkStyle';
import { radius } from '../../theme/tokens';
import type { Spot } from '../../types';
import type { UserLocationCoords } from '../../hooks/useUserLocation';

type Props = {
  coords: UserLocationCoords;
  spots: Spot[];
  scoreBySpotId: Record<string, number>;
};

/**
 * Trip Mode's "your area" map -- a small, always-centred-on-the-user
 * overview of the nearby spots, NOT the full-screen spot browser
 * (src/screens/MapScreen.native.tsx). Coordinates come straight from
 * useUserLocation() (on-device only, see that hook's header) and are
 * never persisted or transmitted by this component.
 */
export function TripAreaMap({ coords, spots, scoreBySpotId }: Props) {
  const { t } = useTranslation();

  return (
    <MapView
      style={styles.map}
      region={{
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.35,
        longitudeDelta: 0.35
      }}
      customMapStyle={mapDarkStyle}
      showsUserLocation
      accessibilityLabel={t('tripMode.mapA11y')}
    >
      {spots.map((spot) => (
        <Marker
          key={spot.id}
          coordinate={{ latitude: spot.lat, longitude: spot.lon }}
          title={`${spot.name} · ${t('tripMode.scoreLabel', { score: scoreBySpotId[spot.id] ?? 0 })}`}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden'
  }
});
