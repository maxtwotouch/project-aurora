import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useTranslation } from '../../i18n/useTranslation';
import { radius, space, type WebPressableState } from '../../theme/tokens';
import { palette } from '../../theme/palette';
import { typography } from '../../theme/type';

type Props = {
  opacity: Animated.Value;
};

/** Row of quick links to the full spot list, map, cameras and aurora map. */
export function QuickNavChips({ opacity }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  return (
    <Animated.View style={[styles.quickNavRow, { opacity }]}>
      <Pressable
        accessibilityRole="link"
        style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
        onPress={() => navigation.navigate('AllSpots')}
      >
        <Text style={styles.quickNavChipText}>{t('tonight.quickNav.fullSpotList')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
        onPress={() => navigation.navigate('SpotsMap')}
      >
        <Text style={styles.quickNavChipText}>{t('tonight.quickNav.map')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
        onPress={() => navigation.navigate('Live')}
      >
        <Text style={styles.quickNavChipText}>{t('tonight.quickNav.cameras')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        style={({ focused }: WebPressableState) => [styles.quickNavChip, focused ? styles.focusRing : null]}
        onPress={() => navigation.navigate('AuroraMap')}
      >
        <Text style={styles.quickNavChipText}>{t('tonight.quickNav.auroraMap')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  quickNavRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.lg
  },
  quickNavChip: {
    minHeight: 40,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong
  },
  quickNavChipText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.auroraMint
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any
});
