import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { liveCameras, type LiveCamera } from '../data/liveCameras';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';

export function LiveCamerasScreen() {
  const { t } = useTranslation();
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
  const groupedCameras = useMemo(() => {
    const groups = new Map<string, LiveCamera[]>();

    visibleCameras.forEach((camera) => {
      const key = camera.area;
      const current = groups.get(key) ?? [];
      current.push(camera);
      groups.set(key, current);
    });

    return Array.from(groups.entries()).map(([area, cameras]) => ({ area, cameras }));
  }, [visibleCameras]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
    >
      <View style={styles.headerCard}>
        <Text style={styles.eyebrow}>{t('liveCameras.eyebrow')}</Text>
        <Text style={styles.title}>{t('liveCameras.title')}</Text>
        <Text style={styles.subtitle}>{t('liveCameras.subtitle')}</Text>
        <Text style={styles.headerMeta}>{t('liveCameras.headerMeta')}</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>{t('liveCameras.layoutLabel')}</Text>
            <Text style={styles.summaryValue}>{t('liveCameras.layoutValue')}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>{t('liveCameras.focusLabel')}</Text>
            <Text style={styles.summaryValue}>{t('liveCameras.focusValue')}</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryLabel}>{t('liveCameras.actionLabel')}</Text>
            <Text style={styles.summaryValue}>{t('liveCameras.actionValue')}</Text>
          </View>
        </View>
      </View>

      {visibleCameras.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('liveCameras.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('liveCameras.emptyText')}</Text>
        </View>
      ) : null}

      {groupedCameras.map(({ area, cameras }) => (
        <View key={area} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardCopy}>
              <Text style={styles.name}>{area}</Text>
              <Text style={styles.meta}>
                {cameras.length > 1 ? t('liveCameras.feedsCount', { count: cameras.length }) : t('liveCameras.singleCamera')}
              </Text>
            </View>
            <View style={styles.areaPill}>
              <Text style={styles.areaPillText}>{t('liveCameras.viewsCount', { count: cameras.length })}</Text>
            </View>
          </View>

          <View style={styles.cameraGrid}>
            {cameras.map((camera) => (
              <View key={camera.id} style={styles.cameraTile}>
                {camera.imageUrl && !failedCameraIds[camera.id] ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('liveCameras.expandCamera', { name: camera.name })}
                    style={({ pressed }) => [pressed ? styles.mediaPressed : null]}
                    onPress={() => setFullscreen({ uri: `${camera.imageUrl}?t=${refreshToken}`, name: camera.name })}
                  >
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
                  <CameraUnavailable camera={camera} compact />
                )}

                <Text style={styles.cameraName} numberOfLines={2}>
                  {camera.name}
                </Text>
                <Text style={styles.cameraMeta} numberOfLines={2}>
                  {camera.provider}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.sourceButton, pressed ? styles.buttonPressed : null]}
            onPress={() => void Linking.openURL(cameras[0].sourceUrl)}
          >
            <Text style={styles.sourceButtonText}>{t('liveCameras.openSourcePage')}</Text>
          </Pressable>
        </View>
      ))}

      <Modal visible={Boolean(fullscreen)} transparent animationType="fade" onRequestClose={() => setFullscreen(null)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setFullscreen(null)} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{fullscreen?.name ?? t('liveCameras.liveFeedFallback')}</Text>
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

function CameraUnavailable({ camera, compact = false }: { camera: LiveCamera; compact?: boolean }) {
  const { t } = useTranslation();

  return (
    <View style={[styles.unavailableCard, compact ? styles.unavailableCardCompact : null]}>
      <Text style={styles.unavailableTitle}>{t('liveCameras.unavailableTitle')}</Text>
      <Text style={styles.unavailableText}>{t('liveCameras.unavailableText', { name: camera.name })}</Text>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.unavailableButton, pressed ? styles.buttonPressed : null]}
        onPress={() => void Linking.openURL(camera.sourceUrl)}
      >
        <Text style={styles.unavailableButtonText}>{t('liveCameras.openSource')}</Text>
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
  headerMeta: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16
  },
  summaryTile: {
    flexGrow: 1,
    minWidth: 96,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#152734',
    borderWidth: 1,
    borderColor: '#284657'
  },
  summaryLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 4
  },
  summaryValue: {
    color: palette.textPrimary,
    fontSize: 14,
    fontWeight: '700'
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
  cameraGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12
  },
  cameraTile: {
    width: '48%',
    minWidth: 140
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  mediaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.988 }]
  },
  unavailableCard: {
    minHeight: 192,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: '#132330',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 10
  },
  unavailableCardCompact: {
    minHeight: 160,
    marginBottom: 10
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
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
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
  cameraName: {
    color: palette.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19
  },
  cameraMeta: {
    color: palette.textSecondary,
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17
  },
  sourceButton: {
    minHeight: 44,
    marginTop: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#355468',
    backgroundColor: '#132836'
  },
  sourceButtonText: {
    color: palette.textPrimary,
    fontWeight: '700'
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
