import type { HourlyForecast, Spot } from '../types';

const MET_BASE_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_CLOUD_SEQUENCE = [72, 68, 63, 58, 55, 52, 50, 54, 59, 64, 69, 74];

type CacheEntry = {
  timestamp: number;
  data: HourlyForecast[];
};

const forecastCache = new Map<string, CacheEntry>();

const getSpotKey = (spot: Spot) => `${spot.lat.toFixed(4)},${spot.lon.toFixed(4)}`;

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

export function clearForecastCache() {
  forecastCache.clear();
}
