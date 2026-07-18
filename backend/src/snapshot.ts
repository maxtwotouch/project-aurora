import spots from '../../src/data/spots.json' with { type: 'json' };

import { computeDarknessSeasonState } from './season.js';
import { computeScore, rankSpots } from './scoring.js';
import { darknessFactor, solarElevationDeg } from './solar.js';
import type { Clock } from './sources.js';
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

/**
 * MIRROR: this function has an identical, independently-maintained twin in
 * useForecast.ts's direct-source path (frontend) -- see that file's inline
 * comment for the reverse pointer.
 */
export function buildTomorrowScore(
  forecast: HourlyForecast[],
  kp: KpTrend,
  lat: number,
  lon: number,
  now: Clock = Date.now
): GeneralForecastScore | null {
  const tomorrow = new Date(now());
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

  // Same darkness gate tonight's hourly scores get (see scoring.ts's
  // scoreSpot) -- aurora is invisible in a bright sky regardless of
  // cloud/KP, so each evening hour's contribution is scaled by how dark the
  // sky actually is at that instant (Tromso center coordinates) before
  // averaging into the headline "tomorrow" score. Without this, the
  // "Looking ahead" card kept showing a plausible-looking nonzero score
  // during polar day, even though tomorrow evening is just as bright as
  // tonight.
  const darknessAdjustedHourScores = eveningHours.map((hour) => {
    const rawHourScore = (100 - hour.cloudCover) * 0.7 + tomorrowPeak * 15 * 0.3 - 10;
    const elevation = solarElevationDeg(new Date(hour.time).getTime(), lat, lon);
    return rawHourScore * darknessFactor(elevation);
  });
  const score = Math.round(
    darknessAdjustedHourScores.reduce((sum, value) => sum + value, 0) / darknessAdjustedHourScores.length
  );

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

export async function buildTonightSnapshot(now: Clock = Date.now): Promise<TonightSnapshot> {
  // These three each resolve to a deterministic fallback (never reject) on
  // failure -- see their try/catch bodies in sources.ts -- so it's safe to run
  // them concurrently rather than sequentially (avoiding up to ~3x
  // SOURCE_TIMEOUT_MS of added latency if an upstream is hung).
  const [kpResponse, tromsoForecast, daylightHint] = await Promise.all([
    fetchKpTrendWithQuality(globalThis.fetch, now),
    fetchPointForecastWithQuality(TROMSO_CENTER.lat, TROMSO_CENTER.lon, 48, globalThis.fetch, now),
    fetchSightingPossibleFromWithQuality(TROMSO_CENTER.lat, TROMSO_CENTER.lon, globalThis.fetch, now)
  ]);

  const forecastsBySpotId: Record<string, HourlyForecast[]> = {};
  const fallbackWeatherSpotIds: string[] = [];

  const forecastResults = await Promise.all(
    typedSpots.map(async (spot) => {
      const result = await fetchSpotForecastWithQuality(spot, globalThis.fetch, now);
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
  const darkness = computeDarknessSeasonState(now(), TROMSO_CENTER.lat, TROMSO_CENTER.lon);

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
    tomorrowScore: buildTomorrowScore(tromsoForecast.hourly, kpResponse.kp, TROMSO_CENTER.lat, TROMSO_CENTER.lon, now),
    sightingPossibleFrom: daylightHint.sightingPossibleFrom,
    topSpots,
    rankings,
    forecastsBySpotId,
    dataQuality: {
      usingFallbackKp: kpResponse.usingFallback,
      fallbackWeatherSpotIds: tromsoForecast.usingFallback
        ? [...fallbackWeatherSpotIds, 'tromso_center']
        : fallbackWeatherSpotIds,
      usingFallbackSighting: daylightHint.usingFallback
    },
    darkness
  };
}

export function getSpots(): Spot[] {
  return typedSpots;
}
