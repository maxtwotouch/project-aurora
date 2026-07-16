import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getCurrentLanguage, setLanguage, SUPPORTED_LANGUAGES, LANGUAGE_NATIVE_LABELS } from '../i18n';
import { useTranslation } from '../i18n/useTranslation';
import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

/**
 * Compact language row placed next to the usage-consent toggle (the app's
 * de-facto settings area). The heading itself is intentionally shown in
 * all five languages at once ("Language / Sprache / ...") rather than
 * translated, so it stays legible no matter which language is currently
 * active -- a reader can always find their own language. Each option is
 * labeled in its own tongue for the same reason. Selection applies
 * instantly (every screen using useTranslation re-renders) and persists
 * across restarts (see src/i18n/index.ts).
 */
export function LanguagePicker() {
  // Calling the hook is what subscribes this component to react-i18next's
  // languageChanged event and triggers a re-render -- that happens
  // regardless of whether we read `t()` or `i18n` from it, so it's kept
  // here purely for the subscription even though the active language code
  // below comes from getCurrentLanguage() instead.
  useTranslation();
  const active = getCurrentLanguage();

  return (
    <View style={styles.row}>
      <Text style={styles.label}>Language / Sprache / Langue / Idioma / 语言</Text>
      <View style={styles.options}>
        {SUPPORTED_LANGUAGES.map((code) => {
          const isActive = active === code;
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityLabel={LANGUAGE_NATIVE_LABELS[code]}
              accessibilityState={{ selected: isActive }}
              style={({ pressed, focused }: WebPressableState) => [
                styles.chip,
                isActive ? styles.chipActive : null,
                focused ? styles.focusRing : null,
                pressed ? styles.chipPressed : null
              ]}
              onPress={() => void setLanguage(code)}
            >
              <Text style={[styles.chipText, isActive ? styles.chipTextActive : null]}>
                {LANGUAGE_NATIVE_LABELS[code]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.borderHairline,
    gap: space.xs
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.textPrimary
  },
  options: {
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
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any,
  chipText: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: palette.textPrimary
  },
  chipTextActive: {
    color: palette.textOnAurora
  }
});
