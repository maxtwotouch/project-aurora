import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../i18n/useTranslation';
import { ALERT_TIERS, DEFAULT_ENABLED_TIER } from '../notifications/alertsClient';
import type { AlertTier } from '../notifications/alertsClient';
import { useAlerts } from '../notifications/useAlerts';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

const TIER_LABEL_KEYS: Record<Exclude<AlertTier, 'off'>, string> = {
  ge45: 'alerts.tierGe45',
  ge70: 'alerts.tierGe70'
};

/**
 * Settings > "Aurora alerts" -- opt-in, default off, topic-based FCM (see
 * docs/design-aurora-alerts.md, src/notifications/). Same on/off switch
 * shape as UsageConsentToggle/DesignPreviewToggle, plus a tier picker (chip
 * row, same shape as LanguagePicker) that only appears once the toggle is
 * on -- mirrors that doc's "toggle plus a threshold picker that appears
 * once it's on" (section 1).
 *
 * Three states this renders, all via useAlerts()'s `available` /
 * `isWebUnsupported`:
 *   - Web: fixed disabled state, "not available on web" helper (native
 *     only for this PR -- see src/notifications/firebaseSeam.web.ts).
 *   - Native, Firebase not configured/linked in this binary yet (owner
 *     hasn't dropped in google-services.json/GoogleService-Info.plist, or
 *     this binary predates this PR's native packages -- see
 *     firebaseSeam.ts's header): disabled state, "available in a future
 *     build" helper -- never a broken/silently-failing toggle.
 *   - Native, available: the real toggle + tier picker. If the OS
 *     notification permission was just denied, that's surfaced as helper
 *     text too (see useAlerts.ts's `lastPermission`).
 */
export function AuroraAlertsSection() {
  const { tier, loaded, available, isWebUnsupported, lastPermission, setTier } = useAlerts();
  const { t } = useTranslation();

  if (!loaded) return null;

  const disabled = isWebUnsupported || available === false;
  const isOn = tier !== 'off';

  const helperText = isWebUnsupported
    ? t('alerts.webUnsupportedHelper')
    : available === false
      ? t('alerts.unavailableHelper')
      : lastPermission === 'denied'
        ? t('alerts.permissionDeniedHelper')
        : isOn
          ? t('alerts.toggleHelperOn')
          : t('alerts.toggleHelperOff');

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.label}>{t('alerts.toggleLabel')}</Text>
          <Text style={styles.helper}>{helperText}</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: isOn, disabled }}
          accessibilityLabel={t('alerts.toggleLabel')}
          disabled={disabled}
          style={({ pressed, focused }: WebPressableState) => [
            styles.toggleTrack,
            isOn ? styles.toggleTrackOn : null,
            disabled ? styles.toggleTrackDisabled : null,
            focused && !disabled ? styles.focusRing : null,
            pressed && !disabled ? styles.togglePressed : null
          ]}
          onPress={() => {
            if (disabled) return;
            void setTier(isOn ? 'off' : DEFAULT_ENABLED_TIER);
          }}
        >
          <View style={[styles.toggleKnob, isOn ? styles.toggleKnobOn : null]} />
        </Pressable>
      </View>

      {isOn && !disabled ? (
        <View style={styles.tierRow}>
          <Text style={styles.tierLabel}>{t('alerts.tierPickerLabel')}</Text>
          <View style={styles.tierOptions}>
            {ALERT_TIERS.map((option) => {
              const isActive = tier === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={t(TIER_LABEL_KEYS[option])}
                  style={({ pressed, focused }: WebPressableState) => [
                    styles.chip,
                    isActive ? styles.chipActive : null,
                    focused ? styles.focusRing : null,
                    pressed ? styles.chipPressed : null
                  ]}
                  onPress={() => void setTier(option)}
                >
                  <Text style={[styles.chipText, isActive ? styles.chipTextActive : null]}>
                    {t(TIER_LABEL_KEYS[option])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.xs
  },
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
  toggleTrackDisabled: {
    opacity: 0.45
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
  tierRow: {
    gap: space.xs
  },
  tierLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: palette.textSecondary
  },
  tierOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs
  },
  chip: {
    minHeight: 38,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong,
    backgroundColor: palette.chipSurface
  },
  chipActive: {
    backgroundColor: palette.auroraGreen,
    borderColor: palette.auroraGreen
  },
  chipPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
  },
  chipText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.textPrimary
  },
  chipTextActive: {
    color: palette.textOnAurora
  }
});
