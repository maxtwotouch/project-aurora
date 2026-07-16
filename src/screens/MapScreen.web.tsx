import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { track } from '../analytics/events';
import { ScoreBadge } from '../components/ScoreBadge';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { elevation, radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';
import type { Spot, SpotScoreResult } from '../types';

type Props = {
  spots: Spot[];
  rankedSpots: SpotScoreResult[];
  onOpenSpot: (spotId: string) => void;
};

export function MapScreen({ spots, rankedSpots, onOpenSpot }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const [selected, setSelected] = useState<Spot | null>(null);

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
    track('navigate_pressed', spot.id);
    const url = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lon}`;
    void Linking.openURL(url);
  };

  useEffect(() => {
    setSelected((current) => current ?? defaultSpot);
  }, [defaultSpot]);

  const list = (
    <ScrollView contentContainerStyle={isWide ? styles.listWide : styles.listNarrow}>
      <Text style={styles.webTitle}>{t('mapScreen.webTitle')}</Text>
      <View style={styles.note}>
        <Ionicons name="information-circle" size={18} color={palette.auroraIce} />
        <Text style={styles.noteText}>{t('mapScreen.selectionNoteWeb')}</Text>
      </View>
      {spots.map((spot) => {
        const isActive = selected?.id === spot.id;
        return (
          <Pressable
            key={spot.id}
            accessibilityRole="button"
            accessibilityLabel={t('mapScreen.spotScoreA11y', { name: spot.name, score: scoreBySpot[spot.id] ?? 0 })}
            style={({ hovered, focused }: WebPressableState) => [
              styles.webItem,
              isActive ? styles.webItemActive : null,
              hovered ? styles.webItemHover : null,
              focused ? styles.focusRing : null
            ]}
            onPress={() => setSelected(spot)}
          >
            <View style={styles.webItemCopy}>
              <Text style={styles.webItemName}>{spot.name}</Text>
              <Text style={styles.webItemMeta}>{t('mapScreen.distanceCityCenterShort', { km: spot.distanceKm })}</Text>
            </View>
            <ScoreBadge score={scoreBySpot[spot.id] ?? 0} />
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const detail = selected ? (
    <View style={isWide ? styles.detailPaneWide : styles.sheet}>
      <View style={styles.sheetTop}>
        <View style={styles.sheetCopy}>
          <Text style={styles.sheetEyebrow}>{t('mapScreen.selectedStop')}</Text>
          <Text style={styles.sheetTitle}>{selected.name}</Text>
          <Text style={styles.sheetMeta}>{t('common.distanceTromsoCenter', { km: selected.distanceKm })}</Text>
          <Text style={styles.sheetMeta}>{t('mapScreen.forecastScore', { score: scoreBySpot[selected.id] ?? 0 })}</Text>
        </View>
        <ScoreBadge score={scoreBySpot[selected.id] ?? 0} size="lg" />
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          style={({ hovered, focused }: WebPressableState) => [
            styles.btn,
            hovered ? styles.btnHover : null,
            focused ? styles.focusRing : null
          ]}
          onPress={() => setSelected(null)}
        >
          <Text style={styles.btnText}>{t('mapScreen.clear')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ hovered, focused }: WebPressableState) => [
            styles.btn,
            hovered ? styles.btnHover : null,
            focused ? styles.focusRing : null
          ]}
          onPress={() => onOpenSpot(selected.id)}
        >
          <Text style={styles.btnText}>{t('mapScreen.details')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ hovered, focused }: WebPressableState) => [
            styles.btn,
            styles.btnPrimary,
            hovered ? styles.btnPrimaryHover : null,
            focused ? styles.focusRing : null
          ]}
          onPress={() => navigateToSpot(selected)}
        >
          <Text style={[styles.btnText, styles.btnTextPrimary]}>{t('common.navigate')}</Text>
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={isWide ? styles.detailPaneWide : styles.sheet}>
      <Text style={styles.sheetTitle}>{t('mapScreen.noSpotSelected')}</Text>
      <Text style={styles.sheetMeta}>{t('mapScreen.noSpotSelectedText')}</Text>
    </View>
  );

  if (isWide) {
    return (
      <View style={styles.wideContainer}>
        <View style={styles.wideList}>{list}</View>
        <View style={styles.wideDetail}>{detail}</View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {list}
      {selected ? detail : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.night
  },
  wideContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: palette.night,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center'
  },
  wideList: {
    width: 360,
    borderRightWidth: 1,
    borderRightColor: palette.borderHairline
  },
  wideDetail: {
    flex: 1,
    padding: space.xl
  },
  listNarrow: {
    padding: space.sm,
    gap: space.xs
  },
  listWide: {
    padding: space.md,
    gap: space.xs
  },
  webTitle: {
    ...typography.bodySmall,
    color: palette.textSecondary,
    marginBottom: space.xxs
  },
  note: {
    flexDirection: 'row',
    gap: space.xs,
    alignItems: 'flex-start',
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.borderHairline,
    backgroundColor: palette.surfaceOverlay,
    marginBottom: space.xs
  },
  noteText: {
    flex: 1,
    ...typography.bodySmall,
    color: palette.textSecondary
  },
  webItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: palette.cardElevated,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    borderRadius: radius.sm,
    padding: space.sm
  },
  webItemCopy: {
    flex: 1,
    minWidth: 0
  },
  webItemActive: {
    borderColor: palette.auroraGreen
  },
  webItemHover: {
    backgroundColor: palette.chipSurfaceActive
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any,
  webItemName: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  webItemMeta: {
    ...typography.caption,
    color: palette.textSecondary,
    marginTop: 3
  },
  detailPaneWide: {
    borderRadius: radius.xl,
    padding: space.lg,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    backgroundColor: palette.nightPanel,
    gap: space.md
  },
  sheet: {
    position: 'absolute',
    left: space.sm,
    right: space.sm,
    bottom: space.md,
    backgroundColor: palette.nightPanel,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    ...elevation.lg
  },
  sheetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm
  },
  sheetCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  sheetEyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  sheetTitle: {
    ...typography.heading,
    color: palette.textPrimary
  },
  sheetMeta: {
    ...typography.bodySmall,
    color: palette.textSecondary
  },
  actions: {
    flexDirection: 'row',
    marginTop: space.sm,
    gap: space.xs
  },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong,
    borderRadius: radius.sm,
    paddingVertical: space.xs,
    alignItems: 'center'
  },
  btnHover: {
    backgroundColor: palette.chipSurfaceActive
  },
  btnPrimary: {
    backgroundColor: palette.auroraGreen,
    borderColor: palette.auroraGreen
  },
  btnPrimaryHover: {
    backgroundColor: palette.auroraGlow
  },
  btnText: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  btnTextPrimary: {
    color: palette.textOnAurora
  }
});
