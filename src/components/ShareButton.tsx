import { useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text } from 'react-native';

import { getCurrentLanguage } from '../i18n';
import { useTranslation } from '../i18n/useTranslation';
import { trackUnlessPreview } from '../preview/trackUnlessPreview';
import { buildShareMessage, type ShareTonightState } from '../share/shareMessage';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

type Props = {
  /** Tonight's state, narrowed down to what src/share/shareMessage.ts needs
   * -- see that module for the "season closed" / "no data yet" fallback
   * behavior. */
  state: ShareTonightState;
  /** The best spot's id, for the (optional) `spot_shared` usage event --
   * `null` whenever there is no concrete best-spot recommendation yet
   * (season closed, or forecast still loading/failed). The backend's
   * /v1/events route validates `spotId` against the known spot catalog
   * (see backend/src/events.ts) and drops the whole batch if it doesn't
   * match, so this deliberately does NOT invent a placeholder id in that
   * case -- it just skips the event rather than sending one the backend
   * would silently reject anyway. */
  spotId: string | null;
};

/**
 * Compact "send tonight to a friend" action -- React Native's built-in
 * `Share` API, no new dependency. On web, react-native-web's `Share.share`
 * already delegates to `navigator.share` when the browser supports it (see
 * node_modules/react-native-web/src/exports/Share) and otherwise rejects;
 * this component catches that rejection and falls back to copying the
 * message to the clipboard with a brief "Copied" state on the button label
 * itself, per the task brief's "no new dependencies" / "brief copied state"
 * requirements.
 *
 * Deliberately styled as a small pill chip (mirrors QuickNavChips.tsx),
 * NOT a full-width button -- this is a secondary, low-emphasis action next
 * to the hero's primary "Navigate" CTA (see BestSpotPanel.tsx), not a
 * competing call to action.
 */
export function ShareButton({ state, spotId }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handlePress = async () => {
    if (spotId) {
      trackUnlessPreview('spot_shared', spotId);
    }

    const { text } = buildShareMessage(state, { language: getCurrentLanguage() });

    try {
      await Share.share({ message: text });
      return;
    } catch {
      // On iOS, the user dismissing the native sheet resolves the promise
      // (action: 'dismissedAction') rather than rejecting it, so a catch
      // here is a genuine failure -- most commonly react-native-web's
      // Share.share rejecting with "Share is not supported in this
      // browser" when `navigator.share` isn't available. Native failures
      // (rare) have no further fallback and are dropped silently here,
      // matching BestSpotPanel/SpotDetailScreen's fire-and-forget
      // `Linking.openURL` calls elsewhere in this app.
    }

    if (Platform.OS !== 'web') return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied/unavailable in this browser -- degrade
      // to a silent no-op rather than throwing into the UI.
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('share.button.a11y')}
      style={({ pressed, focused }: WebPressableState) => [
        styles.button,
        Platform.OS === 'web' ? styles.buttonHover : null,
        focused ? styles.focusRing : null,
        pressed ? styles.buttonPressed : null
      ]}
      onPress={() => void handlePress()}
    >
      <Text style={styles.buttonText}>{copied ? t('share.button.copied') : t('share.button.label')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong,
    backgroundColor: palette.chipSurface
  },
  buttonHover: {
    backgroundColor: palette.chipSurfaceActive
  },
  buttonText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.auroraMint
  },
  buttonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }]
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any
});
