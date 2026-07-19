import { StyleSheet, Text, View } from 'react-native';

import { MidnightSunIcon } from '../icons/MidnightSunIcon';
import { useTranslation } from '../../i18n/useTranslation';
import { palette } from '../../theme/palette';
import { radius, space } from '../../theme/tokens';
import { typography } from '../../theme/type';

type Props = {
  /** Raw ISO YYYY-MM-DD date the season is expected to reopen (darkness.seasonReturns),
      or null when unknown (falls back to an i18n placeholder string). */
  seasonReturns: string | null;
};

// darkness.seasonReturns is an ISO YYYY-MM-DD date (no time-of-day, no
// timezone conversion needed -- it's a calendar date, not an instant).
// Anchoring to local noon avoids any risk of the date shifting a day
// backward/forward under toLocaleDateString in edge-case timezones.
const formatSeasonReturnsDate = (isoDate: string, locale: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(locale, { month: 'long', day: 'numeric' });

/**
 * Polar day (midnight sun): the sky never gets dark enough for aurora
 * tonight. This is seasonal truth, not an error -- calm informational
 * styling (info blue), not the warning/danger palette. The icon itself
 * carries the one warm accent (a copper "town light" on the horizon; see
 * MidnightSunIcon) rather than recoloring the whole notice, so the
 * surrounding container keeps reading as neutral fact.
 */
export function PolarDayNotice({ seasonReturns }: Props) {
  const { t, i18n } = useTranslation();
  const seasonReturnsDate = seasonReturns ? formatSeasonReturnsDate(seasonReturns, i18n.language) : null;

  return (
    <View style={styles.polarDayNotice}>
      <MidnightSunIcon size={22} color={palette.textOnInfoSurface} townLightColor={palette.accentWarm} />
      <View style={styles.polarDayCopy}>
        <Text style={styles.polarDayHeadline}>{t('tonight.polarDay.headline')}</Text>
        <Text style={styles.polarDayBody}>
          {t('tonight.polarDay.body', { date: seasonReturnsDate ?? t('tonight.polarDay.unknownDate') })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  polarDayNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.auroraBlue,
    backgroundColor: palette.infoSurface
  },
  polarDayCopy: {
    flex: 1,
    gap: space.xxs
  },
  polarDayHeadline: {
    ...typography.bodyStrong,
    color: palette.textOnInfoSurface
  },
  polarDayBody: {
    ...typography.body,
    color: palette.textOnInfoSurface
  }
});
