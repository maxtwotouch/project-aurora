import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTripSession } from '../../trip/tripSession';
import { useTranslation } from '../../i18n/useTranslation';
import { palette } from '../../theme/palette';
import { focusRing } from '../../theme/focusRing';
import { radius, space, type WebPressableState } from '../../theme/tokens';
import { typography } from '../../theme/type';

type Props = {
  onPress: () => void;
};

/**
 * Tonight screen's entry point into Trip Mode (see src/screens/
 * TripModeScreen.tsx for the full feature). Purely presentational -- reads
 * `useTripSession()` to switch its own copy/CTA between the inactive
 * "start" pitch and the active "N spots visited" summary, but never starts
 * or ends a session itself; both of those actions only happen on the Trip
 * Mode screen the CTA navigates to.
 */
export function TripModeCard({ onPress }: Props) {
  const { t } = useTranslation();
  const session = useTripSession();

  const title = session.active ? t('tonightTripCard.activeTitle') : t('tonightTripCard.title');
  const body = session.active
    ? session.visitedSpotIds.length > 0
      ? t('tonightTripCard.activeBody', { count: session.visitedSpotIds.length })
      : t('tonightTripCard.activeBodyNone')
    : t('tonightTripCard.body');
  const cta = session.active ? t('tonightTripCard.openCta') : t('tonightTripCard.cta');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed, focused }: WebPressableState) => [
        styles.card,
        Platform.OS === 'web' ? styles.cardHover : null,
        focused ? focusRing : null,
        pressed ? styles.cardPressed : null
      ]}
      onPress={onPress}
    >
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          {session.active ? <View style={styles.activeDot} accessibilityElementsHidden importantForAccessibility="no" /> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.body}>{body}</Text>
      </View>
      <Text style={styles.cta}>{cta}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.lg,
    padding: space.md,
    borderRadius: radius.xl,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  cardHover: {
    borderColor: palette.cardBorderStrong
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }]
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: space.xxs
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.auroraGreen
  },
  title: {
    ...typography.heading,
    color: palette.textPrimary
  },
  body: {
    ...typography.bodySmall,
    color: palette.textSecondary
  },
  cta: {
    ...typography.bodyStrong,
    color: palette.auroraMint
  }
});
