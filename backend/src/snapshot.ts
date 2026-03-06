import spots from '../../src/data/spots.json' with { type: 'json' };

import { rankSpots } from './scoring.js';
import { fetchKpTrendWithQuality, fetchSpotForecastWithQuality } from './sources.js';
import type { HourlyForecast, Spot, TonightSnapshot } from './types.js';

const typedSpots = spots as Spot[];

export async function buildTonightSnapshot(): Promise<TonightSnapshot> {
  const kpResponse = await fetchKpTrendWithQuality();

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
    topSpots,
    rankings,
    forecastsBySpotId,
    dataQuality: {
      usingFallbackKp: kpResponse.usingFallback,
      fallbackWeatherSpotIds
    }
  };
}

export function getSpots(): Spot[] {
  return typedSpots;
}
