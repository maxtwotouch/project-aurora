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

// `laterTonight` ("it's daytime, come back after dark") and `bestLater`
// ("clearer skies later in the window") both mean the same thing at heart:
// not now, but the timing will work out -- patience, not a problem. That's
// the copper accent's one genuinely-earned spot in the decision system: the
// other two states are still a real status color (green = go, amber = a
// closer call) so recoloring them would blur an existing meaning, but these
// two were previously borrowed from unrelated info/danger tones (blue "fact"
// and red "wrong") that never quite fit a "wait for it" message. Copper
// reads as warmth/dusk/anticipation rather than an error, which is what a
// "come back later" recommendation actually is.
export function decisionStyle(label: DecisionKey) {
  if (label === 'goNow') {
    return { bg: palette.successSurface, border: palette.auroraGreen, text: palette.auroraMint };
  }
  if (label === 'laterTonight' || label === 'bestLater') {
    return { bg: palette.accentWarmSurface, border: palette.accentWarm, text: palette.textOnAccentWarmSurface };
  }
  return { bg: palette.warningSurface, border: palette.warning, text: palette.textOnWarningSurface };
}
