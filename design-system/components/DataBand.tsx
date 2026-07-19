import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { palette, space, typography } from '../tokens';

export type DataBandItem = {
  label: string;
  value: string;
  tone?: string;
};

export type DataBandProps = {
  items: DataBandItem[];
  /**
   * Style overrides for the outer row/items/divider/text -- lets callers in
   * a different layout context reuse this same label/value/tone/divider
   * structure at pixel parity with their own surrounding layout, instead of
   * duplicating the markup.
   */
  style?: StyleProp<ViewStyle>;
  itemStyle?: StyleProp<ViewStyle>;
  dividerStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
};

/**
 * DataBand — grouped facts separated by hairline divider rules, not boxes.
 * This is the design system's answer to "a row of stats": no per-item card,
 * no icon-over-heading tile, just label/value pairs with an optional
 * per-item tone color on the value (e.g. cloud cover colored by how
 * favorable it is) and a 1px rule between items. The first item never gets
 * a divider; every item after it does.
 *
 * Already app-agnostic in the original app codebase (no aurora-specific
 * logic lives here) -- this copy is a straight move, only the token import
 * path changed. See ./README.md for when to reach for this vs. ArcGauge.
 */
export function DataBand({ items, style, itemStyle, dividerStyle, labelStyle, valueStyle }: DataBandProps) {
  return (
    <View style={[styles.dataBand, style]}>
      {items.map((item, index) => (
        <View key={item.label} style={[styles.bandItem, itemStyle, index > 0 ? [styles.bandItemDivided, dividerStyle] : null]}>
          <Text style={[styles.bandLabel, labelStyle]}>{item.label}</Text>
          <Text style={[styles.bandValue, valueStyle, item.tone ? { color: item.tone } : null]}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dataBand: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.lg
  },
  bandItem: {
    minWidth: 76,
    gap: 3
  },
  bandItemDivided: {
    borderLeftWidth: 1,
    borderLeftColor: palette.borderHairline,
    paddingLeft: space.lg
  },
  bandLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 0.7,
    color: palette.textMuted
  },
  bandValue: {
    ...typography.subheading,
    color: palette.textPrimary
  }
});
