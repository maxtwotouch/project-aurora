import type { KpTrend } from '../types';

const KP_NOW_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
const KP_FORECAST_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CURRENT_KP = 2;
const FALLBACK_PEAK_KP = 5;

let kpCache: { timestamp: number; value: KpTrend } | null = null;

function parseKpEntry(entry: unknown): number | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidateKeys = ['kp_index', 'kp', 'kP'] as const;

  for (const key of candidateKeys) {
    const value = Number((entry as Record<string, unknown>)[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function findLatestValidKp(payload: unknown[]): number | null {
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const parsed = parseKpEntry(payload[i]);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function findRecentKpValues(payload: unknown[], limit = 30): number[] {
  const values: number[] = [];

  for (let i = payload.length - 1; i >= 0 && values.length < limit; i -= 1) {
    const parsed = parseKpEntry(payload[i]);
    if (parsed !== null) {
      values.push(clampKp(parsed));
    }
  }

  return values;
}

function clampKp(value: number): number {
  return Math.max(0, Math.min(9, value));
}

function buildHourlyKpTrend(current: number, peak: number, hours: number): number[] {
  if (hours <= 1) {
    return [clampKp(current)];
  }

  return Array.from({ length: hours }, (_, index) => {
    const t = index / (hours - 1);
    return Number((current + (peak - current) * t).toFixed(1));
  });
}

function parseForecastPeak(payload: unknown, current: number): number {
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

function selectCurrentKp(nowPayload: unknown[]): number {
  const latest = findLatestValidKp(nowPayload);
  if (latest === null) {
    return FALLBACK_CURRENT_KP;
  }

  const latestKp = clampKp(latest);
  if (latestKp > 0) {
    return latestKp;
  }

  // NOAA can occasionally end with a transient 0.0 entry; use recent non-zero value if present.
  const recentValues = findRecentKpValues(nowPayload, 12);
  const recentNonZero = recentValues.find((value) => value > 0);
  return recentNonZero ?? latestKp;
}

export async function fetchKpTrend(): Promise<KpTrend> {
  if (kpCache && Date.now() - kpCache.timestamp < CACHE_TTL_MS) {
    return kpCache.value;
  }

  try {
    const [nowResponse, forecastResponse] = await Promise.allSettled([
      fetch(KP_NOW_URL),
      fetch(KP_FORECAST_URL)
    ]);

    if (nowResponse.status !== 'fulfilled' || !nowResponse.value.ok) {
      throw new Error('KP now API failed');
    }

    const nowPayload = await nowResponse.value.json();
    if (!Array.isArray(nowPayload) || nowPayload.length === 0) {
      throw new Error('Unexpected KP response format.');
    }

    const current = selectCurrentKp(nowPayload);
    let peak = Math.max(current, FALLBACK_PEAK_KP);

    if (forecastResponse.status === 'fulfilled' && forecastResponse.value.ok) {
      const forecastPayload = await forecastResponse.value.json();
      peak = parseForecastPeak(forecastPayload, current);
    }

    const value: KpTrend = {
      current,
      peakNext12h: peak,
      hourly: buildHourlyKpTrend(current, peak, 12)
    };

    kpCache = {
      timestamp: Date.now(),
      value
    };

    return value;
  } catch {
    const value: KpTrend = {
      current: FALLBACK_CURRENT_KP,
      peakNext12h: FALLBACK_PEAK_KP,
      hourly: buildHourlyKpTrend(FALLBACK_CURRENT_KP, FALLBACK_PEAK_KP, 12)
    };

    kpCache = {
      timestamp: Date.now(),
      value
    };

    return value;
  }
}

export async function fetchKpIndex(): Promise<number> {
  const trend = await fetchKpTrend();
  return trend.current;
}

export function clearKpCache() {
  kpCache = null;
}
