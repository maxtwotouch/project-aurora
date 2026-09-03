import { Pressable, StyleSheet, Text, View } from 'react-native';

import { captureAllowed } from '../analytics/personalAnalytics';
import { useTripModeConsent } from '../analytics/tripModeConsent';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

/**
 * Trip mode's consent toggle -- a SECOND, INDEPENDENT opt-in from
 * UsageConsentToggle above it (see src/analytics/tripModeConsent.ts). Lives
 * in Settings only; there is no first-open prompt for this choice.
 *
 * No separate confirm step: following UsageConsentToggle's precedent, the
 * descriptive copy plus this explicit toggle IS the consent act -- there is
 * no additional modal/dialog layer here, matching how the usage-consent
 * toggle already works.
 *
 * No geofencing/location code exists yet -- this only records the user's
 * choice ahead of a later, separately reviewed PR that implements Trip mode
 * itself (docs/design-trip-tracking.md ship gates).
 */
export function TripModeConsentToggle() {
  const { state, loaded, accept, decline } = useTripModeConsent();
  const { t } = useTranslation();

  if (!loaded) return null;

  const isOn = state === 'accepted';

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{t('tripMode.toggleLabel')}</Text>
        <Text style={styles.helper}>{t('tripMode.description')}</Text>
        <Text style={styles.whatLeaves}>{t('tripMode.whatLeaves')}</Text>
        <Text style={styles.status}>{isOn ? t('tripMode.toggleOnHelper') : t('tripMode.toggleOffHelper')}</Text>
        <Text style={styles.comingSoon}>{t('tripMode.comingSoonNote')}</Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: isOn }}
        accessibilityLabel={t('tripMode.toggleLabel')}
        // Programmatically associate the visible disclosure with the switch
        // (WCAG 1.3.1): same reviewed copy, composed, no new text.
        accessibilityHint={`${t('tripMode.description')} ${t('tripMode.whatLeaves')}`}
        style={({ pressed, focused }: WebPressableState) => [
          styles.toggleTrack,
          isOn ? styles.toggleTrackOn : null,
          focused ? styles.focusRing : null,
          pressed ? styles.togglePressed : null
        ]}
        onPress={() => {
          const nextEnabled = !isOn;
          // trip_mode_toggled records only the toggle STATE (docs/
          // analytics-pivot.md section 3) -- never any of Trip mode's own
          // presence events, which stay entirely within the identity-free
          // pipeline and are never sent to PostHog under any circumstances.
          captureAllowed('trip_mode_toggled', { enabled: nextEnabled });
          if (nextEnabled) {
            accept();
          } else {
            decline();
          }
        }}
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
  whatLeaves: {
    ...typography.caption,
    color: palette.textMuted
  },
  status: {
    ...typography.caption,
    color: palette.textSecondary,
    fontWeight: '600'
  },
  comingSoon: {
    ...typography.caption,
    color: palette.textMuted,
    fontStyle: 'italic'
  },
  toggleTrack: {
    width: 46,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: palette.chipSurface,
    borderWidth: 1,
    // cardBorderStrong: ~4.0:1 vs card so the OFF state's boundary meets
    // WCAG 1.4.11 non-text contrast (knob position perceivable).
    borderColor: palette.cardBorderStrong,
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
  } as any
});
