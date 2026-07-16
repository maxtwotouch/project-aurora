import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { palette } from '../theme/palette';

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
        style={({ pressed }) => [styles.header, pressed ? styles.headerPressed : null]}
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    marginBottom: 12,
    overflow: 'hidden'
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  headerPressed: {
    opacity: 0.92
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  eyebrow: {
    color: palette.auroraMint,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4
  },
  title: {
    color: palette.textPrimary,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800'
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  meta: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18303d',
    borderWidth: 1,
    borderColor: '#2b5162'
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16
  }
});
