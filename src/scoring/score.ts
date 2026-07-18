import { darknessFactor, solarElevationDeg } from './solar';
import type { HourlyForecast, Spot, SpotHourlyScore, SpotScoreResult } from '../types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function computeScore(cloudCover: number, kp: number, distanceKm: number, lightPollution: number): number {
  const cloudFactor = 100 - cloudCover;
  const kpFactor = kp * 15;
  const estimatedDriveMinutes = distanceKm * 1.15;
  // No distance penalty unless drive time is longer than 2 hours.
  const distancePenalty = estimatedDriveMinutes > 120 ? (estimatedDriveMinutes - 120) * 0.35 : 0;
  const lightPenalty = lightPollution * 5;

  return clamp(0.7 * cloudFactor + 0.3 * kpFactor - distancePenalty - lightPenalty, 0, 100);
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

function deriveTrend(hourlyScores: SpotHourlyScore[]): SpotScoreResult['trend'] {
  const current = hourlyScores[0]?.score ?? 0;
  let bestIndex = 0;
  let bestScore = current;

  for (let i = 1; i < hourlyScores.length; i += 1) {
    if (hourlyScores[i].score > bestScore) {
      bestScore = hourlyScores[i].score;
      bestIndex = i;
    }
  }

  const improvement = bestScore - current;
  if (improvement >= 8 && bestIndex >= 2) return 'improving';
  if (current >= 55) return 'good_now';
  if (bestIndex <= 2 && current >= 40) return 'good_now';
  if (bestScore < 40) return 'worse';
  return bestIndex >= 2 ? 'improving' : 'worse';
}

function findBestWindow(hourlyScores: SpotHourlyScore[]) {
  // Pick the best 3-hour rolling average window for practical tonight guidance.
  let bestStart = 0;
  let bestWindowScore = -1;

  if (hourlyScores.length < 3) {
    const bestHour = hourlyScores[0];
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
    const rawScore = computeScore(
      hour.cloudCover,
      kpByHour[index] ?? kpByHour[kpByHour.length - 1] ?? 0,
      spot.distanceKm,
      spot.lightPollution
    );
    // Aurora is physically invisible in a bright sky (e.g. Tromso's
    // midnight sun in summer) regardless of how clear/active the forecast
    // looks -- gate every hourly score by how dark the sky actually is at
    // that spot's own coordinates before window selection ever runs, so
    // "best window" naturally lands in genuinely dark hours (or collapses
    // to 0 when there are none tonight). Mirrors backend/src/scoring.ts.
    const elevation = solarElevationDeg(new Date(hour.time).getTime(), spot.lat, spot.lon);
    const score = rawScore * darknessFactor(elevation);

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
