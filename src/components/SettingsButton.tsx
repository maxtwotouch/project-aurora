import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { palette } from '../theme/palette';
import { radius, type WebPressableState } from '../theme/tokens';

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
};

/**
 * Gear icon rendered as `headerRight` on every tab screen (both the native
 * and web navigators). Kept as its own tiny component rather than inlined
 * in App.tsx/App.web.tsx so the same button and styling is shared instead
 * of duplicated across the two navigator entry points.
 */
export function SettingsButton({ onPress, accessibilityLabel }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed, focused }: WebPressableState) => [
        styles.button,
        focused ? styles.focusRing : null,
        pressed ? styles.pressed : null
      ]}
      onPress={onPress}
    >
      <Ionicons name="settings-outline" size={20} color={palette.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    marginRight: 6,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.chipSurface,
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.94 }]
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: 2
  } as any
});
