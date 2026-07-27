/**
 * Shared "HH:MM, 24-hour" clock formatter -- extracted from
 * src/components/tonight/HeroSection.tsx's original local `formatUpdatedAt`
 * (byte-identical behavior, just given a shared home) so any other caller
 * that wants an absolute "as of HH:MM" reading -- e.g. NowcastPanel's
 * `bzReadingAt` line -- reuses the exact same formatting instead of growing
 * its own slightly-different copy. Device-locale-aware via the `[]` locale
 * argument (same as this file's other `toLocaleTimeString` call sites, e.g.
 * src/api/yr.ts's `estimateSightingPossibleFrom`), but always forces 24-hour
 * `hourCycle: 'h23'` regardless of locale, matching HeroSection's original
 * intent of a consistent, unambiguous clock format across the app.
 */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23'
  });
}
