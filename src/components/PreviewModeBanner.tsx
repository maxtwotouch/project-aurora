import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { usePreviewMode } from '../preview/previewMode';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { space } from '../theme/tokens';
import { typography } from '../theme/type';

/**
 * HONESTY GUARD: mounted once at the app root (see App.tsx / App.web.tsx),
 * above the navigator, rather than per screen -- so it is structurally
 * impossible for a screen showing the sample forecast (Settings > Design
 * preview, src/preview/previewMode.ts) to be missing it. Every main screen
 * sits below this in the tree, so a screenshot or a glance can never be
 * mistaken for a real forecast while preview mode is on.
 *
 * Deliberately NOT styled like DataQualityBanner (warning yellow,
 * warningSurface): a different color family (copper/accentWarm) so this
 * reads as its own distinct kind of notice -- "you turned this on" -- not
 * a data-quality problem with a live feed.
 */
export function PreviewModeBanner() {
  const { enabled } = usePreviewMode();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!enabled) return null;

  return (
    <View style={[styles.banner, { paddingTop: space.xs + insets.top }]} accessibilityRole="alert">
      <Ionicons name="flask-outline" size={14} color={palette.textOnAccentWarmSurface} />
      <Text style={styles.text}>{t('preview.banner')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    paddingHorizontal: space.md,
    paddingBottom: space.xxs,
    backgroundColor: palette.accentWarmSurface,
    borderBottomWidth: 1,
    borderBottomColor: palette.accentWarm
  },
  text: {
    ...typography.caption,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: palette.textOnAccentWarmSurface,
    textAlign: 'center'
  }
});
