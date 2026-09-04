import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { LANGUAGE_NATIVE_LABELS, SUPPORTED_LANGUAGES } from '../i18n/languages';
import { getCurrentLanguage, setLanguage } from '../i18n';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

type Props = {
  onAccept: () => void;
  onDecline: () => void;
  /**
   * Which i18n namespace this question's copy (eyebrow/title/body/accept/
   * decline/footnote) comes from. 'tourismConsent' is the first-asked
   * question (native only -- see ConsentGate step 0); 'consent' is the
   * original aggregate usage-counter question; 'personalAnalyticsConsent'
   * is the person-level analytics question added in the analytics pivot
   * (docs/analytics-pivot.md PR 2) -- see ConsentGate for how all three are
   * sequenced. All three namespaces are shaped identically
   * (eyebrow/title/body/acceptButton/declineButton/footnote) by convention
   * so this component never needs question-specific branching beyond the
   * key prefix itself.
   */
  copyKeyPrefix?: 'consent' | 'personalAnalyticsConsent' | 'tourismConsent';
  /**
   * Whether to show the language picker row. Only the first question a user
   * sees needs it -- by the time a later, sequential question appears the
   * language has already been confirmed, and re-showing the same picker
   * would just be visual noise ahead of legally-relevant copy.
   */
  showLanguageRow?: boolean;
  /**
   * While true, both buttons are disabled and visibly busy (opacity 0.6) --
   * used for the tourism-insights step's accept path, which awaits a
   * location-permission prompt before recording the consent choice (see
   * ConsentGate). Deliberately keeps the SAME shared `styles.button` for
   * both buttons even while busy (no-dark-patterns invariant: neither
   * button is ever singled out).
   */
  busy?: boolean;
};

/**
 * First-open consent prompt. Rendered as an overlay above the main app (see
 * ConsentGate) rather than blocking data loading underneath -- the app is
 * usable the instant a choice is made either way.
 *
 * Reused for all three sequential first-open questions (tourism insights on
 * native, then aggregate usage counters, then person-level analytics; see
 * ConsentGate). The questions are never combined into a single
 * accept/decline pair: each render of this component asks exactly one
 * question and reports exactly one choice, so all consents stay unbundled
 * per CLAUDE.md's "unbundled per purpose" requirement.
 *
 * No dark patterns: both buttons share the exact same background, border,
 * size and font weight -- neither is filled/bright while the other is
 * outlined/muted. Only the label text color differs (a minimal mint vs.
 * primary-text distinction) so the two remain readable as separate
 * choices without implying either one is the "recommended" action.
 */
export function ConsentModal({
  onAccept,
  onDecline,
  copyKeyPrefix = 'consent',
  showLanguageRow = true,
  busy = false
}: Props) {
  const { t } = useTranslation();
  const currentLanguage = getCurrentLanguage();
  const { height: windowHeight } = useWindowDimensions();

  return (
    // RN Modal (not a plain overlay View) so assistive tech treats this as
    // truly modal: native VoiceOver/TalkBack confine navigation to it, and
    // react-native-web renders a focus trap + aria-modal. onRequestClose is
    // a deliberate no-op -- a consent choice is mandatory; there is no
    // dismiss path that leaves the question unanswered (WCAG 2.4.3 fix).
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.backdrop} pointerEvents="auto" />
        {/* The card scrolls: at large font scales (or short landscape
            viewports) the content can exceed the screen, and since the
            modal blocks the app, unreachable Accept/Decline buttons would
            gate the app permanently (WCAG 1.4.4/1.4.10 fix). */}
        <View style={[styles.card, { maxHeight: windowHeight - space.lg * 2 }]}>
          <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator>
        {/* Language first: the reader confirms their language BEFORE the
            legally-relevant consent copy below. Each label is in its own
            tongue; switching re-renders this whole modal instantly and
            persists the choice (same mechanism as the Settings picker). */}
        {showLanguageRow ? (
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
                  accessibilityState={{ checked: active }}
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
        ) : null}

        <Text style={styles.eyebrow}>{t(`${copyKeyPrefix}.eyebrow`)}</Text>
        <Text style={styles.title}>{t(`${copyKeyPrefix}.title`)}</Text>
        <Text style={styles.body}>{t(`${copyKeyPrefix}.body`)}</Text>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(`${copyKeyPrefix}.acceptButton`)}
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            style={({ pressed, focused }: WebPressableState) => [
              styles.button,
              busy ? styles.buttonBusy : null,
              focused ? styles.focusRing : null,
              pressed ? styles.buttonPressed : null
            ]}
            onPress={onAccept}
          >
            <Text style={styles.acceptButtonText}>{t(`${copyKeyPrefix}.acceptButton`)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(`${copyKeyPrefix}.declineButton`)}
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            style={({ pressed, focused }: WebPressableState) => [
              styles.button,
              busy ? styles.buttonBusy : null,
              focused ? styles.focusRing : null,
              pressed ? styles.buttonPressed : null
            ]}
            onPress={onDecline}
          >
            <Text style={styles.declineButtonText}>{t(`${copyKeyPrefix}.declineButton`)}</Text>
          </Pressable>
        </View>

            <Text style={styles.footnote}>{t(`${copyKeyPrefix}.footnote`)}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
    borderColor: palette.cardBorder
  },
  cardContent: {
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
  buttonBusy: {
    opacity: 0.6
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
