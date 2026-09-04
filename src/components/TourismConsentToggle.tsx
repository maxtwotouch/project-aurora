import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

import { useTourismConsent } from '../analytics/tourismConsent';
import { useTranslation } from '../i18n/useTranslation';
import { focusRing } from '../theme/focusRing';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

/**
 * Tourism-insights consent toggle -- the Settings-only "change your mind"
 * surface for the SAME consent dimension ConsentGate asks about at first
 * launch (native only) -- see ../analytics/tourismConsent.ts. Independent of
 * both other consent toggles (UsageConsentToggle, PersonalAnalyticsToggle)
 * and independent of Trip Mode, which is a product feature session, not a
 * consent (src/trip/tripSession.ts).
 *
 * No separate confirm step: following UsageConsentToggle's precedent, the
 * descriptive copy plus this explicit toggle IS the consent act -- there is
 * no additional modal/dialog layer here. No PostHog event is fired for this
 * toggle (unlike the old Trip-mode toggle's `trip_mode_toggled`, which now
 * records Trip Mode SESSION state, not this consent -- see
 * src/analytics/personalAnalytics.ts).
 *
 * PERMISSION HELPER: while this consent is ON and we're on native, the
 * toggle checks `Location.getForegroundPermissionsAsync()` on mount and
 * whenever the app returns to the foreground -- consent being on does not
 * guarantee the OS permission is actually granted (the user may have
 * declined the native prompt, or revoked it later in system settings). When
 * not granted, a "permission missing" helper plus a link to the OS settings
 * screen is shown so the user understands nothing is actually being
 * measured despite having said yes here.
 */
export function TourismConsentToggle() {
  const { state, loaded, accept, decline } = useTourismConsent();
  const { t } = useTranslation();
  const [permissionGranted, setPermissionGranted] = useState(true);

  const isOn = state === 'accepted';
  const showPermissionCheck = isOn && Platform.OS !== 'web';

  useEffect(() => {
    if (!showPermissionCheck) return;

    let cancelled = false;
    const checkPermission = () => {
      void Location.getForegroundPermissionsAsync().then((result) => {
        if (!cancelled) setPermissionGranted(result.status === Location.PermissionStatus.GRANTED);
      });
    };

    checkPermission();

    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') checkPermission();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [showPermissionCheck]);

  if (!loaded) return null;

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{t('tourismConsent.toggleLabel')}</Text>
        <Text style={styles.helper}>{t('tourismConsent.description')}</Text>
        <Text style={styles.whatLeaves}>{t('tourismConsent.whatLeaves')}</Text>
        <Text style={styles.status}>
          {isOn ? t('tourismConsent.toggleOnHelper') : t('tourismConsent.toggleOffHelper')}
        </Text>
        {showPermissionCheck && !permissionGranted ? (
          <>
            <Text style={styles.permissionMissing}>{t('tourismConsent.permissionMissingHelper')}</Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('map.location.openSettings')}
              style={({ focused }: WebPressableState) => [styles.settingsLink, focused ? focusRing : null]}
              onPress={() => void Linking.openSettings()}
            >
              <Text style={styles.settingsLinkText}>{t('map.location.openSettings')}</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: isOn }}
        accessibilityLabel={t('tourismConsent.toggleLabel')}
        // Programmatically associate the visible disclosure with the switch
        // (WCAG 1.3.1): same reviewed copy, composed, no new text.
        accessibilityHint={`${t('tourismConsent.description')} ${t('tourismConsent.whatLeaves')}`}
        style={({ pressed, focused }: WebPressableState) => [
          styles.toggleTrack,
          isOn ? styles.toggleTrackOn : null,
          focused ? styles.focusRing : null,
          pressed ? styles.togglePressed : null
        ]}
        onPress={() => {
          if (isOn) {
            decline();
          } else {
            accept();
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
  permissionMissing: {
    ...typography.caption,
    color: palette.textMuted,
    marginTop: 2
  },
  settingsLink: {
    alignSelf: 'flex-start',
    marginTop: 4,
    minHeight: 44,
    justifyContent: 'center'
  },
  settingsLinkText: {
    ...typography.caption,
    color: palette.auroraBlue,
    textDecorationLine: 'underline'
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
