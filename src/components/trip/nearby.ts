import { haversineDistanceM } from '../../trip/presenceCore';
import type { Spot, SpotScoreResult } from '../../types';

/**
 * Pure ranking of a device position against the spot list -- no React
 * Native import (unit-testable in plain Node, mirroring
 * src/trip/presenceCore.ts's own "pure core, no I/O" split). Distance comes
 * from presenceCore's haversineDistanceM (the same great-circle formula
 * used for spot geofencing), converted metres -> km and rounded to one
 * decimal for display.
 */

export type NearbySpotResult = {
  spot: Spot;
  result: SpotScoreResult | undefined;
  distanceKm: number;
};

export type RankNearbySpotsOptions = {
  maxKm: number;
  limit: number;
};

const DEFAULT_OPTIONS: RankNearbySpotsOptions = { maxKm: 80, limit: 4 };

export function rankNearbySpots(
  coords: { latitude: number; longitude: number } | null,
  spots: Spot[],
  rankedSpots: SpotScoreResult[],
  opts: RankNearbySpotsOptions = DEFAULT_OPTIONS
): NearbySpotResult[] {
  if (coords === null) return [];

  const resultBySpotId = rankedSpots.reduce<Record<string, SpotScoreResult>>((acc, result) => {
    acc[result.spotId] = result;
    return acc;
  }, {});

  return spots
    .map((spot) => {
      const distanceM = haversineDistanceM(coords.latitude, coords.longitude, spot.lat, spot.lon);
      const distanceKm = Math.round((distanceM / 1000) * 10) / 10;
      return { spot, result: resultBySpotId[spot.id], distanceKm };
    })
    .filter((entry) => entry.distanceKm <= opts.maxKm)
    .sort((a, b) => {
      const scoreDiff = (b.result?.score ?? -1) - (a.result?.score ?? -1);
      if (scoreDiff !== 0) return scoreDiff;
      return a.distanceKm - b.distanceKm;
    })
    .slice(0, opts.limit);
}
