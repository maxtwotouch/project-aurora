import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BestSpotPanel } from './BestSpotPanel';
import { BestWindowSection } from './BestWindowSection';
import { DataBand, type DataBandItem } from './DataBand';
import { decisionStyle, type DecisionKey } from './decision';
import { PolarDayNotice } from './PolarDayNotice';
import { ScoreGauge } from './ScoreGauge';
import { DataQualityBanner } from '../DataQualityBanner';
import { useTranslation } from '../../i18n/useTranslation';
import { palette } from '../../theme/palette';
import { elevation, radius, space } from '../../theme/tokens';
import { typography } from '../../theme/type';
import type { AppDataQuality, AuroraLevel, GeneralForecastScore, KpTrend, Spot, SpotScoreResult } from '../../types';

type Props = {
  heroAnim: Animated.Value;
  riseFrom: (distance: number) => number;
  isWideWeb: boolean;
  level: AuroraLevel;
  seasonClosed: boolean;
  decision: DecisionKey;
  tonightScoreValue: number;
  tonightScore: GeneralForecastScore | null;
  kp: KpTrend;
  lastUpdatedAt: string | null;
  daytimeHint: string | null;
  seasonReturns: string | null;
  dataQuality: AppDataQuality;
  bestSpot: SpotScoreResult | undefined;
  bestSpotData: Spot | undefined;
  onOpenSpot: (spotId: string) => void;
};

function recommendationKeyFromLevel(level: AuroraLevel): string {
  if (level === 'great') return 'tonight.recommendation.great';
  if (level === 'possible') return 'tonight.recommendation.possible';
  return 'tonight.recommendation.low';
}

function whyTitleKeyFromScore(score: number): string {
  if (score >= 70) return 'tonight.why.worthIt';
  if (score >= 45) return 'tonight.why.needsTiming';
  return 'tonight.why.difficult';
}

function chanceKeyFromScore(score: number): string {
  if (score >= 70) return 'common.chance.high';
  if (score >= 45) return 'common.chance.medium';
  return 'common.chance.low';
}

function toneColor(score: number): string {
  if (score >= 70) return palette.auroraMint;
  if (score >= 45) return palette.warning;
  return palette.danger;
}

const formatUpdatedAt = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });

/**
 * The one dominant recommendation block: go / when / where, readable
 * without scrolling. Owns the hero's own entrance animation; everything
 * below it on TonightScreen is supporting detail.
 */
export function HeroSection({
  heroAnim,
  riseFrom,
  isWideWeb,
  level,
  seasonClosed,
  decision,
  tonightScoreValue,
  tonightScore,
  kp,
  lastUpdatedAt,
  daytimeHint,
  seasonReturns,
  dataQuality,
  bestSpot,
  bestSpotData,
  onOpenSpot
}: Props) {
  const { t } = useTranslation();
  const decisionColors = decisionStyle(decision);

  const bandItems: DataBandItem[] = [
    { label: t('tonight.band.chance'), value: t(chanceKeyFromScore(tonightScoreValue)) },
    { label: t('common.cloud'), value: `${tonightScore?.cloudCover ?? '-'}%`, tone: toneColor(100 - (tonightScore?.cloudCover ?? 100)) },
    { label: t('tonight.band.kpNow'), value: kp.current.toFixed(1), tone: toneColor(Math.round(kp.current * 18)) },
    { label: t('tonight.band.kpPeak'), value: kp.tonightPeak.toFixed(1), tone: toneColor(Math.round(kp.tonightPeak * 18)) },
    { label: t('tonight.band.updated'), value: lastUpdatedAt ? formatUpdatedAt(lastUpdatedAt) : '--:--' }
  ];

  return (
    <Animated.View
      style={[
        styles.hero,
        {
          opacity: heroAnim,
          transform: [
            {
              translateY: heroAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [riseFrom(18), 0]
              })
            }
          ]
        }
      ]}
    >
      <View style={styles.heroTopRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>{t('tonight.heroEyebrow')}</Text>
          <Text style={styles.heroTitle}>{t('tonight.heroTitle')}</Text>
          <Text style={styles.statusLabel}>
            {seasonClosed ? t('tonight.polarDay.statusLabel') : t(recommendationKeyFromLevel(level))}
          </Text>
        </View>

        {seasonClosed ? null : (
          <View style={styles.decisionCluster}>
            <View style={[styles.decisionPill, { backgroundColor: decisionColors.bg, borderColor: decisionColors.border }]}>
              <Text style={[styles.decisionText, { color: decisionColors.text }]}>{t(`tonight.decision.${decision}`)}</Text>
            </View>
            <ScoreGauge
              score={tonightScoreValue}
              label={t('tonight.scoreSuffix')}
              accessibilityLabel={t('tonight.scoreGaugeA11y', { score: tonightScoreValue })}
            />
          </View>
        )}
      </View>

      {seasonClosed ? (
        <PolarDayNotice seasonReturns={seasonReturns} />
      ) : (
        <>
          {daytimeHint ? (
            <View style={styles.daylightNotice}>
              <Ionicons name="sunny" size={18} color={palette.textOnWarningSurface} />
              <Text style={styles.daylightNoticeText}>{daytimeHint}</Text>
            </View>
          ) : null}

          <View style={styles.reasonBlock}>
            <Text style={styles.sectionKicker}>{t(whyTitleKeyFromScore(tonightScoreValue))}</Text>
            <DataBand items={bandItems} />
          </View>
        </>
      )}

      <DataQualityBanner dataQuality={dataQuality} />

      <View style={styles.divider} />

      <View style={[styles.heroColumns, isWideWeb ? styles.heroColumnsWide : null]}>
        {/* During polar day every spot ties at score 0, so "best window" /
            "best spot" would be arbitrary tie-breaks next to a headline
            saying it's too bright to see anything -- suppress both. */}
        {seasonClosed ? null : <BestWindowSection bestSpot={bestSpot} isWideWeb={isWideWeb} />}

        {seasonClosed ? null : (
          <BestSpotPanel bestSpot={bestSpot} bestSpotData={bestSpotData} isWideWeb={isWideWeb} onOpenSpot={onOpenSpot} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: palette.nightPanel,
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    ...elevation.lg,
    gap: space.md
  },
  heroTopRow: {
    flexDirection: 'row',
    // Lets decisionCluster (score pill/number, natural width, not flexed)
    // drop to its own line on very narrow screens instead of continuing to
    // squeeze heroCopy's minWidth floor below -- see heroCopy comment.
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md
  },
  heroCopy: {
    flex: 1,
    // A floor, not 0: long single-word/compound translations (e.g. German
    // "Aurora-Ausblick") need enough width to wrap at a natural word/hyphen
    // boundary rather than being squeezed so narrow that a sub-word has to
    // break mid-character. Copy should still be kept short enough to fit
    // comfortably (see src/i18n/locales) -- this is a layout safety net,
    // not a substitute for that. Paired with heroTopRow's flexWrap above.
    minWidth: 200,
    gap: space.xxs
  },
  eyebrow: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  heroTitle: {
    ...typography.display,
    color: palette.textPrimary
  },
  statusLabel: {
    ...typography.subheading,
    color: palette.auroraMint,
    marginTop: space.xxs
  },
  decisionCluster: {
    alignItems: 'center',
    gap: space.xs
  },
  decisionPill: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs
  },
  decisionText: {
    ...typography.caption,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  daylightNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.warning,
    backgroundColor: palette.warningSurface
  },
  daylightNoticeText: {
    flex: 1,
    ...typography.body,
    color: palette.textOnWarningSurface
  },
  reasonBlock: {
    gap: space.xs
  },
  sectionKicker: {
    ...typography.eyebrow,
    color: palette.auroraMint
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: palette.borderHairline
  },
  heroColumns: {
    gap: space.md
  },
  heroColumnsWide: {
    flexDirection: 'row',
    alignItems: 'stretch'
  }
});
