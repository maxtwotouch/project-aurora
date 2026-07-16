import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/palette';

type Props = {
  score: number;
  size?: 'sm' | 'lg';
};

function colorForScore(score: number) {
  if (score >= 70) return palette.auroraGreen;
  if (score >= 45) return palette.warning;
  return palette.danger;
}

export function ScoreBadge({ score, size = 'sm' }: Props) {
  const color = colorForScore(score);

  return (
    <View style={[styles.badge, { backgroundColor: color }, size === 'lg' ? styles.lg : styles.sm]}>
      <Text style={styles.text}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f4fff480',
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3
  },
  sm: {
    width: 42,
    height: 42
  },
  lg: {
    width: 64,
    height: 64
  },
  text: {
    color: palette.textOnAurora,
    fontWeight: '800',
    letterSpacing: 0.2,
    fontSize: 16
  }
});
