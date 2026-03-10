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
const OSLO_TIME_ZONE = 'Europe/Oslo';

function chanceFromScore(score: number): GeneralForecastScore['chance'] {
  if (score >= 70) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

function getOsloParts(input: Date | string): { dayKey: string; hour: number } | null {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);

  if (!year || !month || !day || !Number.isFinite(hour)) {
    return null;
  }

  return {
    dayKey: `${year}-${month}-${day}`,
    hour
  };
}

function addDaysToDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isInTonightWindow(parts: { dayKey: string; hour: number }, tonightStartDay: string, tonightEndDay: string) {
  return (parts.dayKey === tonightStartDay && parts.hour >= 18) || (parts.dayKey === tonightEndDay && parts.hour <= 6);
}

function buildTonightScore(forecast: HourlyForecast[], kp: KpTrend): GeneralForecastScore | null {
  const todayParts = getOsloParts(new Date());
  if (!todayParts) {
    return null;
  }

  const tonightStartDay = todayParts.hour < 6 ? addDaysToDayKey(todayParts.dayKey, -1) : todayParts.dayKey;
  const tonightEndDay = addDaysToDayKey(tonightStartDay, 1);
  const tonightHours = forecast.filter((hour) => {
    const parts = getOsloParts(hour.time);
    return parts ? isInTonightWindow(parts, tonightStartDay, tonightEndDay) : false;
  });

  if (tonightHours.length === 0) {
    return null;
  }

  let bestStart = 0;
  let bestAvgCloud = 100;

  for (let i = 0; i < tonightHours.length; i += 1) {
    const window = tonightHours.slice(i, i + 3);
    const avgCloud = window.reduce((sum, hour) => sum + hour.cloudCover, 0) / window.length;

    if (avgCloud < bestAvgCloud) {
      bestAvgCloud = avgCloud;
      bestStart = i;
    }
  }

  const chosen = tonightHours.slice(bestStart, bestStart + 3);
  const avgCloud = chosen.reduce((sum, hour) => sum + hour.cloudCover, 0) / chosen.length;
  const score = Math.round(computeScore(avgCloud, kp.tonightPeak, 0, 2));

  return {
    label: 'Tonight',
    score,
    chance: chanceFromScore(score),
    cloudCover: Math.round(avgCloud),
    peakKp: Number(kp.tonightPeak.toFixed(1)),
    bestWindowStart: chosen[0]?.time,
    bestWindowEnd: chosen[chosen.length - 1]?.time
  };
}

function buildTomorrowScore(forecast: HourlyForecast[], kp: KpTrend): GeneralForecastScore | null {
  const todayParts = getOsloParts(new Date());
  if (!todayParts) {
    return null;
  }

  const tomorrowKey = addDaysToDayKey(todayParts.dayKey, 1);

  const eveningHours = forecast.filter((hour) => {
    const parts = getOsloParts(hour.time);
    if (!parts) {
      return false;
    }

    const sameDay = parts.dayKey === tomorrowKey;
    const isEvening = parts.hour >= 18 && parts.hour <= 23;
    return sameDay && isEvening;
  });

  if (eveningHours.length === 0) {
    return null;
  }

  const avgCloud = eveningHours.reduce((sum, hour) => sum + hour.cloudCover, 0) / eveningHours.length;
  const tomorrowPeak = kp.dailyOutlook?.find((item) => item.label === 'Tomorrow')?.peak ?? kp.peakNext12h;
  const score = Math.round(computeScore(avgCloud, tomorrowPeak, 0, 2));
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

  return {
    updatedAt: new Date().toISOString(),
    kp: kpResponse.kp,
    tonightScore: buildTonightScore(tromsoForecast.hourly, kpResponse.kp),
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
