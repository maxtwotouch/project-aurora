import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AuroraAlertsSection } from '../components/AuroraAlertsSection';
import { DesignPreviewToggle } from '../components/DesignPreviewToggle';
import { LanguagePicker } from '../components/LanguagePicker';
import { PersonalAnalyticsToggle } from '../components/PersonalAnalyticsToggle';
import { TourismConsentToggle } from '../components/TourismConsentToggle';
import { UsageConsentToggle } from '../components/UsageConsentToggle';
import { PRIVACY_POLICY_URL } from '../constants/legal';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { focusRing } from '../theme/focusRing';
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

        <Text style={styles.subSectionTitle}>{t('settings.tourismSection')}</Text>
        <TourismConsentToggle />

        <Text style={styles.subSectionTitle}>{t('settings.productAnalyticsSection')}</Text>
        <PersonalAnalyticsToggle />

        <Text style={styles.subSectionTitle}>{t('settings.usageCountsSection')}</Text>
        <UsageConsentToggle />

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('consent.privacyPolicyLink')}
          style={({ pressed, focused }: WebPressableState) => [
            styles.linkRow,
            focused ? focusRing : null,
            pressed ? styles.linkRowPressed : null
          ]}
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        >
          <Text style={styles.linkRowText}>{t('consent.privacyPolicyLink')}</Text>
          <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('alerts.sectionTitle')}</Text>
        <AuroraAlertsSection />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('settings.designPreviewSection')}</Text>
        <DesignPreviewToggle />
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
  // Small-caps sub-heading within a card section (e.g. the three privacy
  // sub-sections) -- a smaller, muted variant of `sectionTitle` above:
  // same uppercase/letter-spacing small-caps treatment, but visually
  // subordinate to the card's own section title.
  subSectionTitle: {
    ...typography.eyebrow,
    fontSize: 10,
    lineHeight: 13,
    color: palette.textMuted,
    marginTop: space.sm,
    marginBottom: space.xxs
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
