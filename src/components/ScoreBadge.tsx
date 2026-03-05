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
    borderColor: '#ffffff55'
  },
  sm: {
    width: 38,
    height: 38
  },
  lg: {
    width: 58,
    height: 58
  },
  text: {
    color: palette.night,
    fontWeight: '800',
    letterSpacing: 0.2
  }
});
