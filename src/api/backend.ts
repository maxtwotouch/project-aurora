import type { GeneralForecastScore, HourlyForecast, KpTrend, SpotScoreResult } from '../types';

type BackendTonightSnapshot = {
  updatedAt: string;
  kp: KpTrend;
  tonightScore: GeneralForecastScore | null;
  tomorrowScore: GeneralForecastScore | null;
  sightingPossibleFrom: string | null;
  topSpots: SpotScoreResult[];
  rankings: SpotScoreResult[];
  forecastsBySpotId: Record<string, HourlyForecast[]>;
  dataQuality: {
    usingFallbackKp: boolean;
    fallbackWeatherSpotIds: string[];
  };
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const USE_BACKEND = process.env.EXPO_PUBLIC_USE_BACKEND === 'true';

export function shouldUseBackend(): boolean {
  return USE_BACKEND && Boolean(API_BASE_URL);
}

export async function fetchTonightSnapshotFromBackend(): Promise<BackendTonightSnapshot> {
  if (!API_BASE_URL) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is not set.');
  }

  const response = await fetch(`${API_BASE_URL}/v1/tonight`);
  if (!response.ok) {
    throw new Error(`Backend /v1/tonight failed (${response.status})`);
  }

  return (await response.json()) as BackendTonightSnapshot;
}
