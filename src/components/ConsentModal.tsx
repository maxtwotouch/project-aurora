import { Pressable, StyleSheet, Text, View } from 'react-native';

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

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.backdrop} pointerEvents="auto" />
      <View style={styles.card}>
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
