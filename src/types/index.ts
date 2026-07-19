export type Spot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  lightPollution: number;
  horizon: string;
  description: string;
  busStop?: string;
  parking?: string;
  source?: string;
};

export type HourlyForecast = {
  time: string;
  cloudCover: number;
  temperature?: number;
  windSpeed?: number;
};

export type SpotForecast = {
  spotId: string;
  hourly: HourlyForecast[];
};

export type SpotHourlyScore = {
  time: string;
  score: number;
  cloudCover: number;
  temperature: number;
  windSpeed: number;
};

export type SpotScoreResult = {
  spotId: string;
  spotName: string;
  score: number;
  trend: 'good_now' | 'improving' | 'worse';
  bestWindowStart: string;
  bestWindowEnd: string;
  hourlyScores: SpotHourlyScore[];
  cloudCoverAtBestHour: number;
  temperatureAtBestHour: number;
  windSpeedAtBestHour: number;
  coldScore: number;
  dressAdvice: string;
};

export type AuroraLevel = 'great' | 'possible' | 'low';

export type KpTrend = {
  current: number;
  peakNext12h: number;
  tonightPeak: number;
  hourly: number[];
  dailyOutlook?: {
    label: string;
    peak: number;
  }[];
};

export type AuroraPoint = {
  lat: number;
  lon: number;
  probability: number;
};

export type GeneralForecastScore = {
  label?: string;
  score: number;
  chance: 'High' | 'Medium' | 'Low';
  cloudCover: number;
  peakKp: number;
  bestWindowStart?: string;
  bestWindowEnd?: string;
};

export type DaylightHint = {
  sightingPossibleFrom: string | null;
};

/**
 * Whether it's currently too bright (midnight sun) for aurora to ever be
 * visible tonight, and if so, when that's expected to change. See
 * src/scoring/season.ts (direct-source path) / backend/src/season.ts
 * (backend path) for the computation.
 */
export type DarknessSeasonState = {
  seasonClosed: boolean;
  /** ISO YYYY-MM-DD of the first night expected to get dark enough for
   * aurora viewing, or `null` when the season is currently open. */
  seasonReturns: string | null;
};

export type AppDataQuality = {
  sourceMode: 'backend' | 'direct';
  backendRequested: boolean;
  backendUnavailable: boolean;
  usingFallbackKp: boolean;
  fallbackWeatherSpotIds: string[];
};
