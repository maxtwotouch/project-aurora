import type { KpTrend } from '../types';

const KP_NOW_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
const KP_FORECAST_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CURRENT_KP = 2;
const FALLBACK_PEAK_KP = 5;
const OSLO_TIME_ZONE = 'Europe/Oslo';

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

function getOsloParts(input: Date | string): { dayKey: string; hour: number } | null {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

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

  if (!year || !month || !day || !Number.isFinite(hour)) {
    return null;
  }

  return {
    dayKey: `${year}-${month}-${day}`,
    hour
  };
}

function addDaysToDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

function parseTonightPeak(payload: unknown, current: number): number {
  if (!Array.isArray(payload) || payload.length < 2) {
    return Math.max(current, FALLBACK_PEAK_KP);
  }

  const nowParts = getOsloParts(new Date());
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
      if (!parts || !Number.isFinite(kpValue)) {
        return null;
      }

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

function parseDailyOutlook(payload: unknown): KpTrend['dailyOutlook'] {
  if (!Array.isArray(payload) || payload.length < 2) {
    return [
      { label: 'Today', peak: FALLBACK_PEAK_KP },
      { label: 'Tomorrow', peak: FALLBACK_PEAK_KP },
      { label: 'Day 3', peak: FALLBACK_PEAK_KP }
    ];
  }

  const todayParts = getOsloParts(new Date());
  if (!todayParts) {
    return [
      { label: 'Today', peak: FALLBACK_PEAK_KP },
      { label: 'Tomorrow', peak: FALLBACK_PEAK_KP },
      { label: 'Day 3', peak: FALLBACK_PEAK_KP }
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

  const targetDays = [
    { label: 'Today', dayKey: todayParts.dayKey },
    { label: 'Tomorrow', dayKey: addDaysToDayKey(todayParts.dayKey, 1) },
    { label: 'Day 3', dayKey: addDaysToDayKey(todayParts.dayKey, 2) }
  ];

  const entries = targetDays
    .map(({ label, dayKey }) => {
      const values = dayMap.get(dayKey);
      if (!values || values.length === 0) {
        return null;
      }

      return {
        label,
        peak: Math.max(...values)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return entries.length > 0 ? entries : [
    { label: 'Today', peak: FALLBACK_PEAK_KP },
    { label: 'Tomorrow', peak: FALLBACK_PEAK_KP },
    { label: 'Day 3', peak: FALLBACK_PEAK_KP }
  ];
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
      const tonightPeak = parseTonightPeak(forecastPayload, current);
      const dailyOutlook = parseDailyOutlook(forecastPayload);

      const value: KpTrend = {
        current,
        peakNext12h: peak,
        tonightPeak,
        hourly: buildHourlyKpTrend(current, peak, 12),
        dailyOutlook
      };

      kpCache = {
        timestamp: Date.now(),
        value
      };

      return value;
    }

    const value: KpTrend = {
      current,
      peakNext12h: peak,
      tonightPeak: peak,
      hourly: buildHourlyKpTrend(current, peak, 12),
      dailyOutlook: [
        { label: 'Today', peak },
        { label: 'Tomorrow', peak },
        { label: 'Day 3', peak }
      ]
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
      tonightPeak: FALLBACK_PEAK_KP,
      hourly: buildHourlyKpTrend(FALLBACK_CURRENT_KP, FALLBACK_PEAK_KP, 12),
      dailyOutlook: [
        { label: 'Today', peak: FALLBACK_PEAK_KP },
        { label: 'Tomorrow', peak: FALLBACK_PEAK_KP },
        { label: 'Day 3', peak: FALLBACK_PEAK_KP }
      ]
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
