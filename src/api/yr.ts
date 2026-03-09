import type { HourlyForecast, Spot } from '../types';

const MET_BASE_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const MET_SUN_BASE_URL = 'https://api.met.no/weatherapi/sunrise/3.0/sun';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CLOUD_SEQUENCE = [72, 68, 63, 58, 55, 52, 50, 54, 59, 64, 69, 74];
const OSLO_TIME_ZONE = 'Europe/Oslo';

type CacheEntry = {
  timestamp: number;
  data: HourlyForecast[];
};

const forecastCache = new Map<string, CacheEntry>();
const daylightHintCache = new Map<string, { timestamp: number; data: string | null }>();

const getSpotKey = (spot: Spot) => `${spot.lat.toFixed(4)},${spot.lon.toFixed(4)}`;
const getPointKey = (lat: number, lon: number, hours: number) => `${lat.toFixed(4)},${lon.toFixed(4)},${hours}`;
const getDaylightKey = (lat: number, lon: number, dayKey: string) => `${lat.toFixed(4)},${lon.toFixed(4)},${dayKey}`;

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

function getOsloDayKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : date.toISOString().slice(0, 10);
}

function getOsloOffset(date = new Date()): string {
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

function roundUpToHalfHour(date: Date): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();

  if (minutes === 0 || minutes === 30) {
    return rounded;
  }

  rounded.setMinutes(minutes < 30 ? 30 : 60);
  return rounded;
}

function estimateSightingPossibleFrom(sunsetIso: string | null): string | null {
  if (!sunsetIso) {
    return null;
  }

  const sunset = new Date(sunsetIso);
  if (Number.isNaN(sunset.getTime())) {
    return null;
  }

  const estimate = new Date(sunset.getTime() + 75 * 60 * 1000);
  const rounded = roundUpToHalfHour(estimate);

  return rounded.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
    timeZone: OSLO_TIME_ZONE
  });
}

function extractSunsetIso(payload: any): string | null {
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

export async function fetchSpotForecast(spot: Spot): Promise<HourlyForecast[]> {
  const key = getSpotKey(spot);
  const cached = forecastCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${MET_BASE_URL}?lat=${spot.lat}&lon=${spot.lon}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'tromso-northern-lights-mvp/1.0'
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

    forecastCache.set(key, {
      timestamp: Date.now(),
      data: hourly
    });

    return hourly;
  } catch {
    const fallback = buildFallbackForecast();
    forecastCache.set(key, {
      timestamp: Date.now(),
      data: fallback
    });

    return fallback;
  }
}

export async function fetchPointForecast(lat: number, lon: number, hours = 48): Promise<HourlyForecast[]> {
  const key = getPointKey(lat, lon, hours);
  const cached = forecastCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${MET_BASE_URL}?lat=${lat}&lon=${lon}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'tromso-northern-lights-mvp/1.0'
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

    forecastCache.set(key, {
      timestamp: Date.now(),
      data: hourly
    });

    return hourly;
  } catch {
    const fallback = buildFallbackForecast();
    forecastCache.set(key, {
      timestamp: Date.now(),
      data: fallback
    });

    return fallback;
  }
}

export async function fetchSightingPossibleFrom(lat: number, lon: number): Promise<string | null> {
  const dayKey = getOsloDayKey();
  const cacheKey = getDaylightKey(lat, lon, dayKey);
  const cached = daylightHintCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${MET_SUN_BASE_URL}?lat=${lat}&lon=${lon}&date=${dayKey}&offset=${encodeURIComponent(getOsloOffset())}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'tromso-northern-lights-mvp/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`MET sunrise failed (${response.status})`);
    }

    const payload = await response.json();
    const data = estimateSightingPossibleFrom(extractSunsetIso(payload));

    daylightHintCache.set(cacheKey, {
      timestamp: Date.now(),
      data
    });

    return data;
  } catch {
    daylightHintCache.set(cacheKey, {
      timestamp: Date.now(),
      data: null
    });

    return null;
  }
}

export function clearForecastCache() {
  forecastCache.clear();
  daylightHintCache.clear();
}
