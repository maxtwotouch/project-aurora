import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { usageCounterStore } from './usageStore.js';
import type { UsageEventType, UsageStatsResponse, UsageTypeTotals } from './types.js';

/**
 * Read side for anonymous usage counters. Every response here is an
 * aggregate over (type, spotId, hourBucket) counters — there is no
 * row-level/raw data to return even in principle, by construction of
 * usageStore.ts.
 */

const EVENT_TYPES: readonly UsageEventType[] = ['spot_view', 'navigate_pressed', 'spot_shared'];
const DEFAULT_STATS_MIN_CELL = 0;

function emptyTypeTotals(): UsageTypeTotals {
  return { spot_view: 0, navigate_pressed: 0, spot_shared: 0 };
}

function sumTotals(totals: UsageTypeTotals): number {
  return EVENT_TYPES.reduce((sum, type) => sum + totals[type], 0);
}

/** Reads STATS_MIN_CELL per-call (not cached at import time), mirroring the
 * STALE_SNAPSHOT_MS / SOURCE_TIMEOUT_MS pattern elsewhere: missing/invalid ->
 * silently fall back to the default (0 = suppression off) rather than
 * failing. The owner decides the real threshold; this just makes it a knob. */
function getStatsMinCell(): number {
  const raw = Number(process.env.STATS_MIN_CELL);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_STATS_MIN_CELL;
}

/** Omits any entry whose `total` is below `minCell` (no-op when `minCell` is
 * 0, i.e. suppression off). Returns the kept entries and how many were
 * suppressed, so callers can report an exact `suppressedCells` count without
 * ever exposing which cells were hidden or their values. */
function suppressSmallCells<T extends { total: number }>(
  entries: T[],
  minCell: number
): { kept: T[]; suppressed: number } {
  if (minCell <= 0) return { kept: entries, suppressed: 0 };
  const kept = entries.filter((entry) => entry.total >= minCell);
  return { kept, suppressed: entries.length - kept.length };
}

function buildUsageStats(): UsageStatsResponse {
  const records = usageCounterStore.getAll();

  const totalsByType = emptyTypeTotals();
  const bySpotMap = new Map<string, UsageTypeTotals>();
  const byHourMap = new Map<string, UsageTypeTotals>();
  const byDayMap = new Map<string, UsageTypeTotals>();

  for (const record of records) {
    totalsByType[record.type] += record.count;

    const spotTotals = bySpotMap.get(record.spotId) ?? emptyTypeTotals();
    spotTotals[record.type] += record.count;
    bySpotMap.set(record.spotId, spotTotals);

    const hourTotals = byHourMap.get(record.hourBucket) ?? emptyTypeTotals();
    hourTotals[record.type] += record.count;
    byHourMap.set(record.hourBucket, hourTotals);

    const day = record.hourBucket.slice(0, 10);
    const dayTotals = byDayMap.get(day) ?? emptyTypeTotals();
    dayTotals[record.type] += record.count;
    byDayMap.set(day, dayTotals);
  }

  const minCell = getStatsMinCell();

  const bySpotAll = Array.from(bySpotMap.entries())
    .map(([spotId, totals]) => ({ spotId, totalsByType: totals, total: sumTotals(totals) }))
    .sort((a, b) => b.total - a.total);
  const byHourAll = Array.from(byHourMap.entries())
    .map(([hourBucket, totals]) => ({ hourBucket, totalsByType: totals, total: sumTotals(totals) }))
    .sort((a, b) => a.hourBucket.localeCompare(b.hourBucket));
  const byDayAll = Array.from(byDayMap.entries())
    .map(([day, totals]) => ({ day, totalsByType: totals, total: sumTotals(totals) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Small-cell suppression (STATS_MIN_CELL, default 0 = off): omit
  // low-count breakdown entries entirely so a single-digit count can't be
  // correlated back to an individual's action. `totalEvents`/`totalsByType`
  // above are computed from the full, unsuppressed record set and stay
  // exact regardless.
  const bySpotResult = suppressSmallCells(bySpotAll, minCell);
  const byHourResult = suppressSmallCells(byHourAll, minCell);
  const byDayResult = suppressSmallCells(byDayAll, minCell);

  return {
    generatedAt: new Date().toISOString(),
    aggregationLevel: 'spot-hour',
    totalEvents: sumTotals(totalsByType),
    totalsByType,
    bySpot: bySpotResult.kept,
    byHour: byHourResult.kept,
    byDay: byDayResult.kept,
    distinctCounterKeys: usageCounterStore.getDistinctKeyCount(),
    suppression: {
      minCell,
      suppressedCells: bySpotResult.suppressed + byHourResult.suppressed + byDayResult.suppressed
    }
  };
}

export function registerStatsRoutes(app: FastifyInstance, adminToken: string): void {
  app.get('/v1/stats/usage', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!adminToken || request.headers['x-admin-token'] !== adminToken) {
      reply.code(401);
      return { ok: false, message: 'Unauthorized' };
    }

    return buildUsageStats();
  });
}
