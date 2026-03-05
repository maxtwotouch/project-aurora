import type { AuroraPoint } from '../types';

const AURORA_OVAL_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';
const CACHE_TTL_MS = 10 * 60 * 1000;

type AuroraCache = {
  timestamp: number;
  points: AuroraPoint[];
};

let auroraCache: AuroraCache | null = null;

function normalizeLon(lon: number) {
  return lon > 180 ? lon - 360 : lon;
}

function parsePoint(entry: unknown): AuroraPoint | null {
  if (!Array.isArray(entry) || entry.length < 3) {
    return null;
  }

  const lat = Number(entry[0]);
  const lon = normalizeLon(Number(entry[1]));
  const probability = Number(entry[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(probability)) {
    return null;
  }

  return {
    lat,
    lon,
    probability
  };
}

function fallbackOval(): AuroraPoint[] {
  // Simple fallback ring around typical auroral latitude when feed is unavailable.
  const points: AuroraPoint[] = [];
  const centerLat = 68;
  const baseBand = 6;

  for (let lon = -20; lon <= 45; lon += 5) {
    const wave = Math.sin((lon / 180) * Math.PI) * 2;
    points.push({ lat: centerLat + baseBand + wave, lon, probability: 40 });
    points.push({ lat: centerLat - baseBand + wave, lon, probability: 30 });
  }

  return points;
}

export async function fetchAuroraOval(): Promise<AuroraPoint[]> {
  if (auroraCache && Date.now() - auroraCache.timestamp < CACHE_TTL_MS) {
    return auroraCache.points;
  }

  try {
    const response = await fetch(AURORA_OVAL_URL);
    if (!response.ok) {
      throw new Error(`Aurora oval API failed (${response.status})`);
    }

    const payload = await response.json();
    const raw = Array.isArray(payload?.coordinates)
      ? payload.coordinates
      : Array.isArray(payload?.data)
      ? payload.data
      : [];

    const points = raw
      .map(parsePoint)
      .filter((point: AuroraPoint | null): point is AuroraPoint => point !== null)
      .filter((point: AuroraPoint) => point.probability >= 20)
      .filter((point: AuroraPoint) => point.lat >= 52 && point.lat <= 82)
      .filter((point: AuroraPoint) => point.lon >= -30 && point.lon <= 60);

    const value = points.length > 0 ? points : fallbackOval();

    auroraCache = {
      timestamp: Date.now(),
      points: value
    };

    return value;
  } catch {
    const points = fallbackOval();
    auroraCache = {
      timestamp: Date.now(),
      points
    };
    return points;
  }
}
