import { darknessFactor, solarElevationDeg } from './solar';
import type { DarknessSeasonState } from '../types';

/**
 * MIRROR: this file has an identical, independently-maintained twin at
 * backend/src/season.ts (backend snapshot path) -- see that file's header
 * comment for the reverse pointer. Keep both in sync by hand. This copy is
 * self-contained (duplicates the small Oslo-timezone helpers rather than
 * importing backend/ code) since the frontend and backend are separate
 * packages -- same reasoning as src/scoring/solar.ts mirroring
 * backend/src/solar.ts instead of importing it.
 */

const OSLO_TIME_ZONE = 'Europe/Oslo';

// Tonight's evaluation window: 18:00 local through 08:00 local the next day.
const NIGHT_START_HOUR = 18;
const NIGHT_END_HOUR = 8;
// How far forward to search for the season reopening before giving up.
const SEASON_RETURN_SEARCH_CAP_DAYS = 120;

function getOsloDayKey(date: Date): string {
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

/** Mirrors backend/src/sources.ts's getOsloParts (and the equivalent local
 * helper already duplicated in src/api/kp.ts) -- local Oslo day key plus the
 * local hour, needed for the early-morning "still in last night's window"
 * rollback below. */
function getOsloParts(date: Date): { dayKey: string; hour: number } | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);

  if (!year || !month || !day || !Number.isFinite(hour)) {
    return null;
  }

  return { dayKey: `${year}-${month}-${day}`, hour };
}

function getOsloOffset(date: Date): string {
  const offsetToken = new Intl.DateTimeFormat('en-US', {
    timeZone: OSLO_TIME_ZONE,
    timeZoneName: 'shortOffset'
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;

  const match = offsetToken?.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return '+00:00';
  }

  const sign = match[1][0];
  const absHours = match[1].slice(1).padStart(2, '0');
  const minutes = match[2] ?? '00';
  return `${sign}${absHours}:${minutes}`;
}

function addDaysToDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Converts a local (Europe/Oslo) wall-clock hour on `dayKey` (YYYY-MM-DD)
 * into the corresponding UTC epoch millis, using the real Oslo UTC offset
 * in effect at that instant (correctly handles CET/CEST). */
function localHourToUtcMs(dayKey: string, hour: number): number {
  const [year, month, day] = dayKey.split('-').map(Number);
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
 * Determines whether "tonight" -- the local 18:00 -> 08:00 window for the
 * night the caller is currently *in*, not necessarily the one starting on
 * today's calendar date -- never gets dark enough anywhere for aurora to be
 * visible (`seasonClosed`), and if so, searches forward day by day (capped
 * at `SEASON_RETURN_SEARCH_CAP_DAYS`) for the first night with at least one
 * hour of non-zero darkness, returning that night's local date
 * (`seasonReturns`, ISO YYYY-MM-DD). `seasonReturns` is `null` when the
 * season is currently open, or (in the essentially impossible case) the
 * search cap is exhausted without finding a dark-enough night. Mirrors
 * backend/src/season.ts's computeDarknessSeasonState.
 *
 * Both `seasonClosed` and `seasonReturns` use the same `factor > 0`
 * criterion, so the advisory date always matches the instant the flag
 * itself would flip.
 *
 * Before 06:00 local, "tonight" is still the night that started *yesterday*
 * evening, not the one about to start -- same early-morning rollback used
 * for the KP "tonight" window (see src/api/kp.ts's parseTonightPeak, and
 * the backend twin's backend/src/sources.ts, both keyed off `hour < 6`).
 * Without this, a 02:00 check during a genuinely dark April night would
 * wrongly evaluate the *next* (already-bright) night instead.
 */
export function computeDarknessSeasonState(nowMs: number, lat: number, lon: number): DarknessSeasonState {
  const now = new Date(nowMs);
  const todayKey = getOsloDayKey(now);
  const nowParts = getOsloParts(now);
  const tonightStartDay = nowParts && nowParts.hour < 6 ? addDaysToDayKey(todayKey, -1) : todayKey;

  const seasonClosed = !nightHourlyFactors(tonightStartDay, lat, lon).some((factor) => factor > 0);

  if (!seasonClosed) {
    return { seasonClosed: false, seasonReturns: null };
  }

  for (let offset = 1; offset <= SEASON_RETURN_SEARCH_CAP_DAYS; offset += 1) {
    const candidateKey = addDaysToDayKey(tonightStartDay, offset);
    const factors = nightHourlyFactors(candidateKey, lat, lon);
    if (factors.some((factor) => factor > 0)) {
      return { seasonClosed: true, seasonReturns: candidateKey };
    }
  }

  return { seasonClosed: true, seasonReturns: null };
}
