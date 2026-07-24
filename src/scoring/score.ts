import { moonAltitudeDeg, moonIlluminatedFraction } from './moon';
import { darknessFactor, solarElevationDeg } from './solar';
import type { HourlyForecast, Spot, SpotHourlyScore, SpotScoreResult } from '../types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

// Tromso sits at roughly 69.65 deg geographic latitude but only ~66.7 deg
// *corrected geomagnetic* latitude -- the coordinate system the auroral oval
// actually follows. That puts Tromso close enough to the oval's typical
// quiet-time position that overhead displays are common even at low
// planetary Kp, while very high Kp pushes the oval equatorward (south),
// away from directly overhead here -- see kpAuroraFactor below. Hard-coded
// as a single named constant, not derived per-request, because this app is
// deliberately single-region (Tromso only) by product decision.
const TROMSO_MAGNETIC_LATITUDE_DEG = 66.7;

// Piecewise-linear Kp -> raw "aurora strength" points, replacing the old
// flat `kp * 15` line. Expressed in the same units as that old curve (so it
// plugs into the unchanged 0.7*cloudFactor + 0.3*kpFactor blend below) but
// reshaped for Tromso's magnetic latitude specifically -- see
// docs/scoring-model.md ("Latitude-aware KP curve") for the full rationale:
//  - Kp 0-2 rises steeply: at Tromso's magnetic latitude, overhead aurora is
//    genuinely common even on quiet nights, so low Kp is not "nothing
//    happening" the way the old linear curve implied.
//  - Kp 2-4 keeps climbing: this is the classic "good, active night" range.
//  - Kp 6+ gently plateaus/rolls off rather than climbing further: at very
//    high Kp the auroral oval's equatorward edge expands south past
//    Tromso's latitude, so the *overhead* view can be no better (and by Kp
//    8-9, slightly worse) than a moderate Kp 4-6 storm -- modeled as a soft
//    rolloff, not a cliff, since this is a real but gradual effect.
const KP_AURORA_CURVE: ReadonlyArray<readonly [kp: number, points: number]> = [
  [0, 20],
  [2, 80],
  [4, 125],
  [6, 130],
  [9, 110]
];

// Exported so other Kp -> score consumers (e.g. useForecast.ts's
// buildTomorrowScore) share this exact curve rather than keeping their own
// separate linear approximation -- see docs/scoring-model.md ("Latitude-aware
// KP curve"). Mirrors backend/src/scoring.ts's identical export.
export function kpAuroraFactor(kp: number): number {
  const clamped = clamp(kp, 0, 9);

  for (let i = 0; i < KP_AURORA_CURVE.length - 1; i += 1) {
    const [kpLow, pointsLow] = KP_AURORA_CURVE[i];
    const [kpHigh, pointsHigh] = KP_AURORA_CURVE[i + 1];
    if (clamped <= kpHigh) {
      const t = (clamped - kpLow) / (kpHigh - kpLow);
      return pointsLow + (pointsHigh - pointsLow) * t;
    }
  }

  return KP_AURORA_CURVE[KP_AURORA_CURVE.length - 1][1];
}

type CloudLayers = { low?: number; medium?: number; high?: number };

// Layer blocking weights -- see docs/scoring-model.md ("Layered clouds").
// Low cloud is dense and close to the ground: treated as fully opaque to
// aurora. Mid-level cloud mostly blocks but thinner patches can leak some
// light through. High cloud is frequently thin cirrus, which is often
// noticeably translucent -- a bright aurora can still show through it.
const CLOUD_LOW_BLOCKING = 1.0;
const CLOUD_MEDIUM_BLOCKING = 0.75;
const CLOUD_HIGH_BLOCKING = 0.4;

/**
 * Combines the three MET cloud layers into a single effective 0-100 "cloud
 * cover" for the existing cloudFactor formula, treating each layer as an
 * independent, partially-transparent veil (their transmissions multiply).
 * Falls back to the plain aggregate `cloudCover` whenever any layer is
 * missing (older cached data, or a source that never populated them) --
 * see docs/scoring-model.md ("Layered clouds").
 */
function computeEffectiveCloudCover(cloudCover: number, cloudLayers?: CloudLayers): number {
  if (
    !cloudLayers ||
    cloudLayers.low === undefined ||
    cloudLayers.medium === undefined ||
    cloudLayers.high === undefined
  ) {
    return cloudCover;
  }

  const lowTransmission = 1 - CLOUD_LOW_BLOCKING * (cloudLayers.low / 100);
  const mediumTransmission = 1 - CLOUD_MEDIUM_BLOCKING * (cloudLayers.medium / 100);
  const highTransmission = 1 - CLOUD_HIGH_BLOCKING * (cloudLayers.high / 100);
  const totalTransmission = clamp(lowTransmission * mediumTransmission * highTransmission, 0, 1);

  return 100 * (1 - totalTransmission);
}

// Every constant below is explained (including which are heuristics tuned by
// feel vs. derived from something concrete) in ../../docs/scoring-model.md.
export function computeScore(
  cloudCover: number,
  kp: number,
  distanceKm: number,
  lightPollution: number,
  cloudLayers?: CloudLayers
): number {
  const effectiveCloudCover = computeEffectiveCloudCover(cloudCover, cloudLayers);
  const cloudFactor = 100 - effectiveCloudCover;
  const kpFactor = kpAuroraFactor(kp); // latitude-aware KP curve -- see docs/scoring-model.md ("Latitude-aware KP curve")
  const estimatedDriveMinutes = distanceKm * 1.15; // drive-time proxy -- see docs/scoring-model.md ("Distance penalty")
  // No distance penalty unless drive time is longer than 2 hours.
  const distancePenalty = estimatedDriveMinutes > 120 ? (estimatedDriveMinutes - 120) * 0.35 : 0;
  const lightPenalty = lightPollution * 5; // light-pollution penalty -- see docs/scoring-model.md ("Light pollution penalty")

  // 0.7/0.3 cloud/KP blend -- see docs/scoring-model.md ("Cloud/KP blend").
  return clamp(0.7 * cloudFactor + 0.3 * kpFactor - distancePenalty - lightPenalty, 0, 100);
}

// Moon factor -- see docs/scoring-model.md ("Moon factor"). Applied per-hour
// (like darknessFactor) rather than inside computeScore, since it needs the
// hour's own timestamp and the spot's own coordinates. Mirrors
// backend/src/scoring.ts's identical computeMoonPenaltyPoints.
const MOON_ILLUMINATION_RAMP_START = 0.5; // below half-illuminated, no washout modeled at all
const MOON_ALTITUDE_RAMP_DEG = 30; // penalty ramps to full strength by ~30deg moon altitude
const MOON_MAX_PENALTY_POINTS = 15; // heuristic cap: full moon, high up, on an otherwise-faint (low-Kp) night
const KP_MOON_IRRELEVANT_AT = 7; // heuristic: by around Kp 7 the aurora is bright enough that moonlight stops mattering

/**
 * Points subtracted from an hourly score for moonlight washout: zero when
 * the moon is below the horizon or too dim (< half-illuminated), ramping up
 * with both illumination and altitude, and damped back toward zero as Kp
 * rises (a bright aurora is visible through moonlight; a faint one isn't).
 * Capped at MOON_MAX_PENALTY_POINTS so it can never be more than a mild
 * penalty on its own.
 */
export function computeMoonPenaltyPoints(illuminatedFraction: number, altitudeDeg: number, kp: number): number {
  if (altitudeDeg <= 0) return 0;

  const illuminationWeight = clamp(
    (illuminatedFraction - MOON_ILLUMINATION_RAMP_START) / (1 - MOON_ILLUMINATION_RAMP_START),
    0,
    1
  );
  const altitudeWeight = clamp(altitudeDeg / MOON_ALTITUDE_RAMP_DEG, 0, 1);
  const kpDampening = clamp(1 - kp / KP_MOON_IRRELEVANT_AT, 0, 1);

  return MOON_MAX_PENALTY_POINTS * illuminationWeight * altitudeWeight * kpDampening;
}

function computeColdScore(temperature: number, windSpeed: number): number {
  // Simple perceived-cold index based on air temperature and wind contribution.
  const perceived = temperature - windSpeed * 0.9;
  return clamp(Math.round((2 - perceived) * 6.5), 0, 100);
}

export type DressLevel = 'arctic' | 'veryCold' | 'cold' | 'cool';

/**
 * Shared threshold logic for cold-weather dress guidance. The i18n display
 * layer (SpotDetailScreen.native.tsx / .web.tsx) maps this level to a
 * translated string -- it no longer reads `SpotScoreResult.dressAdvice`
 * directly, but that field is kept populated below for API/back-compat.
 *
 * NOTE: backend/src/scoring.ts mirrors these exact >=80/60/40 thresholds in
 * its own dressAdviceFromColdScore(). That file is intentionally left
 * untouched in this change (backend is out of scope) -- keep both in sync
 * by hand if these thresholds ever move.
 *
 * Dress thresholds (80/60/40) -- see ../../docs/scoring-model.md ("Cold-score dress thresholds").
 */
export function dressLevelFromColdScore(coldScore: number): DressLevel {
  if (coldScore >= 80) return 'arctic';
  if (coldScore >= 60) return 'veryCold';
  if (coldScore >= 40) return 'cold';
  return 'cool';
}

const DRESS_ADVICE_TEXT: Record<DressLevel, string> = {
  arctic: 'Arctic setup: thermal base, insulated mid-layer, down jacket, windproof shell, mittens, warm boots.',
  veryCold: 'Very cold: wool base layer, fleece/down mid-layer, insulated jacket, hat, gloves, winter boots.',
  cold: 'Cold: layered top, insulated jacket, gloves, and warm footwear.',
  cool: 'Cool: light layers plus a wind-resistant outer jacket.'
};

function dressAdviceFromColdScore(coldScore: number): string {
  return DRESS_ADVICE_TEXT[dressLevelFromColdScore(coldScore)];
}

// Threshold rationale documented in ../../docs/scoring-model.md ("Trend thresholds").
// Mirrors backend/src/scoring.ts's deriveTrend exactly -- keep both in sync by hand.
export function deriveTrend(hourlyScores: SpotHourlyScore[]): SpotScoreResult['trend'] {
  const current = hourlyScores[0]?.score ?? 0;
  let bestIndex = 0;
  let bestScore = current;

  for (let i = 1; i < hourlyScores.length; i += 1) {
    if (hourlyScores[i].score > bestScore) {
      bestScore = hourlyScores[i].score;
      bestIndex = i;
    }
  }

  // The headline `score` reported for a spot (see scoreSpot below) is always
  // the BEST hour's score, not hourlyScores[0]'s in isolation -- so trend
  // must be judged against that same best hour, not "now" alone. Otherwise
  // the UI could show e.g. "80 - good now" when the 80 is actually five
  // hours away.
  const GOOD_SCORE = 55; // "good" bar -- the headline score itself is worth heading out for
  const DECENT_SCORE = 40; // "decent" bar -- below this, a later hour isn't worth flagging as an upgrade
  const MEANINGFUL_IMPROVEMENT = 8; // points of gain needed to call a later hour "meaningfully better" than now
  const IMMINENT_INDEX = 1; // "now-or-imminent" = the best hour is index 0 (now) or 1 (next hour)

  const isImminent = bestIndex <= IMMINENT_INDEX;
  const improvement = bestScore - current;

  if (isImminent && bestScore >= GOOD_SCORE) return 'good_now';
  if (!isImminent && bestScore >= DECENT_SCORE && improvement >= MEANINGFUL_IMPROVEMENT) return 'improving';
  return 'worse';
}

function findBestWindow(hourlyScores: SpotHourlyScore[]) {
  // Pick the best 3-hour rolling average window for practical tonight guidance.
  let bestStart = 0;
  let bestWindowScore = -1;

  if (hourlyScores.length < 3) {
    // Fewer than 3 hours of data means there's no full window to slide, but we
    // still must report the actual best-scoring hour (not always hour[0]).
    // Mirrors backend/src/scoring.ts's findBestWindow.
    const bestHour = hourlyScores.reduce<SpotHourlyScore | undefined>(
      (top, current) => (top === undefined || current.score > top.score ? current : top),
      undefined
    );
    return {
      start: 0,
      end: Math.max(0, hourlyScores.length - 1),
      bestHour: {
        score: bestHour?.score ?? 0,
        cloudCover: bestHour?.cloudCover ?? 100,
        temperature: bestHour?.temperature ?? 0,
        windSpeed: bestHour?.windSpeed ?? 0
      }
    };
  }

  for (let i = 0; i <= hourlyScores.length - 3; i += 1) {
    const window = hourlyScores.slice(i, i + 3);
    const avg = window.reduce((sum, h) => sum + h.score, 0) / window.length;

    if (avg > bestWindowScore) {
      bestWindowScore = avg;
      bestStart = i;
    }
  }

  const chosen = hourlyScores.slice(bestStart, bestStart + 3);
  const bestHour = chosen.reduce((top, curr) => (curr.score > top.score ? curr : top), chosen[0]);

  return {
    start: bestStart,
    end: bestStart + 2,
    bestHour: {
      score: bestHour.score,
      cloudCover: bestHour.cloudCover,
      temperature: bestHour.temperature,
      windSpeed: bestHour.windSpeed
    }
  };
}

export function scoreSpot(spot: Spot, forecast: HourlyForecast[], kpByHour: number[]): SpotScoreResult {
  const hourlyScores: SpotHourlyScore[] = forecast.map((hour, index) => {
    const kp = kpByHour[index] ?? kpByHour[kpByHour.length - 1] ?? 0;
    const rawScore = computeScore(hour.cloudCover, kp, spot.distanceKm, spot.lightPollution, {
      low: hour.cloudCoverLow,
      medium: hour.cloudCoverMedium,
      high: hour.cloudCoverHigh
    });
    // Aurora is physically invisible in a bright sky (e.g. Tromso's
    // midnight sun in summer) regardless of how clear/active the forecast
    // looks -- gate every hourly score by how dark the sky actually is at
    // that spot's own coordinates before window selection ever runs, so
    // "best window" naturally lands in genuinely dark hours (or collapses
    // to 0 when there are none tonight). Mirrors backend/src/scoring.ts.
    const hourMs = new Date(hour.time).getTime();
    const elevation = solarElevationDeg(hourMs, spot.lat, spot.lon);
    // Moon washout penalty -- see computeMoonPenaltyPoints and
    // docs/scoring-model.md ("Moon factor"). Mirrors backend/src/scoring.ts.
    const moonPenalty = computeMoonPenaltyPoints(
      moonIlluminatedFraction(hourMs),
      moonAltitudeDeg(hourMs, spot.lat, spot.lon),
      kp
    );
    const score = clamp(rawScore * darknessFactor(elevation) - moonPenalty, 0, 100);

    return {
      time: hour.time,
      cloudCover: hour.cloudCover,
      temperature: Number(hour.temperature ?? 0),
      windSpeed: Number(hour.windSpeed ?? 0),
      score
    };
  });

  const { start, end, bestHour } = findBestWindow(hourlyScores);
  const coldScore = computeColdScore(bestHour.temperature, bestHour.windSpeed);
  const trend = deriveTrend(hourlyScores);

  return {
    spotId: spot.id,
    spotName: spot.name,
    score: Math.round(bestHour.score),
    trend,
    bestWindowStart: hourlyScores[start]?.time ?? forecast[0]?.time ?? new Date().toISOString(),
    bestWindowEnd: hourlyScores[end]?.time ?? forecast[forecast.length - 1]?.time ?? new Date().toISOString(),
    hourlyScores,
    cloudCoverAtBestHour: Math.round(bestHour.cloudCover),
    temperatureAtBestHour: Math.round(bestHour.temperature * 10) / 10,
    windSpeedAtBestHour: Math.round(bestHour.windSpeed * 10) / 10,
    coldScore,
    dressAdvice: dressAdviceFromColdScore(coldScore)
  };
}

// >80% cloud gate -- see ../../docs/scoring-model.md ("Cloud gate"). Known
// conservative gap: this still gates on the raw aggregate `cloudCover`, not
// the layered-clouds effective cover, so e.g. an 85%-aggregate thin-cirrus
// night stays capped even though computeEffectiveCloudCover would treat it
// as much more transparent -- see docs/scoring-model.md ("Layered clouds")
// for the worked example. Left as-is pending validation-loop data.
function applyCloudGate(result: SpotScoreResult): SpotScoreResult {
  if (result.cloudCoverAtBestHour <= 80) {
    return result;
  }

  return {
    ...result,
    score: Math.min(result.score, 20),
    trend: 'worse'
  };
}

export function rankSpots(spots: Spot[], forecastsBySpotId: Record<string, HourlyForecast[]>, kpByHour: number[]) {
  return spots
    .map((spot) => applyCloudGate(scoreSpot(spot, forecastsBySpotId[spot.id] ?? [], kpByHour)))
    .sort((a, b) => b.score - a.score);
}
