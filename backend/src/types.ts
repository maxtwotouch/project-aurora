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
  /**
   * Optional per-layer cloud fractions (0-100), from MET Norway's
   * locationforecast compact API (`cloud_area_fraction_low` / `_medium` /
   * `_high`). Additive and optional so older cached snapshots and any
   * source that only ever produces the aggregate `cloudCover` keep parsing
   * -- scoring gracefully falls back to `cloudCover` alone whenever any of
   * these three is missing. See docs/scoring-model.md ("Layered clouds").
   */
  cloudCoverLow?: number;
  cloudCoverMedium?: number;
  cloudCoverHigh?: number;
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
  /** True when every nowcast source failed for this refresh (see
   * backend/src/nowcast.ts's fetchNowcastSummary) -- `TonightSnapshot.nowcast`
   * will be `undefined` whenever this is true. Optional/additive so older
   * cached snapshots (built before nowcast existed) keep parsing. */
  usingFallbackNowcast?: boolean;
};

/**
 * "Is it happening right now" display level for the nowcast (see
 * NowcastSummary). Derived by the pure, twin-ready
 * backend/src/nowcast.ts#deriveNowcastLevel -- deliberately independent of
 * the 0-100 planning score (scoring.ts) and of alerts.ts.
 */
export type NowcastLevel = 'quiet' | 'stirring' | 'active' | 'storming';

/** Which upstream nowcast sources actually returned usable data for the
 * current NowcastSummary. See backend/src/nowcast.ts. */
export type NowcastSourceId = 'solar_wind' | 'ovation' | 'tgo_magnetometer';

/**
 * Real-time "is it happening right now" aurora signal (solar wind at L1 +
 * the OVATION aurora oval model + best-effort ground magnetometer truth).
 * Distinct from -- and never influences -- the 0-100 planning score
 * (`TonightSnapshot.tonightScore` / `SpotScoreResult.score`) or alerts.ts;
 * this is purely an additional display signal for "right now", while the
 * planning score is about tonight's outlook. See docs/nowcast.md.
 *
 * Additive + optional on `TonightSnapshot`: absent whenever every upstream
 * nowcast source fails, so a NOAA/UiT outage never affects the rest of the
 * snapshot (weather/KP planning, spot rankings) -- see
 * backend/src/nowcast.ts's fetchNowcastSummary and snapshot.ts's
 * buildTonightSnapshot.
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
  /** Ground-truth magnetic disturbance at Tromso (Tromso Geophysical
   * Observatory / UiT magnetometer), nT. Currently always `null` -- see
   * backend/src/nowcast.ts's fetchTgoDisturbanceWithQuality (deliberate stub
   * pending owner sign-off on TGO's data-use terms). */
  tgoDisturbanceNt: number | null;
  /** Which of the three sources above actually contributed data this refresh. */
  sourcesAvailable: NowcastSourceId[];
  /** `time_tag` of the RTSW row `bz` was read from (verbatim, upstream-UTC,
   * unmarked -- see nowcast.ts's parseTimeTagMs), letting the UI show "how
   * old is this Bz reading" rather than implying it's exactly as fresh as
   * `updatedAt` (which is fetch time, not reading time). `null`/absent when
   * `bz` is null. Optional + additive so snapshots built before this field
   * existed keep parsing. */
  bzReadingAt?: string | null;
  /** `time_tag` of the RTSW row `solarWindSpeed`/`solarWindDensity` were
   * read from (both come from the same plasma row). Same rationale/contract
   * as `bzReadingAt`. */
  plasmaReadingAt?: string | null;
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
  /** Real-time "is it happening right now" signal -- see NowcastSummary.
   * Additive + optional: absent whenever every upstream nowcast source
   * fails, so the app works exactly as it did before nowcast existed. */
  nowcast?: NowcastSummary;
};

/**
 * Anonymous usage events (see backend/src/events.ts).
 *
 * IMPORTANT: these types intentionally have no room for anything
 * person-derived. Every event carries only an allowlisted event type, an
 * hour-granularity time bucket, and — depending on type — a spotId
 * (validated against the spot catalog), an h3 resolution-7 cell id, a
 * coarse dwell-duration bucket, or a small-allowlist-shaped
 * recommendationId. Never raw timestamps, IPs, device/session ids, or
 * coordinates.
 *
 * `spot_visit` / `recommended_spot_visit` / `zone_dwell` are the three
 * unlinked tourism event types added per docs/analytics-pivot.md's
 * "Amendment (owner decision, 2026-08-22 …)". They flow through this SAME
 * identity-free aggregate pipeline as the original three product-usage
 * event types (spot_view / navigate_pressed / spot_shared) — never sent to
 * PostHog, never joined with the pseudonymous per-install id used there
 * (see docs/analytics-pivot.md section 1's "Does not change").
 */
export type UsageEventType =
  | 'spot_view'
  | 'navigate_pressed'
  | 'spot_shared'
  | 'spot_visit'
  | 'recommended_spot_visit'
  | 'zone_dwell';

/** Coarse dwell-duration bucket shared by `spot_visit` and `zone_dwell` —
 * never a raw duration, always one of these five buckets. */
export type DwellBucket = '<5m' | '5-15m' | '15-30m' | '30-60m' | '60m+';

export const DWELL_BUCKETS: readonly DwellBucket[] = ['<5m', '5-15m', '15-30m', '30-60m', '60m+'];

/**
 * Discriminated per-type wire payload accepted by POST /v1/events.
 *
 * The original three types carry no time field at all — the server stamps
 * them with its own current UTC hour (see toHourBucket() in usageStore.ts),
 * unchanged from before this amendment.
 *
 * The three tourism types instead carry `utcHour` (0-23, hour-of-day only,
 * never a full timestamp): on-device geofencing computes a visit/dwell
 * summary that may be flushed to the network slightly after the hour it
 * belongs to, so the client tags the intended hour explicitly rather than
 * relying on "whatever hour the server happens to be in when the batch
 * arrives". The server combines this with its own current UTC calendar date
 * to build the same "YYYY-MM-DDTHH" hourBucket format used everywhere else
 * (see toHourBucketFromUtcHour() in usageStore.ts) — still never finer than
 * the hour, still no raw timestamp ever leaves the device.
 */
export type UsageEventInput =
  | { type: 'spot_view' | 'navigate_pressed' | 'spot_shared'; spotId: string }
  | { type: 'spot_visit'; spotId: string; utcHour: number; dwellBucket: DwellBucket }
  | { type: 'recommended_spot_visit'; spotId: string; utcHour: number; recommendationId: string }
  | { type: 'zone_dwell'; h3Cell: string; utcHour: number; dwellBucket: DwellBucket };

/**
 * Aggregation key granularity, one counter per distinct key:
 *   - spot_view / navigate_pressed / spot_shared: (type, spotId, hourBucket)
 *   - spot_visit:              (type, spotId, hourBucket, dwellBucket)
 *   - recommended_spot_visit:  (type, spotId, hourBucket, recommendationId)
 *   - zone_dwell:              (type, h3Cell, hourBucket, dwellBucket)
 * See usageStore.ts's encodeKey/decodeKey for the exact on-disk string
 * encoding of each shape.
 */
export type UsageCounterRecord =
  | { type: 'spot_view' | 'navigate_pressed' | 'spot_shared'; spotId: string; hourBucket: string; count: number }
  | { type: 'spot_visit'; spotId: string; hourBucket: string; dwellBucket: DwellBucket; count: number }
  | {
      type: 'recommended_spot_visit';
      spotId: string;
      hourBucket: string;
      recommendationId: string;
      count: number;
    }
  | { type: 'zone_dwell'; h3Cell: string; hourBucket: string; dwellBucket: DwellBucket; count: number };

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

/** Aggregate-only per-cell totals for `zone_dwell` (see UsageStatsResponse's
 * `byZoneCell`). An h3 cell id only ever carries `zone_dwell` counts (no
 * other event type is keyed by h3Cell), so — unlike bySpot/byHour/byDay —
 * this is a flat {h3Cell, total} rather than a full per-type breakdown. */
export type UsageZoneCellTotals = {
  h3Cell: string;
  total: number;
};

/** Small-cell / k-anonymity suppression status for GET /v1/stats/usage. Off
 * by default (`minCell: 0`); when the owner sets `STATS_MIN_CELL` > 0,
 * bySpot/byHour/byDay/byZoneCell entries whose `total` falls below the
 * threshold are omitted from those breakdowns (never zeroed-in-place --
 * omitted entirely), while `totalEvents`/`totalsByType` stay exact (computed
 * over every record, suppression never touches those). */
export type UsageSuppressionInfo = {
  minCell: number;
  suppressedCells: number;
};

/** Aggregate-only usage response for GET /v1/stats/usage. Never row-level.
 *
 * `aggregationLevel` stays the literal `'spot-hour'` it was before this
 * amendment — it describes the original bySpot/byHour/byDay breakdown level
 * and is left unchanged for backwards compatibility with existing
 * consumers/tests. `byZoneCell` is a separate, additional breakdown (h3
 * resolution-7 cell x hour, `zone_dwell` only) layered on top, not folded
 * into that label. NOTE for a future municipality/B2B export: that export is
 * a distinct, not-yet-built endpoint that must apply its own fixed-dimension
 * aggregation rules (see docs/analytics-pivot.md) — `byZoneCell` here is the
 * internal/admin-token-gated view only, suppressed the same way as every
 * other breakdown, but not itself the public export shape. */
export type UsageStatsResponse = {
  generatedAt: string;
  aggregationLevel: 'spot-hour';
  totalEvents: number;
  totalsByType: UsageTypeTotals;
  bySpot: UsageSpotTotals[];
  byHour: UsageHourTotals[];
  byDay: UsageDayTotals[];
  byZoneCell: UsageZoneCellTotals[];
  distinctCounterKeys: number;
  suppression: UsageSuppressionInfo;
};
