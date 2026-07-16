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

function emptyTypeTotals(): UsageTypeTotals {
  return { spot_view: 0, navigate_pressed: 0, spot_shared: 0 };
}

function sumTotals(totals: UsageTypeTotals): number {
  return EVENT_TYPES.reduce((sum, type) => sum + totals[type], 0);
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

  return {
    generatedAt: new Date().toISOString(),
    aggregationLevel: 'spot-hour',
    totalEvents: sumTotals(totalsByType),
    totalsByType,
    bySpot: Array.from(bySpotMap.entries())
      .map(([spotId, totals]) => ({ spotId, totalsByType: totals, total: sumTotals(totals) }))
      .sort((a, b) => b.total - a.total),
    byHour: Array.from(byHourMap.entries())
      .map(([hourBucket, totals]) => ({ hourBucket, totalsByType: totals, total: sumTotals(totals) }))
      .sort((a, b) => a.hourBucket.localeCompare(b.hourBucket)),
    byDay: Array.from(byDayMap.entries())
      .map(([day, totals]) => ({ day, totalsByType: totals, total: sumTotals(totals) }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    distinctCounterKeys: usageCounterStore.getDistinctKeyCount()
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
