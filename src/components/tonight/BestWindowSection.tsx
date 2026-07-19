import { StyleSheet, Text, View } from 'react-native';

import { HourlyTimeline } from '../HourlyTimeline';
import { useTranslation } from '../../i18n/useTranslation';
import { palette } from '../../theme/palette';
import { space } from '../../theme/tokens';
import { typography } from '../../theme/type';
import type { SpotScoreResult } from '../../types';

type Props = {
  bestSpot: SpotScoreResult | undefined;
  isWideWeb: boolean;
};

const formatLocalTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

function scoreTone(score: number): string {
  if (score >= 70) return palette.auroraGreen;
  if (score >= 45) return palette.warning;
  return palette.danger;
}

/** Timeline + copy for tonight's best viewing window at the top-ranked spot. */
export function BestWindowSection({ bestSpot, isWideWeb }: Props) {
  const { t } = useTranslation();

  return (
    <View style={[styles.heroPrimary, isWideWeb ? styles.heroPrimaryWide : null]}>
      <Text style={styles.sectionKicker}>{t('common.bestWindow')}</Text>
      <Text style={styles.windowLine}>
        {bestSpot
          ? t('tonight.windowRange', {
              start: formatLocalTime(bestSpot.bestWindowStart),
              end: formatLocalTime(bestSpot.bestWindowEnd)
            })
          : t('tonight.waitingForecast')}
      </Text>
      <Text style={styles.helper}>
        {bestSpot
          ? t('tonight.bestWindowSummary', { cloud: bestSpot.cloudCoverAtBestHour, spot: bestSpot.spotName })
          : t('tonight.pullToRefresh')}
      </Text>

      {bestSpot && bestSpot.hourlyScores.length > 0 ? (
        <HourlyTimeline
          points={bestSpot.hourlyScores.map((hour) => ({ time: hour.time, value: hour.score }))}
          highlightStart={bestSpot.bestWindowStart}
          highlightEnd={bestSpot.bestWindowEnd}
          toneFor={scoreTone}
          accessibilityLabel={t('tonight.hourlyScoreA11y')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroPrimary: {
    gap: space.xs
  },
  heroPrimaryWide: {
    flex: 1.3
  },
  sectionKicker: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  windowLine: {
    ...typography.title,
    color: palette.textPrimary
  },
  helper: {
    ...typography.body,
    color: palette.textSecondary
  }
});
