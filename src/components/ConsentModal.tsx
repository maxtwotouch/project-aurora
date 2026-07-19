import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LANGUAGE_NATIVE_LABELS, SUPPORTED_LANGUAGES } from '../i18n/languages';
import { getCurrentLanguage, setLanguage } from '../i18n';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

type Props = {
  onAccept: () => void;
  onDecline: () => void;
};

/**
 * First-open consent prompt. Rendered as an overlay above the main app (see
 * ConsentGate) rather than blocking data loading underneath -- the app is
 * usable the instant a choice is made either way.
 *
 * No dark patterns: both buttons share the exact same background, border,
 * size and font weight -- neither is filled/bright while the other is
 * outlined/muted. Only the label text color differs (a minimal mint vs.
 * primary-text distinction) so the two remain readable as separate
 * choices without implying either one is the "recommended" action.
 */
export function ConsentModal({ onAccept, onDecline }: Props) {
  const { t } = useTranslation();
  const currentLanguage = getCurrentLanguage();

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.backdrop} pointerEvents="auto" />
      <View style={styles.card}>
        {/* Language first: the reader confirms their language BEFORE the
            legally-relevant consent copy below. Each label is in its own
            tongue; switching re-renders this whole modal instantly and
            persists the choice (same mechanism as the Settings picker). */}
        <View
          style={styles.languageRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('consent.languageRowA11y')}
        >
          {SUPPORTED_LANGUAGES.map((code) => {
            const active = code === currentLanguage;
            return (
              <Pressable
                key={code}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={LANGUAGE_NATIVE_LABELS[code]}
                style={({ pressed, focused }: WebPressableState) => [
                  styles.languageChip,
                  active ? styles.languageChipActive : null,
                  focused ? styles.focusRing : null,
                  pressed ? styles.buttonPressed : null
                ]}
                onPress={() => void setLanguage(code)}
              >
                <Text style={active ? styles.languageChipTextActive : styles.languageChipText}>
                  {LANGUAGE_NATIVE_LABELS[code]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.eyebrow}>{t('consent.eyebrow')}</Text>
        <Text style={styles.title}>{t('consent.title')}</Text>
        <Text style={styles.body}>{t('consent.body')}</Text>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('consent.acceptButton')}
            style={({ pressed, focused }: WebPressableState) => [
              styles.button,
              focused ? styles.focusRing : null,
              pressed ? styles.buttonPressed : null
            ]}
            onPress={onAccept}
          >
            <Text style={styles.acceptButtonText}>{t('consent.acceptButton')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('consent.declineButton')}
            style={({ pressed, focused }: WebPressableState) => [
              styles.button,
              focused ? styles.focusRing : null,
              pressed ? styles.buttonPressed : null
            ]}
            onPress={onDecline}
          >
            <Text style={styles.declineButtonText}>{t('consent.declineButton')}</Text>
          </Pressable>
        </View>

        <Text style={styles.footnote}>{t('consent.footnote')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
    zIndex: 1000
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#04090dd9'
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: palette.nightPanel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    padding: space.lg,
    gap: space.sm
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.xs
  },
  languageChip: {
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong,
    backgroundColor: palette.chipSurface
  },
  languageChipActive: {
    borderColor: palette.auroraGreen,
    backgroundColor: palette.chipSurfaceActive
  },
  languageChipText: {
    ...typography.caption,
    color: palette.textSecondary
  },
  languageChipTextActive: {
    ...typography.caption,
    color: palette.auroraMint
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  title: {
    ...typography.heading,
    color: palette.textPrimary
  },
  body: {
    ...typography.body,
    color: palette.textSecondary
  },
  actions: {
    gap: space.xs,
    marginTop: space.xs
  },
  // Shared by both buttons on purpose -- see the component-level comment
  // above. Do not fork this into per-button background/border styles.
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: space.md,
    backgroundColor: palette.chipSurfaceActive,
    borderColor: palette.borderHairlineStrong
  },
  acceptButtonText: {
    ...typography.bodyStrong,
    fontSize: 15,
    color: palette.auroraMint
  },
  declineButtonText: {
    ...typography.bodyStrong,
    fontSize: 15,
    color: palette.textPrimary
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any,
  footnote: {
    ...typography.caption,
    color: palette.textMuted,
    textAlign: 'center'
  }
});
