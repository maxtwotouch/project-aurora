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
  /**
   * Optional per-layer cloud fractions (0-100), from MET Norway's
   * locationforecast compact API (`cloud_area_fraction_low` / `_medium` /
   * `_high`). Additive and optional so older cached data and any source that
   * only ever produces the aggregate `cloudCover` keep parsing -- scoring
   * gracefully falls back to `cloudCover` alone whenever any of these three
   * is missing. See docs/scoring-model.md ("Layered clouds").
   */
  cloudCoverLow?: number;
  cloudCoverMedium?: number;
  cloudCoverHigh?: number;
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
  /** True when every nowcast source failed for this refresh (see
   * backend/src/nowcast.ts's fetchNowcastSummary / src/api/swpc.ts's direct-mode
   * twin) -- `nowcast` will be `undefined` whenever this is true. Optional/additive
   * so older cached preview snapshots keep parsing. Mirrors
   * backend/src/types.ts's DataQuality.usingFallbackNowcast field-for-field. */
  usingFallbackNowcast?: boolean;
};

/**
 * "Is it happening right now" display level for the nowcast (see
 * NowcastSummary). Derived by the pure, twin-ready src/scoring/nowcast.ts's
 * deriveNowcastLevel (copied verbatim from backend/src/nowcast.ts) --
 * deliberately independent of the 0-100 planning score. See docs/nowcast.md.
 * Field-for-field twin of backend/src/types.ts's NowcastLevel.
 */
export type NowcastLevel = 'quiet' | 'stirring' | 'active' | 'storming';

/** Which upstream nowcast sources actually returned usable data for the
 * current NowcastSummary. Field-for-field twin of backend/src/types.ts's
 * NowcastSourceId. */
export type NowcastSourceId = 'solar_wind' | 'ovation' | 'tgo_magnetometer';

/**
 * Real-time "is it happening right now" aurora signal (solar wind at L1 +
 * the OVATION aurora oval model + best-effort ground magnetometer truth).
 * Distinct from -- and never influences -- the 0-100 planning score or
 * alerts; this is purely an additional display signal for "right now". See
 * docs/nowcast.md.
 *
 * In backend mode this comes straight from `GET /v1/tonight`'s
 * `TonightSnapshot.nowcast` (see backend/src/nowcast.ts's fetchNowcastSummary
 * and snapshot.ts's buildTonightSnapshot). In direct mode (EXPO_PUBLIC_USE_BACKEND
 * false) it's assembled by src/api/swpc.ts's own fetchNowcastSummary, the frontend
 * twin of the backend fetchers. Field-for-field twin of backend/src/types.ts's
 * NowcastSummary -- keep both in sync by hand.
 */
export type NowcastSummary = {
  updatedAt: string;
  level: NowcastLevel;
  /** IMF Bz at L1 (nT, GSM). Negative = southward = aurora-coupling-favorable.
   * `null` when the solar wind source is unavailable. */
  bz: number | null;
  /** Solar wind bulk speed at L1 (km/s). `null` when unavailable. */
  solarWindSpeed: number | null;
  /** Solar wind proton density at L1 (particles/cm^3). `null` when unavailable. */
  solarWindDensity: number | null;
  /** Approximate L1-to-magnetosphere propagation time (minutes), derived from
   * `solarWindSpeed`. `null` when speed is unavailable. See docs/nowcast.md
   * ("Limitations") -- this is a ballpark, not a guarantee. */
  leadTimeMinutes: number | null;
  /** Max OVATION aurora probability/flux value in the Tromso window. `null`
   * when the OVATION source is unavailable. */
  ovationProbability: number | null;
  /** OVATION's own forecast-valid-at timestamp for `ovationProbability`.
   * `null` when unavailable. */
  ovationForecastTime: string | null;
  /** Ground-truth magnetic disturbance at Tromso (TGO magnetometer), nT.
   * Currently always `null` -- see backend/src/nowcast.ts's
   * fetchTgoDisturbanceWithQuality (deliberate stub pending owner sign-off on
   * TGO's data-use terms). */
  tgoDisturbanceNt: number | null;
  /** Which of the three sources above actually contributed data this refresh. */
  sourcesAvailable: NowcastSourceId[];
  /** `time_tag` of the RTSW row `bz` was read from (verbatim, upstream-UTC,
   * unmarked), letting the UI show "how old is this Bz reading" rather than
   * implying it's exactly as fresh as `updatedAt` (which is fetch time, not
   * reading time). `null`/absent when `bz` is null. Optional + additive so
   * snapshots built before this field existed keep parsing. */
  bzReadingAt?: string | null;
  /** `time_tag` of the RTSW row `solarWindSpeed`/`solarWindDensity` were
   * read from (both come from the same plasma row). Same rationale/contract
   * as `bzReadingAt`. */
  plasmaReadingAt?: string | null;
};
