import { palette } from '../../theme/palette';

export type DecisionKey = 'goNow' | 'wait' | 'bestLater' | 'laterTonight';

export function isLikelyDaytime(now: Date): boolean {
  const hour = now.getHours();
  return hour >= 8 && hour < 17;
}

export function decisionKey(score: number, isDaytimeNow: boolean, bestCloudCover?: number): DecisionKey {
  if (isDaytimeNow) return 'laterTonight';
  if (typeof bestCloudCover === 'number' && bestCloudCover > 80) return 'bestLater';
  if (score >= 65) return 'goNow';
  if (score >= 40) return 'wait';
  return 'bestLater';
}

export function decisionStyle(label: DecisionKey) {
  if (label === 'goNow') {
    return { bg: palette.successSurface, border: palette.auroraGreen, text: palette.auroraMint };
  }
  if (label === 'laterTonight') {
    return { bg: palette.infoSurface, border: palette.auroraBlue, text: palette.textOnInfoSurface };
  }
  if (label === 'wait') {
    return { bg: palette.warningSurface, border: palette.warning, text: palette.textOnWarningSurface };
  }
  return { bg: palette.dangerSurface, border: palette.danger, text: palette.textOnDangerSurface };
}
