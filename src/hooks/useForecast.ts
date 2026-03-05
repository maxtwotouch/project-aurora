import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchKpTrend } from '../api/kp';
import { fetchSpotForecast } from '../api/yr';
import spots from '../data/spots.json';
import { rankSpots } from '../scoring/score';
import type { AuroraLevel, HourlyForecast, KpTrend, Spot, SpotScoreResult } from '../types';

type UseForecastResult = {
  loading: boolean;
  error: string | null;
  kp: KpTrend;
  rankedSpots: SpotScoreResult[];
  topSpots: SpotScoreResult[];
  spotsById: Record<string, Spot>;
  forecastsBySpotId: Record<string, HourlyForecast[]>;
  auroraTonightScore: number;
  recommendation: string;
  level: AuroraLevel;
  refresh: () => Promise<void>;
};

const typedSpots = spots as Spot[];

function levelFromScore(score: number): AuroraLevel {
  if (score >= 70) return 'great';
  if (score >= 45) return 'possible';
  return 'low';
}

function recommendationFromLevel(level: AuroraLevel): string {
  if (level === 'great') return 'Great chance tonight';
  if (level === 'possible') return 'Possible but uncertain';
  return 'Low chance tonight';
}

export function useForecast(): UseForecastResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kp, setKp] = useState<KpTrend>({
    current: 2,
    peakNext12h: 5,
    hourly: Array.from({ length: 12 }, (_, i) => Number((2 + (3 * i) / 11).toFixed(1)))
  });
  const [forecastsBySpotId, setForecastsBySpotId] = useState<Record<string, HourlyForecast[]>>({});
  const [rankedSpots, setRankedSpots] = useState<SpotScoreResult[]>([]);

  const spotsById = useMemo(
    () => typedSpots.reduce<Record<string, Spot>>((acc, spot) => ({ ...acc, [spot.id]: spot }), {}),
    []
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const kpTrend = await fetchKpTrend();
      setKp(kpTrend);

      const forecastPairs = await Promise.allSettled(
        typedSpots.map(async (spot) => ({
          spotId: spot.id,
          hourly: await fetchSpotForecast(spot)
        }))
      );

      const forecastMap = forecastPairs.reduce<Record<string, HourlyForecast[]>>((acc, result, index) => {
        if (result.status === 'fulfilled') {
          acc[result.value.spotId] = result.value.hourly;
        } else {
          acc[typedSpots[index].id] = [];
        }
        return acc;
      }, {});

      const ranked = rankSpots(typedSpots, forecastMap, kpTrend.hourly);

      setForecastsBySpotId(forecastMap);
      setRankedSpots(ranked);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load forecast.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const topSpots = rankedSpots.slice(0, 5);
  const auroraTonightScore =
    topSpots.length > 0 ? Math.round(topSpots.reduce((sum, item) => sum + item.score, 0) / topSpots.length) : 0;
  const level = levelFromScore(auroraTonightScore);
  const recommendation = recommendationFromLevel(level);

  return {
    loading,
    error,
    kp,
    rankedSpots,
    topSpots,
    spotsById,
    forecastsBySpotId,
    auroraTonightScore,
    recommendation,
    level,
    refresh
  };
}
