import type { HourlyForecast, KpTrend, Spot } from './types.js';

const MET_BASE_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const KP_NOW_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
const KP_FORECAST_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';

const FALLBACK_CLOUD_SEQUENCE = [72, 68, 63, 58, 55, 52, 50, 54, 59, 64, 69, 74];
const FALLBACK_CURRENT_KP = 2;
const FALLBACK_PEAK_KP = 5;

function clampKp(value: number): number {
  return Math.max(0, Math.min(9, value));
}

function buildFallbackForecast(): HourlyForecast[] {
  const start = new Date();
  start.setMinutes(0, 0, 0);

  return FALLBACK_CLOUD_SEQUENCE.map((cloudCover, offset) => {
    const time = new Date(start);
    time.setHours(start.getHours() + offset);

    return {
      time: time.toISOString(),
      cloudCover,
      temperature: -4,
      windSpeed: 4
    };
  });
}

function buildHourlyKpTrend(current: number, peak: number, hours: number): number[] {
  if (hours <= 1) return [clampKp(current)];

  return Array.from({ length: hours }, (_, index) => {
    const t = index / (hours - 1);
    return Number((current + (peak - current) * t).toFixed(1));
  });
}

function parseKpEntry(entry: unknown): number | null {
  if (!entry || typeof entry !== 'object') return null;

  const candidateKeys = ['kp_index', 'kp', 'kP'] as const;
  for (const key of candidateKeys) {
    const value = Number((entry as Record<string, unknown>)[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function findLatestValidKp(payload: unknown[]): number | null {
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const parsed = parseKpEntry(payload[i]);
    if (parsed !== null) return parsed;
  }
  return null;
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

function parseDailyOutlook(payload: unknown): KpTrend['dailyOutlook'] {
  if (!Array.isArray(payload) || payload.length < 2) {
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

    const date = new Date(rawTime);
    if (Number.isNaN(date.getTime())) continue;

    const key = date.toISOString().slice(0, 10);
    const values = dayMap.get(key) ?? [];
    values.push(clampKp(rawValue));
    dayMap.set(key, values);
  }

  const labels = ['Today', 'Tomorrow', 'Day 3', 'Day 4'];
  return Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([_, values], index) => ({
      label: labels[index] ?? `Day ${index + 1}`,
      peak: Math.max(...values)
    }));
}

export async function fetchKpTrendWithQuality(): Promise<{ kp: KpTrend; usingFallback: boolean }> {
  try {
    const [nowResponse, forecastResponse] = await Promise.allSettled([fetch(KP_NOW_URL), fetch(KP_FORECAST_URL)]);

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

    if (forecastResponse.status === 'fulfilled' && forecastResponse.value.ok) {
      const forecastPayload = await forecastResponse.value.json();
      peak = parseForecastPeak(forecastPayload, current);
      return {
        kp: {
          current,
          peakNext12h: peak,
          hourly: buildHourlyKpTrend(current, peak, 12),
          dailyOutlook: parseDailyOutlook(forecastPayload)
        },
        usingFallback: false
      };
    }

    return {
      kp: {
        current,
        peakNext12h: peak,
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

export async function fetchSpotForecastWithQuality(spot: Spot): Promise<{ hourly: HourlyForecast[]; usingFallback: boolean }> {
  try {
    const response = await fetch(`${MET_BASE_URL}?lat=${spot.lat}&lon=${spot.lon}`, {
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

    const hourly: HourlyForecast[] = timeseries.slice(0, 12).map((entry: any) => ({
      time: entry.time,
      cloudCover: Number(entry?.data?.instant?.details?.cloud_area_fraction ?? 100),
      temperature: Number(entry?.data?.instant?.details?.air_temperature ?? 0),
      windSpeed: Number(entry?.data?.instant?.details?.wind_speed ?? 0)
    }));

    return { hourly, usingFallback: false };
  } catch {
    return { hourly: buildFallbackForecast(), usingFallback: true };
  }
}

export async function fetchPointForecastWithQuality(
  lat: number,
  lon: number,
  hours = 48
): Promise<{ hourly: HourlyForecast[]; usingFallback: boolean }> {
  try {
    const response = await fetch(`${MET_BASE_URL}?lat=${lat}&lon=${lon}`, {
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

    const hourly: HourlyForecast[] = timeseries.slice(0, hours).map((entry: any) => ({
      time: entry.time,
      cloudCover: Number(entry?.data?.instant?.details?.cloud_area_fraction ?? 100),
      temperature: Number(entry?.data?.instant?.details?.air_temperature ?? 0),
      windSpeed: Number(entry?.data?.instant?.details?.wind_speed ?? 0)
    }));

    return { hourly, usingFallback: false };
  } catch {
    return { hourly: buildFallbackForecast(), usingFallback: true };
  }
}
