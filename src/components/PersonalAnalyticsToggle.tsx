import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePersonalAnalyticsConsent } from '../analytics/personalAnalyticsConsent';
import { PRIVACY_POLICY_URL } from '../constants/legal';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

/**
 * Person-level product analytics' Settings toggle -- a THIRD, INDEPENDENT
 * opt-in from both UsageConsentToggle (aggregate usage counters) and
 * TripModeConsentToggle above/below it (see
 * ../analytics/personalAnalyticsConsent.ts, docs/analytics-pivot.md PR 2).
 *
 * Unlike TripModeConsentToggle, this dimension IS also asked about in the
 * first-open flow (see ConsentGate) -- this toggle is the "change your mind
 * afterwards" surface, mirroring UsageConsentToggle's role for the
 * aggregate pipeline, not the only place the question is ever asked.
 *
 * Turning this off must stop any further collection immediately and
 * trigger deletion of the person's data with PostHog once the SDK exists
 * (docs/analytics-pivot.md section 2.3) -- there is no collection or
 * deletion code to wire up yet, since the SDK itself is a later PR (PR 3);
 * this only records the choice.
 */
export function PersonalAnalyticsToggle() {
  const { state, loaded, accept, decline } = usePersonalAnalyticsConsent();
  const { t } = useTranslation();

  if (!loaded) return null;

  const isOn = state === 'accepted';

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{t('personalAnalyticsConsent.toggleLabel')}</Text>
        <Text style={styles.helper}>
          {isOn ? t('personalAnalyticsConsent.toggleOnHelper') : t('personalAnalyticsConsent.toggleOffHelper')}
        </Text>
        <Text style={styles.whatIncludes}>{t('personalAnalyticsConsent.whatIncludes')}</Text>
        <Text style={styles.whatNeverIncludes}>{t('personalAnalyticsConsent.whatNeverIncludes')}</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('consent.privacyPolicyLink')}
          style={({ focused }: WebPressableState) => [styles.privacyLink, focused ? styles.focusRing : null]}
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        >
          <Text style={styles.privacyLinkText}>{t('consent.privacyPolicyLink')}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: isOn }}
        accessibilityLabel={t('personalAnalyticsConsent.toggleLabel')}
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
    alignItems: 'flex-start',
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
  whatIncludes: {
    ...typography.caption,
    color: palette.textMuted
  },
  whatNeverIncludes: {
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
    justifyContent: 'center',
    marginTop: 2
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
  } as any,
  privacyLink: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 2
  },
  privacyLinkText: {
    ...typography.caption,
    color: palette.auroraBlue,
    textDecorationLine: 'underline'
  }
});
