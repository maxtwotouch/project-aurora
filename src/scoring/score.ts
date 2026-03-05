import type { HourlyForecast, Spot, SpotHourlyScore, SpotScoreResult } from '../types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export function computeScore(cloudCover: number, kp: number, distanceKm: number, lightPollution: number): number {
  const cloudFactor = 100 - cloudCover;
  const kpFactor = kp * 15;
  const estimatedDriveMinutes = distanceKm * 1.15;
  // No distance penalty unless drive time is longer than 2 hours.
  const distancePenalty = estimatedDriveMinutes > 120 ? (estimatedDriveMinutes - 120) * 0.35 : 0;
  const lightPenalty = lightPollution * 8;

  return clamp(0.7 * cloudFactor + 0.3 * kpFactor - distancePenalty - lightPenalty, 0, 100);
}

function computeColdScore(temperature: number, windSpeed: number): number {
  // Simple perceived-cold index based on air temperature and wind contribution.
  const perceived = temperature - windSpeed * 0.9;
  return clamp(Math.round((2 - perceived) * 6.5), 0, 100);
}

function dressAdviceFromColdScore(coldScore: number): string {
  if (coldScore >= 80) {
    return 'Arctic setup: thermal base, insulated mid-layer, down jacket, windproof shell, mittens, warm boots.';
  }
  if (coldScore >= 60) {
    return 'Very cold: wool base layer, fleece/down mid-layer, insulated jacket, hat, gloves, winter boots.';
  }
  if (coldScore >= 40) {
    return 'Cold: layered top, insulated jacket, gloves, and warm footwear.';
  }
  return 'Cool: light layers plus a wind-resistant outer jacket.';
}

function deriveTrend(hourlyScores: SpotHourlyScore[]): SpotScoreResult['trend'] {
  const current = hourlyScores[0]?.score ?? 0;
  const nextWindow = hourlyScores.slice(1, 4);
  const nextAverage =
    nextWindow.length > 0 ? nextWindow.reduce((sum, entry) => sum + entry.score, 0) / nextWindow.length : current;
  const delta = nextAverage - current;

  if (current >= 55 && delta > -6) return 'good_now';
  if (delta >= 6) return 'improving';
  if (delta <= -6) return 'worse';
  return current >= 40 ? 'good_now' : 'worse';
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
  const hourlyScores: SpotHourlyScore[] = forecast.map((hour, index) => ({
    time: hour.time,
    cloudCover: hour.cloudCover,
    temperature: Number(hour.temperature ?? 0),
    windSpeed: Number(hour.windSpeed ?? 0),
    score: computeScore(hour.cloudCover, kpByHour[index] ?? kpByHour[kpByHour.length - 1] ?? 0, spot.distanceKm, spot.lightPollution)
  }));

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

export function rankSpots(spots: Spot[], forecastsBySpotId: Record<string, HourlyForecast[]>, kpByHour: number[]) {
  return spots
    .map((spot) => scoreSpot(spot, forecastsBySpotId[spot.id] ?? [], kpByHour))
    .sort((a, b) => b.score - a.score);
}
