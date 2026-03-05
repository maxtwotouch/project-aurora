import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { liveCameras } from '../data/liveCameras';
import { palette } from '../theme/palette';

export function LiveCamerasScreen() {
  const [refreshToken, setRefreshToken] = useState<number>(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setRefreshToken(Date.now());
    }, 60 * 1000);

    return () => clearInterval(id);
  }, []);

  const visibleCameras = useMemo(() => liveCameras.filter((camera) => Boolean(camera.imageUrl)), []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Live Cameras</Text>
      <Text style={styles.subtitle}>Real-time camera images around Tromso. Auto-refresh every minute.</Text>

      {visibleCameras.map((camera) => (
        <View key={camera.id} style={styles.card}>
          {camera.imageUrl ? (
            <Image source={{ uri: `${camera.imageUrl}?t=${refreshToken}` }} style={styles.image} resizeMode="cover" />
          ) : null}

          <Text style={styles.name}>{camera.name}</Text>
          <Text style={styles.meta}>{camera.provider}</Text>
          <Text style={styles.meta}>Area: {camera.area}</Text>
          {camera.note ? <Text style={styles.note}>{camera.note}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 30,
    backgroundColor: palette.night
  },
  title: {
    color: palette.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4
  },
  subtitle: {
    color: palette.textMuted,
    marginBottom: 12
  },
  card: {
    backgroundColor: palette.cardElevated,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 12
  },
  image: {
    width: '100%',
    height: 170,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334f73'
  },
  name: {
    color: palette.textPrimary,
    fontWeight: '700',
    fontSize: 16
  },
  meta: {
    color: palette.textSecondary,
    marginTop: 2
  },
  note: {
    color: palette.textMuted,
    marginTop: 6
  }
});
