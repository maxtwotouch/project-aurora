import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchTonightSnapshotFromBackend, shouldUseBackend } from '../api/backend';
import { fetchKpTrend } from '../api/kp';
import { fetchPointForecast, fetchSpotForecast } from '../api/yr';
import spots from '../data/spots.json';
import { computeScore } from '../scoring/score';
import { rankSpots } from '../scoring/score';
import type { AuroraLevel, GeneralForecastScore, HourlyForecast, KpTrend, Spot, SpotScoreResult } from '../types';

type UseForecastResult = {
  loading: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
  dataQuality: {
    usingFallbackKp: boolean;
    fallbackWeatherSpotIds: string[];
  };
  kp: KpTrend;
  rankedSpots: SpotScoreResult[];
  topSpots: SpotScoreResult[];
  spotsById: Record<string, Spot>;
  forecastsBySpotId: Record<string, HourlyForecast[]>;
  auroraTonightScore: number;
  tomorrowScore: GeneralForecastScore | null;
  recommendation: string;
  level: AuroraLevel;
  refresh: () => Promise<void>;
};

const typedSpots = spots as Spot[];
const TROMSO_CENTER = { lat: 69.6492, lon: 18.9553 };

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
  const score = Math.round(computeScore(avgCloud, tomorrowPeak, 0, 2));

  return {
    label: 'Tomorrow',
    score,
    chance: chanceFromScore(score),
    cloudCover: Math.round(avgCloud),
    peakKp: Number(tomorrowPeak.toFixed(1))
  };
}

export function useForecast(): UseForecastResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [dataQuality, setDataQuality] = useState<UseForecastResult['dataQuality']>({
    usingFallbackKp: false,
    fallbackWeatherSpotIds: []
  });
  const [kp, setKp] = useState<KpTrend>({
    current: 2,
    peakNext12h: 5,
    hourly: Array.from({ length: 12 }, (_, i) => Number((2 + (3 * i) / 11).toFixed(1)))
  });
  const [forecastsBySpotId, setForecastsBySpotId] = useState<Record<string, HourlyForecast[]>>({});
  const [rankedSpots, setRankedSpots] = useState<SpotScoreResult[]>([]);
  const [tomorrowScore, setTomorrowScore] = useState<GeneralForecastScore | null>(null);

  const spotsById = useMemo(
    () => typedSpots.reduce<Record<string, Spot>>((acc, spot) => ({ ...acc, [spot.id]: spot }), {}),
    []
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (shouldUseBackend()) {
        try {
          const snapshot = await fetchTonightSnapshotFromBackend();
          setKp(snapshot.kp);
          setForecastsBySpotId(snapshot.forecastsBySpotId);
          setRankedSpots(snapshot.rankings);
          setLastUpdatedAt(snapshot.updatedAt);
          setDataQuality(snapshot.dataQuality);
          setTomorrowScore(snapshot.tomorrowScore);
          return;
        } catch {
          // Graceful fallback for beta reliability if backend is temporarily unavailable.
        }
      }

      const kpTrend = await fetchKpTrend();
      setKp(kpTrend);
      const tromsoForecast = await fetchPointForecast(TROMSO_CENTER.lat, TROMSO_CENTER.lon, 48);
      setTomorrowScore(buildTomorrowScore(tromsoForecast, kpTrend));

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
      setLastUpdatedAt(new Date().toISOString());
      setDataQuality({
        usingFallbackKp: false,
        fallbackWeatherSpotIds: []
      });
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
    lastUpdatedAt,
    dataQuality,
    kp,
    rankedSpots,
    topSpots,
    spotsById,
    forecastsBySpotId,
    auroraTonightScore,
    tomorrowScore,
    recommendation,
    level,
    refresh
  };
}
