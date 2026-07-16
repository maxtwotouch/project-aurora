import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { palette } from '../theme/palette';
import { radius, space, type WebPressableState } from '../theme/tokens';
import { typography } from '../theme/type';

type Props = {
  title: string;
  eyebrow?: string;
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function CollapsibleSection({ title, eyebrow, meta, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={({ pressed, focused }: WebPressableState) => [
          styles.header,
          focused ? styles.focusRing : null,
          pressed ? styles.headerPressed : null
        ]}
        onPress={() => setOpen((current) => !current)}
      >
        <View style={styles.copy}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <View style={styles.iconWrap}>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.textPrimary} />
          </View>
        </View>
      </Pressable>

      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: space.sm,
    overflow: 'hidden'
  },
  header: {
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm
  },
  headerPressed: {
    opacity: 0.92
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: palette.auroraGreen,
    outlineOffset: -2
  } as any,
  copy: {
    flex: 1,
    minWidth: 0
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint,
    marginBottom: 4
  },
  title: {
    ...typography.heading,
    color: palette.textPrimary
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs
  },
  meta: {
    ...typography.bodySmall,
    color: palette.textMuted
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.chipSurface,
    borderWidth: 1,
    borderColor: palette.borderHairlineStrong
  },
  body: {
    paddingHorizontal: space.md,
    paddingBottom: space.md
  }
});
