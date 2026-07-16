import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useConsent } from '../analytics/consent';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

/**
 * The one place a user can change their mind after the first-open prompt.
 * Turning this off must stop new events immediately (see events.ts, which
 * gates every track() call on live consent state) and drop anything
 * already queued but not yet sent.
 */
export function UsageConsentToggle() {
  const { state, loaded, accept, decline } = useConsent();
  const { t } = useTranslation();

  if (!loaded) return null;

  const isOn = state === 'accepted';

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{t('consent.toggleLabel')}</Text>
        <Text style={styles.helper}>{isOn ? t('consent.toggleOnHelper') : t('consent.toggleOffHelper')}</Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: isOn }}
        accessibilityLabel={t('consent.toggleLabel')}
        style={({ pressed, focused }: WebPressableState) => [
          styles.toggleTrack,
          isOn ? styles.toggleTrackOn : null,
          focused ? styles.focusRing : null,
          pressed ? styles.togglePressed : null
        ]}
        onPress={() => (isOn ? decline() : accept())}
      >
        <View style={[styles.toggleKnob, isOn ? styles.toggleKnobOn : null]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.borderHairline
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.textPrimary
  },
  helper: {
    ...typography.caption,
    color: palette.textMuted
  },
  toggleTrack: {
    width: 46,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: palette.chipSurface,
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong,
    padding: 2,
    justifyContent: 'center'
  },
  toggleTrackOn: {
    backgroundColor: palette.auroraDeep,
    borderColor: palette.auroraGreen
  },
  togglePressed: {
    opacity: 0.9
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.textPrimary
  },
  toggleKnobOn: {
    transform: [{ translateX: 18 }]
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any
});
