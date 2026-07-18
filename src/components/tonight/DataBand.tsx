import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { palette } from '../../theme/palette';
import { space } from '../../theme/tokens';
import { typography } from '../../theme/type';

export type DataBandItem = {
  label: string;
  value: string;
  tone?: string;
};

type Props = {
  items: DataBandItem[];
  /**
   * Style overrides for the outer row/items/divider/text -- lets callers in
   * a different design context (e.g. SpotDetailScreen's hero card) reuse
   * this same label/value/tone/divider structure at pixel parity with their
   * own surrounding layout, instead of duplicating the markup. Defaults
   * match the "why tonight" / outlook bands on TonightScreen.
   */
  style?: StyleProp<ViewStyle>;
  itemStyle?: StyleProp<ViewStyle>;
  dividerStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  valueStyle?: StyleProp<TextStyle>;
};

/**
 * A row of label/value stats separated by hairline divider rules, with an
 * optional per-item tone color on the value (e.g. cloud cover colored by
 * how favorable it is). The first item never gets a divider; every item
 * after it does.
 */
export function DataBand({ items, style, itemStyle, dividerStyle, labelStyle, valueStyle }: Props) {
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
