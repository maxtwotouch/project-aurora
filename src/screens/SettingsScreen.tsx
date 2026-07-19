import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LanguagePicker } from '../components/LanguagePicker';
import { UsageConsentToggle } from '../components/UsageConsentToggle';
import { PRIVACY_POLICY_URL } from '../constants/legal';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

/**
 * Single, shared implementation for both native and web (same pattern as
 * LiveCamerasScreen) -- there is nothing platform-specific here, just
 * stacked sections rendering existing components.
 */
export function SettingsScreen() {
  const { t } = useTranslation();

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
    >
      <Text style={styles.title}>{t('settings.title')}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('settings.languageSection')}</Text>
        <LanguagePicker />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('settings.privacySection')}</Text>
        <UsageConsentToggle />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('consent.privacyPolicyLink')}
          style={({ pressed, focused }: WebPressableState) => [
            styles.linkRow,
            focused ? styles.focusRing : null,
            pressed ? styles.linkRowPressed : null
          ]}
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        >
          <Text style={styles.linkRowText}>{t('consent.privacyPolicyLink')}</Text>
          <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('settings.aboutSection')}</Text>
        <Text style={styles.aboutAppName}>{t('settings.aboutAppName')}</Text>
        <Text style={styles.aboutDataSources}>{t('settings.aboutDataSources')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space.md,
    paddingBottom: space.xxl,
    backgroundColor: palette.night,
    gap: space.sm
  },
  title: {
    ...typography.title,
    color: palette.textPrimary,
    marginBottom: space.xxs
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: radius.xl,
    padding: space.md,
    borderWidth: 1,
    borderColor: palette.cardBorder
  },
  sectionTitle: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  linkRow: {
    marginTop: space.sm,
    minHeight: 44,
    paddingVertical: space.xs,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.chipSurface,
    borderWidth: 1,
    borderColor: palette.borderHairline
  },
  linkRowPressed: {
    opacity: 0.9
  },
  linkRowText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.textPrimary
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any,
  aboutAppName: {
    ...typography.bodyStrong,
    color: palette.textPrimary,
    marginTop: space.xs
  },
  aboutDataSources: {
    ...typography.caption,
    color: palette.textMuted,
    marginTop: space.xxs
  }
});
