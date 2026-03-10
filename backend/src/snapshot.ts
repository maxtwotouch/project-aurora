import spots from '../../src/data/spots.json' with { type: 'json' };

import { computeScore, rankSpots } from './scoring.js';
import {
  fetchKpTrendWithQuality,
  fetchPointForecastWithQuality,
  fetchSightingPossibleFromWithQuality,
  fetchSpotForecastWithQuality
} from './sources.js';
import type { GeneralForecastScore, HourlyForecast, KpTrend, Spot, TonightSnapshot } from './types.js';

const typedSpots = spots as Spot[];
const TROMSO_CENTER = { lat: 69.6492, lon: 18.9553 };

function chanceFromScore(score: number): GeneralForecastScore['chance'] {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

function buildTomorrowScore(forecast: HourlyForecast[], kp: KpTrend): GeneralForecastScore | null {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().slice(0, 10);

  const eveningHours = forecast.filter((hour) => {
    const date = new Date(hour.time);
    const sameDay = hour.time.slice(0, 10) === tomorrowKey;
    const isEvening = date.getHours() >= 18 && date.getHours() <= 23;
    return sameDay && isEvening;
  });

  if (eveningHours.length === 0) {
    return null;
  }

  const avgCloud = eveningHours.reduce((sum, hour) => sum + hour.cloudCover, 0) / eveningHours.length;
  const tomorrowPeak = kp.dailyOutlook?.find((item) => item.label === 'Tomorrow')?.peak ?? kp.peakNext12h;
  const score = Math.round((100 - avgCloud) * 0.7 + tomorrowPeak * 15 * 0.3 - 10);
  const bestWindowStart = eveningHours[0]?.time;
  const bestWindowEnd = eveningHours[Math.min(2, eveningHours.length - 1)]?.time;

  return {
    label: 'Tomorrow',
    score,
    chance: chanceFromScore(score),
    cloudCover: Math.round(avgCloud),
    peakKp: Number(tomorrowPeak.toFixed(1)),
    bestWindowStart,
    bestWindowEnd
  };
}

export async function buildTonightSnapshot(): Promise<TonightSnapshot> {
  const kpResponse = await fetchKpTrendWithQuality();
  const tromsoForecast = await fetchPointForecastWithQuality(TROMSO_CENTER.lat, TROMSO_CENTER.lon, 48);
  const daylightHint = await fetchSightingPossibleFromWithQuality(TROMSO_CENTER.lat, TROMSO_CENTER.lon);

  const forecastsBySpotId: Record<string, HourlyForecast[]> = {};
  const fallbackWeatherSpotIds: string[] = [];

  const forecastResults = await Promise.all(
    typedSpots.map(async (spot) => {
      const result = await fetchSpotForecastWithQuality(spot);
      if (result.usingFallback) {
        fallbackWeatherSpotIds.push(spot.id);
      }
      forecastsBySpotId[spot.id] = result.hourly;
    })
  );
  void forecastResults;

  const rankings = rankSpots(typedSpots, forecastsBySpotId, kpResponse.kp.hourly);
  const topSpots = rankings.slice(0, 5);
  const bestSpot = rankings[0];

  return {
    updatedAt: new Date().toISOString(),
    kp: kpResponse.kp,
    tonightScore: bestSpot
      ? {
          label: bestSpot.spotName,
          score: bestSpot.score,
          chance: chanceFromScore(bestSpot.score),
          cloudCover: bestSpot.cloudCoverAtBestHour,
          peakKp: Number(kpResponse.kp.tonightPeak.toFixed(1)),
          bestWindowStart: bestSpot.bestWindowStart,
          bestWindowEnd: bestSpot.bestWindowEnd
        }
      : null,
    tomorrowScore: buildTomorrowScore(tromsoForecast.hourly, kpResponse.kp),
    sightingPossibleFrom: daylightHint.sightingPossibleFrom,
    topSpots,
    rankings,
    forecastsBySpotId,
    dataQuality: {
      usingFallbackKp: kpResponse.usingFallback,
      fallbackWeatherSpotIds: tromsoForecast.usingFallback
        ? [...fallbackWeatherSpotIds, 'tromso_center']
        : fallbackWeatherSpotIds
    }
  };
}

export function getSpots(): Spot[] {
  return typedSpots;
}
