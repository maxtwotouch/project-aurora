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
  temperature: number;
  windSpeed: number;
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

export type GeneralForecastScore = {
  label?: string;
  score: number;
  chance: 'High' | 'Medium' | 'Low';
  cloudCover: number;
  peakKp: number;
  bestWindowStart?: string;
  bestWindowEnd?: string;
};

export type DataQuality = {
  usingFallbackKp: boolean;
  fallbackWeatherSpotIds: string[];
  usingFallbackSighting?: boolean;
  /** Set when the snapshot being served was loaded from the on-disk mirror
   * (e.g. right after a restart) and is older than the staleness threshold. */
  staleSnapshot?: boolean;
};

/**
 * Whether it's currently too bright (midnight sun) for aurora to ever be
 * visible tonight, and if so, when that's expected to change. See
 * backend/src/season.ts for the computation.
 */
export type DarknessSeasonState = {
  seasonClosed: boolean;
  /** ISO YYYY-MM-DD of the first night expected to get dark enough for
   * aurora viewing, or `null` when the season is currently open. */
  seasonReturns: string | null;
};

export type TonightSnapshot = {
  updatedAt: string;
  kp: KpTrend;
  tonightScore: GeneralForecastScore | null;
  tomorrowScore: GeneralForecastScore | null;
  sightingPossibleFrom: string | null;
  topSpots: SpotScoreResult[];
  rankings: SpotScoreResult[];
  forecastsBySpotId: Record<string, HourlyForecast[]>;
  dataQuality: DataQuality;
  darkness: DarknessSeasonState;
};

/**
 * Anonymous usage events (see backend/src/events.ts).
 *
 * IMPORTANT: these types intentionally have no room for anything
 * person-derived. Only an allowlisted event type, a spotId (validated
 * against the spot catalog), and an hour-granularity time bucket ever
 * exist for usage data — never raw timestamps, IPs, device/session ids,
 * or coordinates.
 */
export type UsageEventType = 'spot_view' | 'navigate_pressed' | 'spot_shared';

export type UsageEventInput = {
  type: UsageEventType;
  spotId: string;
};

/** Aggregation key granularity: one counter per (type, spot, UTC hour). */
export type UsageCounterRecord = {
  type: UsageEventType;
  spotId: string;
  /** UTC hour bucket, formatted "YYYY-MM-DDTHH". Never finer than the hour. */
  hourBucket: string;
  count: number;
};

export type UsageTypeTotals = Record<UsageEventType, number>;

export type UsageSpotTotals = {
  spotId: string;
  totalsByType: UsageTypeTotals;
  total: number;
};

export type UsageHourTotals = {
  hourBucket: string;
  totalsByType: UsageTypeTotals;
  total: number;
};

export type UsageDayTotals = {
  day: string;
  totalsByType: UsageTypeTotals;
  total: number;
};

/** Small-cell / k-anonymity suppression status for GET /v1/stats/usage. Off
 * by default (`minCell: 0`); when the owner sets `STATS_MIN_CELL` > 0,
 * bySpot/byHour/byDay entries whose `total` falls below the threshold are
 * omitted from those breakdowns (never zeroed-in-place -- omitted entirely),
 * while `totalEvents`/`totalsByType` stay exact (computed over every record,
 * suppression never touches those). */
export type UsageSuppressionInfo = {
  minCell: number;
  suppressedCells: number;
};

/** Aggregate-only usage response for GET /v1/stats/usage. Never row-level. */
export type UsageStatsResponse = {
  generatedAt: string;
  aggregationLevel: 'spot-hour';
  totalEvents: number;
  totalsByType: UsageTypeTotals;
  bySpot: UsageSpotTotals[];
  byHour: UsageHourTotals[];
  byDay: UsageDayTotals[];
  distinctCounterKeys: number;
  suppression: UsageSuppressionInfo;
};
