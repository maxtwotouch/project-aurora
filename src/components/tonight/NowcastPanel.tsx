import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n/useTranslation';
import { palette } from '../../theme/palette';
import { radius, space } from '../../theme/tokens';
import { typography } from '../../theme/type';
import type { NowcastLevel, NowcastSummary } from '../../types';

type Props = {
  nowcast: NowcastSummary | undefined;
  /** See HeroSection: while the season is closed (polar day), the sky can
   * never be dark enough for aurora to be visible regardless of what's
   * happening upstream in the solar wind -- rendering "Active right now"
   * next to "too bright to see anything tonight" would read as a direct
   * contradiction. Hiding the whole panel in that state (rather than trying
   * to reconcile the two) is the same call HeroSection itself makes for
   * BestWindowSection/BestSpotPanel. */
  seasonClosed: boolean;
};

// Level -> color. Deliberately reusing the existing signal ramp rather than
// the status.warning/danger tokens: per design-system/README.md, those are
// reserved for "a data/condition problem", and a `storming` nowcast is not a
// problem -- it's the best-case reading for someone hoping to see aurora.
// `quiet` -> textMuted (calm, not alarming); `stirring` -> auroraBlue (the
// palette's existing "informational, not decision" hue, see
// PolarDayNotice); `active` -> auroraGreen (the app's one "go" signal);
// `storming` -> auroraMint (already used elsewhere as the brightest
// "great/high chance" tone -- see HeroSection's toneColor()).
function levelColor(level: NowcastLevel): string {
  if (level === 'storming') return palette.auroraMint;
  if (level === 'active') return palette.auroraGreen;
  if (level === 'stirring') return palette.auroraBlue;
  return palette.textMuted;
}

function levelLabelKey(level: NowcastLevel): string {
  return `nowcast.level.${level}`;
}

/**
 * `bzReadingAt` (and `plasmaReadingAt`) are the upstream RTSW row's own
 * `time_tag`, verbatim -- UTC but unmarked (no trailing "Z"), same as
 * backend/src/nowcast.ts's `parseTimeTagMs` documents. Without appending
 * "Z", `Date.parse` would read a bare "YYYY-MM-DDTHH:MM:SS" as *local* time
 * on most JS engines, silently skewing "how old is this reading" by the
 * device's own UTC offset.
 */
function minutesSince(iso: string, nowMs: number): number | null {
  const normalized = iso.endsWith('Z') ? iso : `${iso}Z`;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((nowMs - parsed) / 60000));
}

/**
 * Compact "is it happening right now" section, fed by `NowcastSummary` (see
 * docs/nowcast.md). Renders NOTHING -- no empty shell -- whenever there is
 * no nowcast to show (backend down, an old cached snapshot from before
 * nowcast existed, or every direct-mode source failed) or while the season
 * is closed, matching the rest of tonight's sections' "absent means
 * nothing to show" convention (e.g. OutlookCard, SpotListSection's
 * closeSpots branch).
 */
export function NowcastPanel({ nowcast, seasonClosed }: Props) {
  const { t } = useTranslation();

  if (!nowcast || seasonClosed) {
    return null;
  }

  const color = levelColor(nowcast.level);
  const hasBz = typeof nowcast.bz === 'number';
  const bzCaptionKey = hasBz && (nowcast.bz as number) < 0 ? 'nowcast.bzCaption.southward' : 'nowcast.bzCaption.northward';
  const ageMinutes = nowcast.bzReadingAt ? minutesSince(nowcast.bzReadingAt, Date.now()) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{t('nowcast.eyebrow')}</Text>

      <View style={styles.headlineRow}>
        <View style={[styles.dot, { backgroundColor: color }]} accessibilityElementsHidden importantForAccessibility="no" />
        <Text style={[styles.headline, { color }]}>{t(levelLabelKey(nowcast.level))}</Text>
      </View>

      {hasBz ? (
        <View style={styles.row}>
          <Text style={styles.bzValue}>{`Bz ${(nowcast.bz as number).toFixed(1)} nT`}</Text>
          <Text style={styles.caption}>{t(bzCaptionKey)}</Text>
        </View>
      ) : null}

      {typeof nowcast.leadTimeMinutes === 'number' ? (
        <Text style={styles.caption}>{t('nowcast.leadTime', { minutes: nowcast.leadTimeMinutes })}</Text>
      ) : null}

      {ageMinutes !== null ? (
        <Text style={styles.caption}>
          {ageMinutes < 1 ? t('nowcast.dataAgeJustNow') : t('nowcast.dataAge', { count: ageMinutes })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: space.lg,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    gap: space.xs
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  headline: {
    ...typography.heading
  },
  row: {
    gap: 2
  },
  bzValue: {
    ...typography.bodyStrong,
    color: palette.textPrimary
  },
  caption: {
    ...typography.bodySmall,
    color: palette.textSecondary
  }
});
