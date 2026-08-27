/**
 * Oslo-local "which night is this" convention -- pure, deterministic, no I/O.
 *
 * Mirrors src/scoring/season.ts's getOsloDayKey/getOsloParts and
 * src/api/kp.ts's identically-shaped local helper (each of those already
 * independently duplicates this same small Oslo-timezone routine, per
 * season.ts's own header comment on why: "the frontend and backend are
 * separate packages" -- and here, separate *purposes* -- so importing across
 * unrelated modules isn't worth it for ~20 lines of Intl formatting). This is
 * the same helper duplicated a third time, deliberately, rather than a new
 * shared dependency.
 *
 * Used as zoneDiscovery.ts's injected `config.nightKeyOf` (see that module's
 * own doc comment on `ZoneDiscoveryConfig.nightKeyOf`): a 02:00 zone_dwell
 * counts toward the night that started the evening before, exactly like the
 * darkness-season and KP "tonight" windows already do (hour < 6 rolls back
 * to the previous local day).
 */

const OSLO_TIME_ZONE = 'Europe/Oslo';

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

function addDaysToDayKey(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The Oslo-local "night key" for a given instant: the local calendar date
 * (YYYY-MM-DD) the evening 18:00-08:00 window belongs to, rolled back one
 * day before 06:00 local so an early-morning sample still counts toward the
 * night that started the previous evening. Falls back to the UTC calendar
 * date (matching season.ts's own defensive fallback) for an invalid
 * timestamp, which should not occur given real device clocks.
 */
export function nightKeyOf(timestampMs: number): string {
  const date = new Date(timestampMs);
  const parts = getOsloParts(date);

  if (!parts) {
    return date.toISOString().slice(0, 10);
  }

  return parts.hour < 6 ? addDaysToDayKey(parts.dayKey, -1) : parts.dayKey;
}
