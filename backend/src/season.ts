import { addDaysToDayKey, getOsloDayKey, getOsloOffset } from './sources.js';
import { darknessFactor, solarElevationDeg } from './solar.js';
import type { DarknessSeasonState } from './types.js';

/**
 * MIRROR: this file has an identical, independently-maintained twin at
 * src/scoring/season.ts (frontend, direct-source path) -- see that file's
 * header comment for the reverse pointer. Keep both in sync by hand.
 */

// Tonight's evaluation window: 18:00 local through 08:00 local the next day.
const NIGHT_START_HOUR = 18;
const NIGHT_END_HOUR = 8;
// How far forward to search for the season reopening before giving up.
const SEASON_RETURN_SEARCH_CAP_DAYS = 120;
// A night "counts" as having aurora-viable darkness once some hour reaches
// at least this much of the way from twilight (0) to fully dark (1).
const SEASON_RETURN_FACTOR_THRESHOLD = 0.5;

/** Converts a local (Europe/Oslo) wall-clock hour on `dayKey` (YYYY-MM-DD)
 * into the corresponding UTC epoch millis, using the real Oslo UTC offset
 * in effect at that instant (correctly handles CET/CEST). */
function localHourToUtcMs(dayKey: string, hour: number): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  // First guess: treat the wall-clock hour as if it were already UTC, then
  // ask what Oslo's offset is at that instant, and correct for it. Oslo's
  // offset only ever changes by whole hours at fixed points in the year, so
  // this single-pass correction is accurate outside of the DST-transition
  // hour itself (an acceptable approximation for this purpose).
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const offset = getOsloOffset(guess);
  const sign = offset[0] === '-' ? -1 : 1;
  const [offsetHours, offsetMinutes] = offset.slice(1).split(':').map(Number);
  const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60 * 1000;
  return guess.getTime() - offsetMs;
}

/** The darkness factor at each hour of the local 18:00 -> 08:00 evaluation
 * window for the night starting on `dayKey`, for the given coordinates. */
function nightHourlyFactors(dayKey: string, lat: number, lon: number): number[] {
  const factors: number[] = [];

  for (let hour = NIGHT_START_HOUR; hour <= 23; hour += 1) {
    factors.push(darknessFactor(solarElevationDeg(localHourToUtcMs(dayKey, hour), lat, lon)));
  }

  const nextDay = addDaysToDayKey(dayKey, 1);
  for (let hour = 0; hour <= NIGHT_END_HOUR; hour += 1) {
    factors.push(darknessFactor(solarElevationDeg(localHourToUtcMs(nextDay, hour), lat, lon)));
  }

  return factors;
}

/**
 * Determines whether "tonight" (the local 18:00 -> 08:00 window starting
 * today) never gets dark enough anywhere for aurora to be visible
 * (`seasonClosed`), and if so, searches forward day by day (capped at
 * `SEASON_RETURN_SEARCH_CAP_DAYS`) for the first night with at least one
 * hour reaching `SEASON_RETURN_FACTOR_THRESHOLD` darkness, returning that
 * night's local date (`seasonReturns`, ISO YYYY-MM-DD). `seasonReturns` is
 * `null` when the season is currently open, or (in the essentially
 * impossible case) the search cap is exhausted without finding a dark-enough
 * night.
 */
export function computeDarknessSeasonState(nowMs: number, lat: number, lon: number): DarknessSeasonState {
  const todayKey = getOsloDayKey(new Date(nowMs));
  const seasonClosed = !nightHourlyFactors(todayKey, lat, lon).some((factor) => factor > 0);

  if (!seasonClosed) {
    return { seasonClosed: false, seasonReturns: null };
  }

  for (let offset = 1; offset <= SEASON_RETURN_SEARCH_CAP_DAYS; offset += 1) {
    const candidateKey = addDaysToDayKey(todayKey, offset);
    const factors = nightHourlyFactors(candidateKey, lat, lon);
    if (factors.some((factor) => factor >= SEASON_RETURN_FACTOR_THRESHOLD)) {
      return { seasonClosed: true, seasonReturns: candidateKey };
    }
  }

  return { seasonClosed: true, seasonReturns: null };
}
