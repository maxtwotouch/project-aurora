import { deriveNowcastLevel } from '../scoring/nowcast';
import type { NowcastSourceId, NowcastSummary } from '../types';

// -----------------------------------------------------------------------------
// Frontend, direct-mode twin of backend/src/nowcast.ts's solar-wind + OVATION
// fetchers. Used ONLY when EXPO_PUBLIC_USE_BACKEND is false (see
// src/hooks/useForecast.ts) -- when the backend is reachable, the app reads
// `TonightSnapshot.nowcast` straight from `GET /v1/tonight` instead and never
// calls this module. Same endpoints, same null-guard `parseFiniteNumber`
// contract, same 30-minute staleness gate, same Tromso window as the backend
// -- see docs/nowcast.md for the full physics/parsing rationale (not
// re-derived here). `deriveNowcastLevel` itself lives in the separate,
// Node-free src/scoring/nowcast.ts twin (see that file's header).
// -----------------------------------------------------------------------------

const SOLAR_WIND_MAG_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json';
const SOLAR_WIND_PLASMA_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json';
const OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';

// Approximate Sun-Earth L1 distance (km) -- see backend/src/nowcast.ts's
// identical constant/comment for the "why a single representative value" caveat.
const L1_DISTANCE_KM = 1_500_000;

// Tromso center coordinates -- matches src/hooks/useForecast.ts's TROMSO_CENTER
// (kept as an independent literal here, same as backend/src/nowcast.ts does
// relative to snapshot.ts's TROMSO_CENTER, to avoid an import cycle/coupling).
const TROMSO_LAT = 69.6;
const TROMSO_LON = 18.9;

// OVATION's `coordinates` grid: longitude 0..359 (degrees EAST, not
// -180..180), latitude -90..90, 1-degree grid step -- see
// backend/src/nowcast.ts's identical constants for the verified-against-a-live-payload note.
const OVATION_LON_WINDOW_DEG = 2;
const OVATION_LAT_WINDOW_DEG = 2;

// Rows older than this (relative to fetch time) are treated as "no reading"
// rather than surfaced as a stale "right now" value -- see
// backend/src/nowcast.ts's RTSW_MAX_ROW_AGE_MS for the full rationale.
const RTSW_MAX_ROW_AGE_MS = 30 * 60 * 1000;

type RtswMagEntry = {
  time_tag?: unknown;
  active?: unknown;
  bz_gsm?: unknown;
};

type RtswPlasmaEntry = {
  time_tag?: unknown;
  active?: unknown;
  proton_speed?: unknown;
  proton_density?: unknown;
};

function parseTimeTagMs(value: unknown): number {
  if (typeof value !== 'string' || value.length === 0) return NaN;
  // NOAA's rtsw time_tag values ("2026-07-27T08:27:00") have no trailing
  // offset -- they are UTC but unmarked. Without appending "Z", most JS
  // engines parse a bare "YYYY-MM-DDTHH:MM:SS" as *local* time, which would
  // silently skew "latest" comparisons by the runtime's UTC offset.
  const normalized = value.endsWith('Z') ? value : `${value}Z`;
  return Date.parse(normalized);
}

/**
 * Same contract as backend/src/nowcast.ts's `parseFiniteNumber` (and
 * src/api/yr.ts's `parseCloudLayer`): `null` -> `undefined` explicitly
 * (before the `Number(...)` coercion, since `Number(null) === 0` would
 * otherwise silently treat an explicit "no reading" as a genuine 0), and any
 * other non-finite result (`NaN`/`Infinity`) also -> `undefined`.
 */
function parseFiniteNumber(value: unknown): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Picks the newest entry (by parsed `time_tag`, not array position) that
 * satisfies `isComplete`, preferring `active: true` rows but falling back to
 * any complete row if none is active. `nowMs`, when provided, additionally
 * rejects candidates older than `RTSW_MAX_ROW_AGE_MS` before the
 * active/inactive preference is applied. Mirrors backend/src/nowcast.ts's
 * `pickLatestComplete` exactly.
 */
function pickLatestComplete<T extends { time_tag?: unknown; active?: unknown }>(
  payload: unknown,
  isComplete: (entry: T) => boolean,
  nowMs?: number
): T | null {
  if (!Array.isArray(payload)) return null;

  let candidates = payload.filter(
    (entry): entry is T => !!entry && typeof entry === 'object' && isComplete(entry as T)
  );

  if (nowMs !== undefined) {
    candidates = candidates.filter((entry) => {
      const ms = parseTimeTagMs(entry.time_tag);
      return Number.isFinite(ms) && nowMs - ms <= RTSW_MAX_ROW_AGE_MS;
    });
  }

  if (candidates.length === 0) return null;

  const active = candidates.filter((entry) => (entry as { active?: unknown }).active === true);
  const pool = active.length > 0 ? active : candidates;

  return pool.reduce((latest, candidate) => {
    const latestMs = parseTimeTagMs(latest.time_tag);
    const candidateMs = parseTimeTagMs(candidate.time_tag);
    if (Number.isNaN(latestMs)) return candidate;
    if (Number.isNaN(candidateMs)) return latest;
    return candidateMs > latestMs ? candidate : latest;
  });
}

function selectMagEntry(payload: unknown, nowMs?: number): RtswMagEntry | null {
  return pickLatestComplete<RtswMagEntry>(
    payload,
    (candidate) => parseFiniteNumber(candidate.bz_gsm) !== undefined,
    nowMs
  );
}

function selectPlasmaEntry(payload: unknown, nowMs?: number): RtswPlasmaEntry | null {
  return pickLatestComplete<RtswPlasmaEntry>(
    payload,
    (candidate) =>
      parseFiniteNumber(candidate.proton_speed) !== undefined && parseFiniteNumber(candidate.proton_density) !== undefined,
    nowMs
  );
}

function extractLatestBz(payload: unknown, nowMs?: number): number | null {
  const entry = selectMagEntry(payload, nowMs);
  if (!entry) return null;
  return parseFiniteNumber(entry.bz_gsm) ?? null;
}

function extractLatestBzTimestamp(payload: unknown, nowMs?: number): string | null {
  const entry = selectMagEntry(payload, nowMs);
  return entry && typeof entry.time_tag === 'string' ? entry.time_tag : null;
}

function extractLatestPlasma(payload: unknown, nowMs?: number): { speed: number | null; density: number | null } {
  const entry = selectPlasmaEntry(payload, nowMs);
  if (!entry) return { speed: null, density: null };

  return {
    speed: parseFiniteNumber(entry.proton_speed) ?? null,
    density: parseFiniteNumber(entry.proton_density) ?? null
  };
}

function extractLatestPlasmaTimestamp(payload: unknown, nowMs?: number): string | null {
  const entry = selectPlasmaEntry(payload, nowMs);
  return entry && typeof entry.time_tag === 'string' ? entry.time_tag : null;
}

/**
 * Approximate minutes between "this solar wind parcel is measured at L1" and
 * "it reaches Earth's magnetosphere" -- see backend/src/nowcast.ts's
 * `computeLeadTimeMinutes` for the full ballpark-not-guarantee caveat.
 */
function computeLeadTimeMinutes(solarWindSpeedKmPerSec: number | null): number | null {
  if (
    typeof solarWindSpeedKmPerSec !== 'number' ||
    !Number.isFinite(solarWindSpeedKmPerSec) ||
    solarWindSpeedKmPerSec <= 0
  ) {
    return null;
  }
  const seconds = L1_DISTANCE_KM / solarWindSpeedKmPerSec;
  return Math.round(seconds / 60);
}

type SolarWindReading = {
  bz: number | null;
  solarWindSpeed: number | null;
  solarWindDensity: number | null;
  leadTimeMinutes: number | null;
  bzReadingAt: string | null;
  plasmaReadingAt: string | null;
};

/**
 * Fetches IMF Bz (mag) and speed/density (plasma) independently -- a
 * failure in one never blocks the other, mirroring backend/src/nowcast.ts's
 * `fetchSolarWindWithQuality`. Rows older than `RTSW_MAX_ROW_AGE_MS` are
 * rejected before selection.
 */
async function fetchSolarWindReading(nowMs: number): Promise<SolarWindReading> {
  const [magResult, plasmaResult] = await Promise.allSettled([fetch(SOLAR_WIND_MAG_URL), fetch(SOLAR_WIND_PLASMA_URL)]);

  let bz: number | null = null;
  let bzReadingAt: string | null = null;
  if (magResult.status === 'fulfilled' && magResult.value.ok) {
    try {
      const payload = await magResult.value.json();
      bz = extractLatestBz(payload, nowMs);
      bzReadingAt = extractLatestBzTimestamp(payload, nowMs);
    } catch {
      bz = null;
      bzReadingAt = null;
    }
  }

  let solarWindSpeed: number | null = null;
  let solarWindDensity: number | null = null;
  let plasmaReadingAt: string | null = null;
  if (plasmaResult.status === 'fulfilled' && plasmaResult.value.ok) {
    try {
      const payload = await plasmaResult.value.json();
      const latest = extractLatestPlasma(payload, nowMs);
      solarWindSpeed = latest.speed;
      solarWindDensity = latest.density;
      plasmaReadingAt = extractLatestPlasmaTimestamp(payload, nowMs);
    } catch {
      solarWindSpeed = null;
      solarWindDensity = null;
      plasmaReadingAt = null;
    }
  }

  return {
    bz,
    solarWindSpeed,
    solarWindDensity,
    leadTimeMinutes: computeLeadTimeMinutes(solarWindSpeed),
    bzReadingAt,
    plasmaReadingAt
  };
}

/**
 * Max OVATION aurora probability/flux value in a small neighbourhood around
 * Tromso (a window, not just the single nearest cell, so a 1-degree
 * grid-alignment mismatch can't silently miss the local peak) -- mirrors
 * backend/src/nowcast.ts's `extractOvationProbability` exactly, including
 * its no-0/359-wraparound caveat (irrelevant for Tromso's ~18.9E).
 */
function extractOvationProbability(payload: unknown, lat: number = TROMSO_LAT, lon: number = TROMSO_LON): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const coordinates = (payload as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates)) return null;

  let max: number | null = null;
  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 3) continue;
    const [gridLon, gridLat, value] = coordinate;
    if (
      typeof gridLon !== 'number' ||
      typeof gridLat !== 'number' ||
      typeof value !== 'number' ||
      !Number.isFinite(value)
    ) {
      continue;
    }

    if (Math.abs(gridLon - lon) <= OVATION_LON_WINDOW_DEG && Math.abs(gridLat - lat) <= OVATION_LAT_WINDOW_DEG) {
      if (max === null || value > max) max = value;
    }
  }

  return max;
}

function extractOvationForecastTime(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)['Forecast Time'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

type OvationReading = {
  ovationProbability: number | null;
  ovationForecastTime: string | null;
};

async function fetchOvationReading(): Promise<OvationReading> {
  try {
    const response = await fetch(OVATION_URL);
    if (!response.ok) {
      throw new Error(`OVATION fetch failed (${response.status})`);
    }

    const payload = await response.json();
    return {
      ovationProbability: extractOvationProbability(payload),
      ovationForecastTime: extractOvationForecastTime(payload)
    };
  } catch {
    return { ovationProbability: null, ovationForecastTime: null };
  }
}

/**
 * Direct-mode assembly of `NowcastSummary`, the frontend twin of
 * backend/src/nowcast.ts's `fetchNowcastSummary`. Never throws. Resolves to
 * `undefined` only when every source came back empty (total nowcast
 * failure) -- exactly mirroring the backend's "absent, not a broken zero"
 * contract for `TonightSnapshot.nowcast` / `AppDataQuality.usingFallbackNowcast`.
 *
 * TGO ground-magnetometer support is intentionally NOT reimplemented here:
 * backend/src/nowcast.ts's own TGO fetcher is a deliberate stub (always
 * `null`, pending owner sign-off on TGO's data-use terms -- see
 * docs/nowcast.md), so there is nothing this direct-mode path would gain by
 * duplicating a stub. `tgoDisturbanceNt` is always `null` here too, and
 * `'tgo_magnetometer'` never appears in `sourcesAvailable`.
 */
export async function fetchNowcastSummary(now: () => number = Date.now): Promise<NowcastSummary | undefined> {
  const nowMs = now();

  const [solarWindResult, ovationResult] = await Promise.allSettled([
    fetchSolarWindReading(nowMs),
    fetchOvationReading()
  ]);

  const solarWind: SolarWindReading =
    solarWindResult.status === 'fulfilled'
      ? solarWindResult.value
      : {
          bz: null,
          solarWindSpeed: null,
          solarWindDensity: null,
          leadTimeMinutes: null,
          bzReadingAt: null,
          plasmaReadingAt: null
        };

  const ovation: OvationReading =
    ovationResult.status === 'fulfilled' ? ovationResult.value : { ovationProbability: null, ovationForecastTime: null };

  const sourcesAvailable: NowcastSourceId[] = [];
  if (solarWind.bz !== null || solarWind.solarWindSpeed !== null || solarWind.solarWindDensity !== null) {
    sourcesAvailable.push('solar_wind');
  }
  if (ovation.ovationProbability !== null) {
    sourcesAvailable.push('ovation');
  }

  if (sourcesAvailable.length === 0) {
    return undefined;
  }

  return {
    updatedAt: new Date(nowMs).toISOString(),
    level: deriveNowcastLevel({ bz: solarWind.bz, ovationProbability: ovation.ovationProbability }),
    bz: solarWind.bz,
    solarWindSpeed: solarWind.solarWindSpeed,
    solarWindDensity: solarWind.solarWindDensity,
    leadTimeMinutes: solarWind.leadTimeMinutes,
    ovationProbability: ovation.ovationProbability,
    ovationForecastTime: ovation.ovationForecastTime,
    tgoDisturbanceNt: null,
    sourcesAvailable,
    bzReadingAt: solarWind.bzReadingAt,
    plasmaReadingAt: solarWind.plasmaReadingAt
  };
}
