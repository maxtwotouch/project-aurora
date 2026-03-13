import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { liveCameras, type LiveCamera } from '../data/liveCameras';
import { palette } from '../theme/palette';

export function LiveCamerasScreen() {
  const [refreshToken, setRefreshToken] = useState<number>(Date.now());
  const [fullscreen, setFullscreen] = useState<{ uri: string; name: string } | null>(null);
  const [failedCameraIds, setFailedCameraIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = setInterval(() => {
      setRefreshToken(Date.now());
    }, 60 * 1000);

    return () => clearInterval(id);
  }, []);

  const visibleCameras = useMemo(() => liveCameras.filter((camera) => Boolean(camera.imageUrl)), []);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
    >
      <View style={styles.headerCard}>
        <Text style={styles.eyebrow}>Live cameras</Text>
        <Text style={styles.title}>Sky check</Text>
        <Text style={styles.subtitle}>Quick horizon check before you head out. Auto-refreshes every minute.</Text>
      </View>

      {visibleCameras.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No live cameras available</Text>
          <Text style={styles.emptyText}>Camera sources are temporarily unavailable. Try again later.</Text>
        </View>
      ) : null}

      {visibleCameras.map((camera) => (
        <View key={camera.id} style={styles.card}>
          {camera.imageUrl && !failedCameraIds[camera.id] ? (
            <Pressable onPress={() => setFullscreen({ uri: `${camera.imageUrl}?t=${refreshToken}`, name: camera.name })}>
              <Image
                source={{ uri: `${camera.imageUrl}?t=${refreshToken}` }}
                style={styles.image}
                resizeMode="cover"
                onError={() => {
                  setFailedCameraIds((current) => ({ ...current, [camera.id]: true }));
                }}
              />
            </Pressable>
          ) : (
            <CameraUnavailable camera={camera} />
          )}

          <View style={styles.cardHeader}>
            <View style={styles.cardCopy}>
              <Text style={styles.name}>{camera.name}</Text>
              <Text style={styles.meta}>{camera.provider}</Text>
            </View>
            <View style={styles.areaPill}>
              <Text style={styles.areaPillText}>{camera.area}</Text>
            </View>
          </View>

          {camera.note ? <Text style={styles.note}>{camera.note}</Text> : null}
        </View>
      ))}

      <Modal visible={Boolean(fullscreen)} transparent animationType="fade" onRequestClose={() => setFullscreen(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setFullscreen(null)} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{fullscreen?.name ?? 'Live feed'}</Text>
            <Pressable onPress={() => setFullscreen(null)} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={palette.textPrimary} />
            </Pressable>
          </View>
          {fullscreen ? <Image source={{ uri: fullscreen.uri }} style={styles.fullscreenImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

function CameraUnavailable({ camera }: { camera: LiveCamera }) {
  return (
    <View style={styles.unavailableCard}>
      <Text style={styles.unavailableTitle}>Live image unavailable</Text>
      <Text style={styles.unavailableText}>
        {camera.name} did not return an image. Open the source page to check whether the feed is offline.
      </Text>
      <Pressable style={styles.unavailableButton} onPress={() => void Linking.openURL(camera.sourceUrl)}>
        <Text style={styles.unavailableButtonText}>Open source</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 18,
    paddingBottom: 30,
    backgroundColor: palette.night
  },
  headerCard: {
    backgroundColor: palette.nightPanel,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 14
  },
  eyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6
  },
  title: {
    color: palette.textPrimary,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    marginBottom: 6
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  emptyCard: {
    backgroundColor: palette.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 14
  },
  emptyTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4
  },
  emptyText: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 21
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 22,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 12
  },
  image: {
    width: '100%',
    height: 192,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  unavailableCard: {
    minHeight: 192,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: '#132330',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 10
  },
  unavailableTitle: {
    color: palette.textPrimary,
    fontSize: 18,
    fontWeight: '800'
  },
  unavailableText: {
    color: palette.textSecondary,
    textAlign: 'center',
    lineHeight: 20
  },
  unavailableButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.auroraGreen
  },
  unavailableButtonText: {
    color: palette.textOnAurora,
    fontWeight: '800'
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start'
  },
  cardCopy: {
    flex: 1,
    minWidth: 0
  },
  name: {
    color: palette.textPrimary,
    fontWeight: '800',
    fontSize: 20,
    lineHeight: 24
  },
  meta: {
    color: palette.textSecondary,
    marginTop: 4
  },
  areaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#17303c',
    borderWidth: 1,
    borderColor: '#2e5667'
  },
  areaPillText: {
    color: palette.auroraMint,
    fontSize: 12,
    fontWeight: '700'
  },
  note: {
    color: palette.textMuted,
    marginTop: 10,
    lineHeight: 20
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#041018f2',
    justifyContent: 'center'
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8
  },
  modalTitle: {
    color: palette.textPrimary,
    fontSize: 16,
    fontWeight: '700'
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10202be0'
  },
  fullscreenImage: {
    width: '100%',
    height: '86%'
  }
});
