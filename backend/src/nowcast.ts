import type { Clock, FetchLike } from './sources.js';
import { fetchWithTimeout } from './sources.js';
import type { NowcastLevel, NowcastSourceId, NowcastSummary } from './types.js';

// -----------------------------------------------------------------------------
// Sources. See docs/nowcast.md for the physics rationale and honest
// limitations of each one.
//
// IMPORTANT DEVIATION FROM THE ORIGINAL TASK SPEC: the task described
// `https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json` and
// `.../plasma-1-day.json` (array-of-arrays, the same family sources.ts already
// parses for Kp). Live-probing those from this sandbox on 2026-07-27 got a
// genuine (CloudFront-backed, not proxy-faked) 404 -- NOAA's `/products/`
// directory no longer lists a `solar-wind/` subfolder at all. The functional
// replacement NOAA currently serves is `/json/rtsw/` ("real-time solar
// wind"), which is JSON-array-of-*objects* (not array-of-arrays) and carries
// both the active DSCOVR/ACE-derived reading and recent history. This module
// targets that live endpoint instead; see the sample rows pasted into the
// parser comments below.
// -----------------------------------------------------------------------------

const SOLAR_WIND_MAG_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json';
const SOLAR_WIND_PLASMA_URL = 'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json';
const OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';

// Approximate Sun-Earth L1 distance (km). Used only for the ballpark
// "how long until this solar wind parcel reaches Earth" estimate -- L1 isn't
// at a fixed distance (it drifts with the Sun-Earth gravity balance and solar
// wind pressure), so this is a single representative constant, not a
// precise ephemeris lookup. See docs/nowcast.md ("Limitations").
const L1_DISTANCE_KM = 1_500_000;

// Tromso center coordinates, matching snapshot.ts's TROMSO_CENTER (kept as an
// independent literal here rather than importing from snapshot.ts, to avoid
// a snapshot.ts <-> nowcast.ts import cycle; snapshot.ts imports *from*
// nowcast.ts, not the other way around).
const TROMSO_LAT = 69.6;
const TROMSO_LON = 18.9;

// OVATION's `coordinates` grid is documented by its own `"Data Format":
// "[Longitude, Latitude, Aurora]"` field. Verified against a live payload
// (2026-07-27): longitude values range 0..359 (0-359 degrees EAST -- NOT
// -180..180), latitude -90..90, and the grid step is 1 degree. Tromso's
// ~18.9E therefore maps directly onto the grid with no wraparound/conversion
// needed. The window below is a small neighbourhood (not just the single
// nearest cell) so a 1-degree grid-alignment mismatch can't silently miss
// the local peak.
const OVATION_LON_WINDOW_DEG = 2;
const OVATION_LAT_WINDOW_DEG = 2;

// -----------------------------------------------------------------------------
// Solar wind (NOAA SWPC, required source).
// -----------------------------------------------------------------------------

/**
 * Sample row from a live `rtsw_mag_1m.json` fetch (2026-07-27T08:27 UTC),
 * trimmed to the fields we use:
 *   { "time_tag": "2026-07-27T08:27:00", "active": true, "source": "ACE",
 *     "bz_gsm": 2.14, ... }
 * The array holds recent 1-minute samples from whichever spacecraft
 * (ACE/DSCOVR/etc, see `source`) is currently the designated real-time
 * source; entries are NOT purely append-sorted (multiple sources can be
 * interleaved), and only entries with `active: true` are the "official"
 * real-time series -- inactive entries are stale/backup-source rows. We use
 * GSM (not GSE) Bz, since GSM is the coordinate frame aligned with Earth's
 * magnetic dipole and is the conventional frame for "southward IMF couples
 * to the magnetosphere" statements.
 */
type RtswMagEntry = {
  time_tag?: unknown;
  active?: unknown;
  bz_gsm?: unknown;
};

/**
 * Sample row from a live `rtsw_wind_1m.json` fetch (2026-07-27T08:28 UTC),
 * trimmed to the fields we use:
 *   { "time_tag": "2026-07-27T08:28:00", "active": true, "source": "ACE",
 *     "proton_speed": 386.34, "proton_density": 1.39, ... }
 */
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
 * From an rtsw-style array (entries can be inactive/stale, out of strict
 * time order, or missing the fields we need), picks the newest entry that
 * satisfies `isComplete`, preferring `active: true` entries but falling back
 * to any complete entry if none is marked active (degrade gracefully rather
 * than returning nothing just because the upstream's own "active" bookkeeping
 * is momentarily empty). Exported for reuse/testing by both the mag and
 * plasma parsers below.
 */
export function pickLatestComplete<T extends { time_tag?: unknown; active?: unknown }>(
  payload: unknown,
  isComplete: (entry: T) => boolean
): T | null {
  if (!Array.isArray(payload)) return null;

  const candidates = payload.filter(
    (entry): entry is T => !!entry && typeof entry === 'object' && isComplete(entry as T)
  );
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

export function extractLatestBz(payload: unknown): number | null {
  const entry = pickLatestComplete<RtswMagEntry>(payload, (candidate) =>
    Number.isFinite(Number(candidate.bz_gsm))
  );
  if (!entry) return null;
  const value = Number(entry.bz_gsm);
  return Number.isFinite(value) ? value : null;
}

export function extractLatestPlasma(payload: unknown): { speed: number | null; density: number | null } {
  const entry = pickLatestComplete<RtswPlasmaEntry>(
    payload,
    (candidate) => Number.isFinite(Number(candidate.proton_speed)) && Number.isFinite(Number(candidate.proton_density))
  );
  if (!entry) return { speed: null, density: null };

  const speed = Number(entry.proton_speed);
  const density = Number(entry.proton_density);
  return {
    speed: Number.isFinite(speed) ? speed : null,
    density: Number.isFinite(density) ? density : null
  };
}

/**
 * Approximate minutes between "this solar wind parcel is measured at L1"
 * and "it reaches Earth's magnetosphere", from bulk speed alone
 * (distance / speed). See docs/nowcast.md ("Limitations") for why this is a
 * rough estimate (typically 30-60 min at quiet-to-moderate speeds), not a
 * guarantee -- real propagation also depends on the parcel's orientation and
 * any acceleration/deceleration between L1 and Earth.
 */
export function computeLeadTimeMinutes(solarWindSpeedKmPerSec: number | null): number | null {
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

export type SolarWindReading = {
  bz: number | null;
  solarWindSpeed: number | null;
  solarWindDensity: number | null;
  leadTimeMinutes: number | null;
  usingFallback: boolean;
};

/**
 * Fetches IMF Bz (mag) and speed/density (plasma) independently -- following
 * sources.ts's resilience discipline, a failure in one never blocks the
 * other. `usingFallback` is true only when BOTH come back empty; a partial
 * result (e.g. Bz present, speed/density missing) is still "using real data"
 * for whichever field succeeded.
 */
export async function fetchSolarWindWithQuality(
  fetchImpl: FetchLike = globalThis.fetch
): Promise<SolarWindReading> {
  const [magResult, plasmaResult] = await Promise.allSettled([
    fetchWithTimeout(fetchImpl, SOLAR_WIND_MAG_URL),
    fetchWithTimeout(fetchImpl, SOLAR_WIND_PLASMA_URL)
  ]);

  let bz: number | null = null;
  if (magResult.status === 'fulfilled' && magResult.value.ok) {
    try {
      bz = extractLatestBz(await magResult.value.json());
    } catch {
      bz = null;
    }
  }

  let solarWindSpeed: number | null = null;
  let solarWindDensity: number | null = null;
  if (plasmaResult.status === 'fulfilled' && plasmaResult.value.ok) {
    try {
      const latest = extractLatestPlasma(await plasmaResult.value.json());
      solarWindSpeed = latest.speed;
      solarWindDensity = latest.density;
    } catch {
      solarWindSpeed = null;
      solarWindDensity = null;
    }
  }

  return {
    bz,
    solarWindSpeed,
    solarWindDensity,
    leadTimeMinutes: computeLeadTimeMinutes(solarWindSpeed),
    usingFallback: bz === null && solarWindSpeed === null && solarWindDensity === null
  };
}

// -----------------------------------------------------------------------------
// OVATION aurora oval (NOAA SWPC, required source).
// -----------------------------------------------------------------------------

/**
 * Sample shape from a live `ovation_aurora_latest.json` fetch
 * (2026-07-27T08:27 UTC observation time), trimmed:
 *   { "Observation Time": "2026-07-27T08:27:00Z",
 *     "Forecast Time": "2026-07-27T09:35:00Z",
 *     "Data Format": "[Longitude, Latitude, Aurora]",
 *     "coordinates": [[0, -90, 4], [0, -89, 0], ..., [359, 90, 0]],
 *     "type": "MultiPoint" }
 * ~65k coordinate rows on a 1-degree lon(0-359) x lat(-90..90) grid; "Aurora"
 * is SWPC's aurora probability/flux value for that cell (0 up into the tens
 * during quiet conditions in this sample; can run much higher during storms).
 */
export function extractOvationProbability(
  payload: unknown,
  lat: number = TROMSO_LAT,
  lon: number = TROMSO_LON
): number | null {
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

export function extractOvationForecastTime(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)['Forecast Time'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export type OvationReading = {
  ovationProbability: number | null;
  ovationForecastTime: string | null;
  usingFallback: boolean;
};

export async function fetchOvationWithQuality(fetchImpl: FetchLike = globalThis.fetch): Promise<OvationReading> {
  try {
    const response = await fetchWithTimeout(fetchImpl, OVATION_URL);
    if (!response.ok) {
      throw new Error(`OVATION fetch failed (${response.status})`);
    }

    const payload = await response.json();
    return {
      ovationProbability: extractOvationProbability(payload),
      ovationForecastTime: extractOvationForecastTime(payload),
      usingFallback: false
    };
  } catch {
    return { ovationProbability: null, ovationForecastTime: null, usingFallback: true };
  }
}

// -----------------------------------------------------------------------------
// TGO ground magnetometer (Tromso Geophysical Observatory / UiT,
// best-effort source) -- currently a deliberate STUB.
//
// Investigated 2026-07-27: flux.phys.uit.no / geo.phys.uit.no are reachable
// and list a machine-readable-looking ASCII CGI endpoint
// (`https://flux.phys.uit.no/cgi-bin/mkascii.cgi`, form at
// `https://flux.phys.uit.no/ascii/`) with a "Tromso" site radio button
// (`site=tro2a`) and a "Get Realtime Data" mode covering the last 24h.
// However, TGO's own data-access page
// (`https://flux.phys.uit.no/div/DataAccess.html`) states explicitly:
// "Digital data from DTU Space ... and TGO in ASCII format are available
// here, but are protected by a password. Requests for password should be
// directed to ... TGO for data from Norwegian magnetometers." We were not
// given a password, and polling a password-gated endpoint without one --
// even if some request shape happened to return data unauthenticated --
// would not be "confirmed acceptable use" of TGO's data. Per this task's
// instruction to not block the PR on the best-effort source when the ToS is
// unclear, this stays a stub (always null) until a human owner obtains and
// wires in TGO's password/authorization. See docs/nowcast.md for the
// attribution note that MUST ship alongside this if it's ever activated.
// -----------------------------------------------------------------------------

export type TgoReading = {
  tgoDisturbanceNt: number | null;
  usingFallback: boolean;
};

// Kept `async` (despite doing no actual async work) to match the other
// `fetch*WithQuality` signatures/call sites -- swapping in a real
// implementation later won't require touching every caller's `await`.
export async function fetchTgoDisturbanceWithQuality(): Promise<TgoReading> {
  return { tgoDisturbanceNt: null, usingFallback: true };
}

// -----------------------------------------------------------------------------
// Pure interpretation: derives the display-only nowcast level from whatever
// inputs are available. TWIN-READY -- no Node imports, deterministic, no
// reliance on anything but its arguments. If/when this needs a frontend twin
// under src/scoring/ (mirroring scoring.ts/scoring/score.ts), this function
// plus its threshold constants and `NowcastLevelInputs` type should be
// copied verbatim. Does NOT touch the 0-100 planning score in scoring.ts or
// alerts.ts -- this is an additional display signal only. See
// docs/nowcast.md's threshold table (marked as priors pending validation).
// -----------------------------------------------------------------------------

/** Southward (negative) Bz, nT, GSM -- the primary aurora-coupling driver.
 * Rationale for the two southward cut points: -5 nT is a commonly-cited
 * "geomagnetic activity likely" threshold in space-weather nowcasting
 * write-ups; -10 nT is comfortably into "strong coupling, storm-class"
 * territory. Both are heuristic priors (see docs/nowcast.md), not
 * calibrated against Tromso-specific outcomes yet. */
export const BZ_ACTIVE_THRESHOLD_NT = -5;
export const BZ_STORMING_THRESHOLD_NT = -10;
/** Any southward Bz at all is a departure from "quiet" -- see docs/nowcast.md. */
export const BZ_STIRRING_THRESHOLD_NT = 0;

/** OVATION probability/flux cut points in the Tromso window. Heuristic
 * priors picked to roughly track the Bz cut points above (a moderately
 * southward Bz and a moderately elevated OVATION reading should land in the
 * same level), not derived from a validated OVATION-vs-visible-aurora study
 * for Tromso specifically -- see docs/nowcast.md. */
export const OVATION_STIRRING_THRESHOLD = 5;
export const OVATION_ACTIVE_THRESHOLD = 20;
export const OVATION_STORMING_THRESHOLD = 50;

export type NowcastLevelInputs = {
  /** IMF Bz at L1 (nT, GSM). `null` when unavailable. */
  bz: number | null;
  /** Max OVATION aurora probability/flux in the Tromso window. `null` when unavailable. */
  ovationProbability: number | null;
};

/**
 * `storming` requires BOTH a strongly southward Bz AND a high OVATION
 * reading -- corroboration from both signals, so a single brief Bz spike
 * (solar wind Bz is spiky at 1-minute cadence) can't alone claim "storming".
 * `active` and `stirring` only need ONE signal at the matching threshold,
 * so a missing source degrades gracefully to relying on whichever source is
 * actually available, rather than collapsing to `quiet` just because one of
 * the two upstreams failed.
 */
export function deriveNowcastLevel(inputs: NowcastLevelInputs): NowcastLevel {
  const { bz, ovationProbability } = inputs;

  const bzStorming = typeof bz === 'number' && bz <= BZ_STORMING_THRESHOLD_NT;
  const bzActive = typeof bz === 'number' && bz <= BZ_ACTIVE_THRESHOLD_NT;
  const bzStirring = typeof bz === 'number' && bz < BZ_STIRRING_THRESHOLD_NT;

  const ovationStorming = typeof ovationProbability === 'number' && ovationProbability >= OVATION_STORMING_THRESHOLD;
  const ovationActive = typeof ovationProbability === 'number' && ovationProbability >= OVATION_ACTIVE_THRESHOLD;
  const ovationStirring = typeof ovationProbability === 'number' && ovationProbability >= OVATION_STIRRING_THRESHOLD;

  if (bzStorming && ovationStorming) return 'storming';
  if (bzActive || ovationActive) return 'active';
  if (bzStirring || ovationStirring) return 'stirring';
  return 'quiet';
}

// -----------------------------------------------------------------------------
// Combine everything into the snapshot-facing NowcastSummary.
// -----------------------------------------------------------------------------

/**
 * Fetches all three sources (each individually resilient, see above) and
 * assembles a `NowcastSummary`. Never throws. Returns `undefined` only when
 * every source came back empty (total nowcast failure) -- callers
 * (snapshot.ts) should treat that exactly like "no nowcast field", leaving
 * the rest of the snapshot (weather/KP planning, spot rankings) unaffected.
 */
export async function fetchNowcastSummary(
  fetchImpl: FetchLike = globalThis.fetch,
  now: Clock = Date.now
): Promise<NowcastSummary | undefined> {
  const [solarWind, ovation, tgo] = await Promise.all([
    fetchSolarWindWithQuality(fetchImpl).catch(
      (): SolarWindReading => ({
        bz: null,
        solarWindSpeed: null,
        solarWindDensity: null,
        leadTimeMinutes: null,
        usingFallback: true
      })
    ),
    fetchOvationWithQuality(fetchImpl).catch(
      (): OvationReading => ({ ovationProbability: null, ovationForecastTime: null, usingFallback: true })
    ),
    fetchTgoDisturbanceWithQuality().catch((): TgoReading => ({ tgoDisturbanceNt: null, usingFallback: true }))
  ]);

  const sourcesAvailable: NowcastSourceId[] = [];
  if (solarWind.bz !== null || solarWind.solarWindSpeed !== null || solarWind.solarWindDensity !== null) {
    sourcesAvailable.push('solar_wind');
  }
  if (ovation.ovationProbability !== null) {
    sourcesAvailable.push('ovation');
  }
  if (tgo.tgoDisturbanceNt !== null) {
    sourcesAvailable.push('tgo_magnetometer');
  }

  if (sourcesAvailable.length === 0) {
    return undefined;
  }

  return {
    updatedAt: new Date(now()).toISOString(),
    level: deriveNowcastLevel({ bz: solarWind.bz, ovationProbability: ovation.ovationProbability }),
    bz: solarWind.bz,
    solarWindSpeed: solarWind.solarWindSpeed,
    solarWindDensity: solarWind.solarWindDensity,
    leadTimeMinutes: solarWind.leadTimeMinutes,
    ovationProbability: ovation.ovationProbability,
    ovationForecastTime: ovation.ovationForecastTime,
    tgoDisturbanceNt: tgo.tgoDisturbanceNt,
    sourcesAvailable
  };
}
