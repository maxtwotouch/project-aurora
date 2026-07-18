import { Animated, StyleSheet, Text, View } from 'react-native';

import { DataBand } from './DataBand';
import { useTranslation } from '../../i18n/useTranslation';
import { palette } from '../../theme/palette';
import { radius, space } from '../../theme/tokens';
import { typography } from '../../theme/type';
import type { GeneralForecastScore, KpTrend } from '../../types';

type Props = {
  opacity: Animated.Value;
  riseFrom: (distance: number) => number;
  showTomorrowEvening: boolean;
  tomorrowScore: GeneralForecastScore | null;
  dailyOutlook: KpTrend['dailyOutlook'];
};

// GeneralForecastScore['chance'] is produced upstream (useForecast.ts) as
// the literal English words 'High'/'Medium'/'Low' -- map them back to
// translation keys here rather than changing that shared type.
function chanceValueToKey(chance: 'High' | 'Medium' | 'Low'): string {
  if (chance === 'High') return 'common.chance.high';
  if (chance === 'Medium') return 'common.chance.medium';
  return 'common.chance.low';
}

// KpTrend['dailyOutlook'][number]['label'] is produced upstream (src/api/kp.ts)
// as the literal English words 'Today'/'Tomorrow'/'Day 3'.
function outlookDayLabelKey(label: string): string {
  if (label === 'Today') return 'tonight.outlook.dayLabels.today';
  if (label === 'Tomorrow') return 'tonight.outlook.dayLabels.tomorrow';
  return 'tonight.outlook.dayLabels.day3';
}

/** "Looking ahead": tomorrow evening's forecast plus the multi-day geomagnetic outlook. */
export function OutlookCard({ opacity, riseFrom, showTomorrowEvening, tomorrowScore, dailyOutlook }: Props) {
  const { t } = useTranslation();

  if (!showTomorrowEvening && !(dailyOutlook && dailyOutlook.length > 1)) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.outlookCard,
        {
          opacity,
          transform: [
            {
              translateY: opacity.interpolate({
                inputRange: [0, 1],
                outputRange: [riseFrom(16), 0]
              })
            }
          ]
        }
      ]}
    >
      <Text style={styles.outlookEyebrow}>{t('tonight.outlook.eyebrow')}</Text>

      {showTomorrowEvening && tomorrowScore ? (
        <View style={styles.outlookRow}>
          <Text style={styles.outlookTitle}>{t('tonight.outlook.tomorrowEvening')}</Text>
          <DataBand
            items={[
              { label: t('tonight.band.chance'), value: t(chanceValueToKey(tomorrowScore.chance)) },
              { label: t('tonight.outlook.score'), value: String(tomorrowScore.score) },
              { label: t('common.cloud'), value: `${tomorrowScore.cloudCover}%` },
              { label: t('tonight.outlook.peakKp'), value: tomorrowScore.peakKp.toFixed(1) }
            ]}
          />
        </View>
      ) : null}

      {dailyOutlook && dailyOutlook.length > 1 ? (
        <View style={[styles.outlookRow, showTomorrowEvening ? styles.outlookRowDivided : null]}>
          <Text style={styles.outlookTitle}>{t('tonight.outlook.geomagnetic')}</Text>
          <DataBand
            items={dailyOutlook.slice(1, 4).map((item) => ({
              label: t(outlookDayLabelKey(item.label)),
              value: item.peak.toFixed(1)
            }))}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outlookCard: {
    marginBottom: space.lg,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    gap: space.sm
  },
  outlookEyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  outlookRow: {
    gap: space.xs
  },
  outlookRowDivided: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: palette.borderHairline
  },
  outlookTitle: {
    ...typography.heading,
    color: palette.textPrimary
  }
});
