import { StyleSheet, Text, View } from 'react-native';
import { palette } from '../theme/palette';
import { elevation, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';

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
  const { t } = useTranslation();
  const color = colorForScore(score);

  return (
    <View
      style={[styles.badge, { backgroundColor: color }, size === 'lg' ? styles.lg : styles.sm]}
      accessible
      accessibilityLabel={t('scoreBadge.a11yLabel', { score })}
    >
      <Text style={size === 'lg' ? styles.textLg : styles.text}>{score}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f4fff480',
    ...elevation.sm
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
  },
  textLg: {
    color: palette.textOnAurora,
    fontWeight: '800',
    letterSpacing: 0.2,
    fontSize: 21
  }
});
