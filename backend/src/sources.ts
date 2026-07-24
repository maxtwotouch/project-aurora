import type { HourlyForecast, KpTrend, Spot } from './types.js';

const MET_BASE_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const KP_NOW_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
const KP_FORECAST_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';
const MET_SUN_BASE_URL = 'https://api.met.no/weatherapi/sunrise/3.0/sun';

const FALLBACK_CLOUD_SEQUENCE = [72, 68, 63, 58, 55, 52, 50, 54, 59, 64, 69, 74];
const FALLBACK_CURRENT_KP = 2;
const FALLBACK_PEAK_KP = 5;
const OSLO_TIME_ZONE = 'Europe/Oslo';
const DEFAULT_SOURCE_TIMEOUT_MS = 10_000;

/** A fetch-compatible function; defaults to `globalThis.fetch` but can be
 * swapped out in tests without touching runtime call sites. */
export type FetchLike = typeof fetch;

/** A clock function returning epoch millis; defaults to `Date.now` but can be
 * swapped out in tests for deterministic time-dependent logic. */
export type Clock = () => number;

export function getSourceTimeoutMs(): number {
  const raw = Number(process.env.SOURCE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SOURCE_TIMEOUT_MS;
}

/** Wraps `fetchImpl` with an AbortController-based timeout so a hung upstream
 * can never hang a refresh cycle. */
export async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit = {},
  timeoutMs: number = getSourceTimeoutMs()
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function clampKp(value: number): number {
  return Math.max(0, Math.min(9, value));
}

// Deterministic layer split for the fallback forecast (no real per-layer
// data is available here). We deliberately attribute the ENTIRE aggregate
// to the LOW (fully-blocking) layer rather than guessing a plausible mixed
// split: when we don't know the real cloud composition, the resilience
// discipline this codebase follows (see CLAUDE.md, "keep external-source
// calls resilient") is degraded data -> conservative output, never an
// optimistic guess. A mixed low/medium/high split would make
// computeEffectiveCloudCover's recombined transmission *higher* than the
// aggregate alone (since medium/high block less than low per-percent),
// which would make a MET-unreachable ("we don't actually know tonight's
// sky") night score more optimistically than the same aggregate value did
// before layered clouds existed -- exactly backwards for a fallback path.
// With low=1.0 and medium=high=0, computeEffectiveCloudCover recombines to
// exactly `cloudCover` (transmission = 1 - 1.0*(cloudCover/100)), so
// fallback scoring is bit-identical to the pre-layered-clouds behavior.
// See docs/scoring-model.md ("Layered clouds").
const FALLBACK_CLOUD_LOW_SHARE = 1;
const FALLBACK_CLOUD_MEDIUM_SHARE = 0;
const FALLBACK_CLOUD_HIGH_SHARE = 0;

export function buildFallbackForecast(now: Clock = Date.now): HourlyForecast[] {
  const start = new Date(now());
  start.setMinutes(0, 0, 0);

  return FALLBACK_CLOUD_SEQUENCE.map((cloudCover, offset) => {
    const time = new Date(start);
    time.setHours(start.getHours() + offset);

    return {
      time: time.toISOString(),
      cloudCover,
      temperature: -4,
      windSpeed: 4,
      cloudCoverLow: Math.round(cloudCover * FALLBACK_CLOUD_LOW_SHARE),
      cloudCoverMedium: Math.round(cloudCover * FALLBACK_CLOUD_MEDIUM_SHARE),
      cloudCoverHigh: Math.round(cloudCover * FALLBACK_CLOUD_HIGH_SHARE)
    };
  });
}

export function buildHourlyKpTrend(current: number, peak: number, hours: number): number[] {
  if (hours <= 1) return [clampKp(current)];

  return Array.from({ length: hours }, (_, index) => {
    const t = index / (hours - 1);
    return Number((current + (peak - current) * t).toFixed(1));
  });
}

export function getOsloParts(input: Date | string): { dayKey: string; hour: number } | null {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);

  if (!year || !month || !day || !Number.isFinite(hour)) return null;

  return {
    dayKey: `${year}-${month}-${day}`,
    hour
  };
}

export function addDaysToDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getOsloDayKey(date = new Date()): string {
  const parts = getOsloParts(date);
  return parts?.dayKey ?? date.toISOString().slice(0, 10);
}

export function getOsloOffset(date = new Date()): string {
  const offsetToken = new Intl.DateTimeFormat('en-US', {
    timeZone: OSLO_TIME_ZONE,
    timeZoneName: 'shortOffset'
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')
    ?.value;

  const match = offsetToken?.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return '+00:00';
  }

  const sign = match[1][0];
  const absHours = match[1].slice(1).padStart(2, '0');
  const minutes = match[2] ?? '00';
  return `${sign}${absHours}:${minutes}`;
}

export function roundUpToHalfHour(date: Date): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();

  if (minutes === 0 || minutes === 30) {
    return rounded;
  }

  rounded.setMinutes(minutes < 30 ? 30 : 60);
  return rounded;
}

export function estimateSightingPossibleFrom(sunsetIso: string | null): string | null {
  if (!sunsetIso) {
    return null;
  }

  const sunset = new Date(sunsetIso);
  if (Number.isNaN(sunset.getTime())) {
    return null;
  }

  const estimate = new Date(sunset.getTime() + 75 * 60 * 1000);
  const rounded = roundUpToHalfHour(estimate);
  return rounded.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone: OSLO_TIME_ZONE
  });
}

/** Formats an ISO instant as an Oslo-local "HH:MM" (24h) clock time, or
 * `null` for an unparseable input. Shares `estimateSightingPossibleFrom`'s
 * `toLocaleTimeString` + `OSLO_TIME_ZONE` approach rather than adding a new
 * formatting strategy. */
export function formatOsloClockTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone: OSLO_TIME_ZONE
  });
}

/** Formats a best-window start/end pair as an Oslo-local "HH:MM–HH:MM"
 * range (used for the APNs `loc-args` alert text -- see fcm.ts's
 * buildApnsAlert), or `null` if either endpoint is unparseable. */
export function formatOsloTimeRange(startIso: string, endIso: string): string | null {
  const start = formatOsloClockTime(startIso);
  const end = formatOsloClockTime(endIso);
  if (!start || !end) return null;
  return `${start}–${end}`;
}

export function extractSunsetIso(payload: any): string | null {
  const candidates = [
    payload?.properties?.sunset?.time,
    payload?.properties?.sunset?.value,
    payload?.sunset?.time,
    payload?.sunset
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

export function parseKpEntry(entry: unknown): number | null {
  if (!entry || typeof entry !== 'object') return null;

  const candidateKeys = ['kp_index', 'kp', 'kP'] as const;
  for (const key of candidateKeys) {
    const value = Number((entry as Record<string, unknown>)[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

// Optional per-layer cloud field parsing (MET's cloud_area_fraction_low/
// _medium/_high) -- returns undefined (rather than throwing or defaulting to
// 0) when the field is absent/non-numeric, so callers can gracefully fall
// back to the aggregate cloud_area_fraction. See docs/scoring-model.md
// ("Layered clouds"). `null` is checked explicitly before the `Number(...)`
// coercion: `Number(null) === 0` is a finite number, so without this check
// an explicit `null` field would silently parse as "0% cloud in this
// layer" -- a treat-overcast-as-clear failure mode, and a contradiction of
// this function's own "absent/non-numeric -> undefined" contract.
export function parseCloudLayer(value: unknown): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function findLatestValidKp(payload: unknown[]): number | null {
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const parsed = parseKpEntry(payload[i]);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function parseForecastPeak(payload: unknown, current: number): number {
  if (!Array.isArray(payload) || payload.length < 2) {
    return Math.max(current, FALLBACK_PEAK_KP);
  }

  const rows = payload.slice(1).filter((row): row is unknown[] => Array.isArray(row));
  const values = rows
    .map((row) => Number(row[1]))
    .filter((value) => Number.isFinite(value))
    .slice(0, 16);

  if (values.length === 0) {
    return Math.max(current, FALLBACK_PEAK_KP);
  }

  return clampKp(Math.max(current, ...values));
}

export function parseTonightPeak(payload: unknown, current: number, nowDate: Date = new Date()): number {
  if (!Array.isArray(payload) || payload.length < 2) {
    return Math.max(current, FALLBACK_PEAK_KP);
  }

  const nowParts = getOsloParts(nowDate);
  if (!nowParts) {
    return Math.max(current, FALLBACK_PEAK_KP);
  }

  const tonightStartDay = nowParts.hour < 6 ? addDaysToDayKey(nowParts.dayKey, -1) : nowParts.dayKey;
  const tonightEndDay = addDaysToDayKey(tonightStartDay, 1);
  const rows = payload.slice(1).filter((row): row is unknown[] => Array.isArray(row));

  const values = rows
    .map((row) => {
      const parts = getOsloParts(String(row[0] ?? ''));
      const kpValue = Number(row[1]);
      if (!parts || !Number.isFinite(kpValue)) return null;

      const inTonightWindow =
        (parts.dayKey === tonightStartDay && parts.hour >= 18) ||
        (parts.dayKey === tonightEndDay && parts.hour <= 6);

      return inTonightWindow ? clampKp(kpValue) : null;
    })
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return Math.max(current, FALLBACK_PEAK_KP);
  }

  return clampKp(Math.max(current, ...values));
}

export function parseDailyOutlook(payload: unknown, nowDate: Date = new Date()): KpTrend['dailyOutlook'] {
  if (!Array.isArray(payload) || payload.length < 2) {
    return [
      { label: 'Today', peak: FALLBACK_PEAK_KP },
      { label: 'Tomorrow', peak: FALLBACK_PEAK_KP },
      { label: 'Day 3', peak: FALLBACK_PEAK_KP },
      { label: 'Day 4', peak: FALLBACK_PEAK_KP }
    ];
  }

  const todayParts = getOsloParts(nowDate);
  if (!todayParts) {
    return [
      { label: 'Today', peak: FALLBACK_PEAK_KP },
      { label: 'Tomorrow', peak: FALLBACK_PEAK_KP },
      { label: 'Day 3', peak: FALLBACK_PEAK_KP },
      { label: 'Day 4', peak: FALLBACK_PEAK_KP }
    ];
  }

  const rows = payload.slice(1).filter((row): row is unknown[] => Array.isArray(row));
  const dayMap = new Map<string, number[]>();

  for (const row of rows) {
    const rawTime = String(row[0] ?? '');
    const rawValue = Number(row[1]);
    if (!rawTime || !Number.isFinite(rawValue)) continue;

    const parts = getOsloParts(rawTime);
    if (!parts) continue;

    const key = parts.dayKey;
    const values = dayMap.get(key) ?? [];
    values.push(clampKp(rawValue));
    dayMap.set(key, values);
  }

  const labels = ['Today', 'Tomorrow', 'Day 3', 'Day 4'];
  const targetDays = Array.from({ length: 4 }, (_, index) => ({
    label: labels[index] ?? `Day ${index + 1}`,
    dayKey: addDaysToDayKey(todayParts.dayKey, index)
  }));

  return targetDays
    .map(({ label, dayKey }) => {
      const values = dayMap.get(dayKey);
      if (!values || values.length === 0) return null;

      return {
        label,
        peak: Math.max(...values)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

export async function fetchKpTrendWithQuality(
  fetchImpl: FetchLike = globalThis.fetch,
  now: Clock = Date.now
): Promise<{ kp: KpTrend; usingFallback: boolean }> {
  try {
    const [nowResponse, forecastResponse] = await Promise.allSettled([
      fetchWithTimeout(fetchImpl, KP_NOW_URL),
      fetchWithTimeout(fetchImpl, KP_FORECAST_URL)
    ]);

    if (nowResponse.status !== 'fulfilled' || !nowResponse.value.ok) {
      throw new Error('KP now API failed');
    }

    const nowPayload = await nowResponse.value.json();
    if (!Array.isArray(nowPayload) || nowPayload.length === 0) {
      throw new Error('Unexpected KP response format.');
    }

    const latest = findLatestValidKp(nowPayload);
    const current = clampKp(latest ?? FALLBACK_CURRENT_KP);
    let peak = Math.max(current, FALLBACK_PEAK_KP);
    const nowDate = new Date(now());

    if (forecastResponse.status === 'fulfilled' && forecastResponse.value.ok) {
      const forecastPayload = await forecastResponse.value.json();
      peak = parseForecastPeak(forecastPayload, current);
      return {
        kp: {
          current,
          peakNext12h: peak,
          tonightPeak: parseTonightPeak(forecastPayload, current, nowDate),
          hourly: buildHourlyKpTrend(current, peak, 12),
          dailyOutlook: parseDailyOutlook(forecastPayload, nowDate)
        },
        usingFallback: false
      };
    }

    return {
      kp: {
        current,
        peakNext12h: peak,
        tonightPeak: peak,
        hourly: buildHourlyKpTrend(current, peak, 12),
        dailyOutlook: [
          { label: 'Today', peak },
          { label: 'Tomorrow', peak },
          { label: 'Day 3', peak },
          { label: 'Day 4', peak }
        ]
      },
      usingFallback: false
    };
  } catch {
    return {
      kp: {
        current: FALLBACK_CURRENT_KP,
        peakNext12h: FALLBACK_PEAK_KP,
        tonightPeak: FALLBACK_PEAK_KP,
        hourly: buildHourlyKpTrend(FALLBACK_CURRENT_KP, FALLBACK_PEAK_KP, 12),
        dailyOutlook: [
          { label: 'Today', peak: FALLBACK_PEAK_KP },
          { label: 'Tomorrow', peak: FALLBACK_PEAK_KP },
          { label: 'Day 3', peak: FALLBACK_PEAK_KP },
          { label: 'Day 4', peak: FALLBACK_PEAK_KP }
        ]
      },
      usingFallback: true
    };
  }
}

export async function fetchSpotForecastWithQuality(
  spot: Spot,
  fetchImpl: FetchLike = globalThis.fetch,
  now: Clock = Date.now
): Promise<{ hourly: HourlyForecast[]; usingFallback: boolean }> {
  try {
    const response = await fetchWithTimeout(fetchImpl, `${MET_BASE_URL}?lat=${spot.lat}&lon=${spot.lon}`, {
      headers: {
        'User-Agent': 'aurora-backend/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`MET forecast failed for ${spot.name} (${response.status})`);
    }

    const payload = await response.json();
    const timeseries = payload?.properties?.timeseries;
    if (!Array.isArray(timeseries)) {
      throw new Error('Unexpected MET response format.');
    }

    const hourly: HourlyForecast[] = timeseries.slice(0, 12).map((entry: any) => {
      const details = entry?.data?.instant?.details ?? {};
      return {
        time: entry.time,
        cloudCover: Number(details.cloud_area_fraction ?? 100),
        temperature: Number(details.air_temperature ?? 0),
        windSpeed: Number(details.wind_speed ?? 0),
        cloudCoverLow: parseCloudLayer(details.cloud_area_fraction_low),
        cloudCoverMedium: parseCloudLayer(details.cloud_area_fraction_medium),
        cloudCoverHigh: parseCloudLayer(details.cloud_area_fraction_high)
      };
    });

    return { hourly, usingFallback: false };
  } catch {
    return { hourly: buildFallbackForecast(now), usingFallback: true };
  }
}

export async function fetchPointForecastWithQuality(
  lat: number,
  lon: number,
  hours = 48,
  fetchImpl: FetchLike = globalThis.fetch,
  now: Clock = Date.now
): Promise<{ hourly: HourlyForecast[]; usingFallback: boolean }> {
  try {
    const response = await fetchWithTimeout(fetchImpl, `${MET_BASE_URL}?lat=${lat}&lon=${lon}`, {
      headers: {
        'User-Agent': 'aurora-backend/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`MET forecast failed for point (${response.status})`);
    }

    const payload = await response.json();
    const timeseries = payload?.properties?.timeseries;
    if (!Array.isArray(timeseries)) {
      throw new Error('Unexpected MET response format.');
    }

    const hourly: HourlyForecast[] = timeseries.slice(0, hours).map((entry: any) => {
      const details = entry?.data?.instant?.details ?? {};
      return {
        time: entry.time,
        cloudCover: Number(details.cloud_area_fraction ?? 100),
        temperature: Number(details.air_temperature ?? 0),
        windSpeed: Number(details.wind_speed ?? 0),
        cloudCoverLow: parseCloudLayer(details.cloud_area_fraction_low),
        cloudCoverMedium: parseCloudLayer(details.cloud_area_fraction_medium),
        cloudCoverHigh: parseCloudLayer(details.cloud_area_fraction_high)
      };
    });

    return { hourly, usingFallback: false };
  } catch {
    return { hourly: buildFallbackForecast(now), usingFallback: true };
  }
}

export async function fetchSightingPossibleFromWithQuality(
  lat: number,
  lon: number,
  fetchImpl: FetchLike = globalThis.fetch,
  now: Clock = Date.now
): Promise<{ sightingPossibleFrom: string | null; usingFallback: boolean }> {
  const nowDate = new Date(now());
  const dayKey = getOsloDayKey(nowDate);
  const offset = getOsloOffset(nowDate);

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      `${MET_SUN_BASE_URL}?lat=${lat}&lon=${lon}&date=${dayKey}&offset=${encodeURIComponent(offset)}`,
      {
        headers: {
          'User-Agent': 'aurora-backend/1.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`MET sunrise failed (${response.status})`);
    }

    const payload = await response.json();
    return {
      sightingPossibleFrom: estimateSightingPossibleFrom(extractSunsetIso(payload)),
      usingFallback: false
    };
  } catch {
    return {
      sightingPossibleFrom: null,
      usingFallback: true
    };
  }
}
