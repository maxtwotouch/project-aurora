import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n/useTranslation';
import { palette } from '../../theme/palette';
import { radius, space } from '../../theme/tokens';
import { typography } from '../../theme/type';
import type { Spot } from '../../types';
import type { UserLocationCoords } from '../../hooks/useUserLocation';

type Props = {
  coords: UserLocationCoords;
  spots: Spot[];
  scoreBySpotId: Record<string, number>;
};

/**
 * Web has no `react-native-maps` -- rather than a broken/empty map surface,
 * this mirrors the "your area" section's intent (nearby spots, at a
 * glance) with a muted note card; the actual spot list with distances
 * already renders below (Best nearby / Other nearby), so nothing is lost.
 */
// `coords`/`scoreBySpotId` are accepted (see the shared `Props` type above)
// purely so this component's signature matches the native twin
// (TripAreaMap.native.tsx) -- TripModeScreen.tsx's one call site needs to
// typecheck against whichever platform file Metro resolves at bundle time.
// The web variant has nothing to draw with them.
export function TripAreaMap({ spots }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.note} accessibilityRole="text">
      <Text style={styles.text}>{t('tripMode.webNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    minHeight: 80,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceSunken,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    justifyContent: 'center'
  },
  text: {
    ...typography.bodySmall,
    color: palette.textSecondary
  }
});
