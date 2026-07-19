import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePreviewMode } from '../preview/previewMode';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

/**
 * Settings > "Design preview (sample data)". Same on/off switch shape as
 * UsageConsentToggle, backed by src/preview/previewMode.ts instead of the
 * analytics consent store. See src/components/PreviewModeBanner.tsx for the
 * honesty-guard banner this turns on everywhere while enabled.
 */
export function DesignPreviewToggle() {
  const { enabled, loaded, setEnabled } = usePreviewMode();
  const { t } = useTranslation();

  if (!loaded) return null;

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{t('settings.designPreviewLabel')}</Text>
        <Text style={styles.helper}>{t('settings.designPreviewHelper')}</Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        accessibilityLabel={t('settings.designPreviewLabel')}
        style={({ pressed, focused }: WebPressableState) => [
          styles.toggleTrack,
          enabled ? styles.toggleTrackOn : null,
          focused ? styles.focusRing : null,
          pressed ? styles.togglePressed : null
        ]}
        onPress={() => setEnabled(!enabled)}
      >
        <View style={[styles.toggleKnob, enabled ? styles.toggleKnobOn : null]} />
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
    backgroundColor: palette.accentWarmSurface,
    borderColor: palette.accentWarm
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
