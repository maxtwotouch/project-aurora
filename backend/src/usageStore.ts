import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { UsageCounterRecord, UsageEventType } from './types.js';

/**
 * PRIVACY INVARIANT: this module is the only place usage data is persisted.
 * The sole stored representation is an integer counter keyed by
 * (event type, spotId, UTC hour bucket). Raw events, precise timestamps,
 * IP addresses, user agents, device/session identifiers, or any other
 * request metadata are never held here — nothing person-derived is ever
 * persisted or logged.
 *
 * The store is exposed behind a small interface (`UsageCounterStore`) so a
 * future iteration can swap the JSON-file-backed implementation below for a
 * real database without touching callers in events.ts / stats.ts.
 *
 * On-disk storage schema (`backend/data/usage-stats.json`):
 *   { updatedAt: string, counters: { "<type>|<spotId>|<hourBucket>": <count>, ... } }
 * Every key is exactly `type|spotId|hourBucket` (see `encodeKey`/`decodeKey`
 * below) and every value a non-negative integer count — nothing else is ever
 * written to this file.
 *
 * Retention: hour-bucket keys older than `USAGE_RETENTION_DAYS` (default 180
 * days; parsed like `STALE_SNAPSHOT_MS` in store.ts — invalid/missing falls
 * back to the default rather than failing startup) are pruned from memory on
 * `load()` and again on every `flush()`, so the JSON mirror never grows
 * unbounded with age-old buckets. A key whose hour-bucket segment can't be
 * parsed as a date is treated as prunable too (see `pruneExpiredBuckets`
 * below). Pruning is logged as a single count-only warning via the same
 * handler used for the distinct-key cap warning — never the pruned keys
 * themselves (though note: a key is just `type|spotId|hourBucket`, so logging
 * one wouldn't leak anything person-derived either way; we just keep the
 * warning simple).
 */

export type CounterKey = {
  type: UsageEventType;
  spotId: string;
  /** UTC hour bucket, formatted "YYYY-MM-DDTHH". */
  hourBucket: string;
};

export interface UsageCounterStore {
  increment(key: CounterKey, amount?: number): void;
  getAll(): UsageCounterRecord[];
  getDistinctKeyCount(): number;
  load(): Promise<void>;
  flush(): Promise<void>;
  setWarningHandler(handler: (message: string) => void): void;
  stop(): void;
}

const USAGE_STATS_PATH = path.resolve(process.cwd(), 'data/usage-stats.json');
const MAX_COUNTER_KEYS = 200_000;
const FLUSH_INTERVAL_MS = 30_000;
const KEY_SEPARATOR = '|';
const DEFAULT_USAGE_RETENTION_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function encodeKey(key: CounterKey): string {
  return `${key.type}${KEY_SEPARATOR}${key.spotId}${KEY_SEPARATOR}${key.hourBucket}`;
}

function decodeKey(encoded: string): CounterKey | null {
  const parts = encoded.split(KEY_SEPARATOR);
  if (parts.length !== 3) return null;
  const [type, spotId, hourBucket] = parts;
  if (!type || !spotId || !hourBucket) return null;
  return { type: type as UsageEventType, spotId, hourBucket };
}

/** Reads USAGE_RETENTION_DAYS per-call (not cached at import time), mirroring
 * the STALE_SNAPSHOT_MS / SOURCE_TIMEOUT_MS pattern in store.ts / sources.ts:
 * missing/invalid -> silently fall back to the documented default rather than
 * failing startup. */
function getUsageRetentionDays(): number {
  const raw = Number(process.env.USAGE_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_USAGE_RETENTION_DAYS;
}

/** Parses a "YYYY-MM-DDTHH" hour bucket into epoch ms (UTC), or null if it
 * isn't a valid/parseable date -- used only to decide pruning eligibility,
 * never persisted or logged itself. */
function hourBucketToMs(hourBucket: string): number | null {
  const parsed = Date.parse(`${hourBucket}:00:00.000Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

class JsonFileUsageCounterStore implements UsageCounterStore {
  private counters = new Map<string, number>();
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private warnedAtCap = false;
  private onWarning: (message: string) => void = () => {};

  constructor() {
    this.flushTimer = setInterval(() => {
      void this.flush().catch(() => {
        // Best-effort mirror to disk; in-memory counters remain authoritative
        // for the lifetime of this process even if a flush attempt fails.
      });
    }, FLUSH_INTERVAL_MS);
    this.flushTimer.unref?.();
  }

  setWarningHandler(handler: (message: string) => void): void {
    this.onWarning = handler;
  }

  increment(key: CounterKey, amount = 1): void {
    const encoded = encodeKey(key);

    if (!this.counters.has(encoded) && this.counters.size >= MAX_COUNTER_KEYS) {
      if (!this.warnedAtCap) {
        this.warnedAtCap = true;
        this.onWarning(
          `usage counter store reached its cap of ${MAX_COUNTER_KEYS} distinct (type, spot, hour) keys; ` +
            'further new keys are being dropped to protect memory. Consider rotating older hour buckets.'
        );
      }
      return;
    }

    this.counters.set(encoded, (this.counters.get(encoded) ?? 0) + amount);
    this.dirty = true;
  }

  getAll(): UsageCounterRecord[] {
    const records: UsageCounterRecord[] = [];
    for (const [encoded, count] of this.counters.entries()) {
      const key = decodeKey(encoded);
      if (!key) continue;
      records.push({ ...key, count });
    }
    return records;
  }

  getDistinctKeyCount(): number {
    return this.counters.size;
  }

  /** Prunes hour-bucket keys older than USAGE_RETENTION_DAYS (default 180),
   * plus any key whose hour-bucket segment fails to parse as a date at all
   * (treated as prunable rather than kept forever). Called on load() and on
   * every flush() so the retention window is enforced continuously, not just
   * at boot. Logs a single count-only warning when anything was pruned --
   * never the pruned keys themselves. */
  private pruneExpiredBuckets(now: number = Date.now()): void {
    const retentionDays = getUsageRetentionDays();
    const cutoffMs = now - retentionDays * MS_PER_DAY;

    let prunedCount = 0;
    let malformedCount = 0;

    // Snapshot the keys first: we delete from `this.counters` while looping,
    // which is unsafe to do against a live Map iterator.
    for (const encoded of Array.from(this.counters.keys())) {
      const key = decodeKey(encoded);
      if (!key) {
        // Defensive-only: unreachable in practice, since every key in
        // `this.counters` was put there by encodeKey() (increment()) or by
        // load()'s own decodeKey() filter, both of which only ever produce
        // well-formed keys. Kept as a guard rather than assuming that
        // invariant holds forever -- treated as prunable too, just in case.
        this.counters.delete(encoded);
        prunedCount += 1;
        malformedCount += 1;
        continue;
      }

      const bucketMs = hourBucketToMs(key.hourBucket);
      if (bucketMs === null) {
        this.counters.delete(encoded);
        prunedCount += 1;
        malformedCount += 1;
        continue;
      }

      if (bucketMs < cutoffMs) {
        this.counters.delete(encoded);
        prunedCount += 1;
      }
    }

    if (prunedCount > 0) {
      this.dirty = true;
      this.onWarning(
        `usage counter store pruned ${prunedCount} hour-bucket key(s) past the ${retentionDays}-day ` +
          `USAGE_RETENTION_DAYS retention window (${malformedCount} malformed).`
      );
    }
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(USAGE_STATS_PATH, 'utf8');
      const parsed = JSON.parse(raw) as { counters?: Record<string, number> };
      const entries = parsed && typeof parsed === 'object' && parsed.counters ? Object.entries(parsed.counters) : [];
      this.counters = new Map(
        entries.filter((entry): entry is [string, number] => typeof entry[1] === 'number' && decodeKey(entry[0]) !== null)
      );
    } catch {
      // No mirror on disk yet, or it is unreadable/corrupt — start from empty counters.
      this.counters = new Map();
    }
    this.pruneExpiredBuckets();
  }

  async flush(): Promise<void> {
    this.pruneExpiredBuckets();
    if (!this.dirty) return;
    this.dirty = false;

    const payload = {
      updatedAt: new Date().toISOString(),
      counters: Object.fromEntries(this.counters.entries())
    };

    const dir = path.dirname(USAGE_STATS_PATH);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${USAGE_STATS_PATH}.tmp-${process.pid}`;
    await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmpPath, USAGE_STATS_PATH);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

export const usageCounterStore: UsageCounterStore = new JsonFileUsageCounterStore();

/** Formats a Date as a UTC hour bucket "YYYY-MM-DDTHH". Never finer than the hour. */
export function toHourBucket(date: Date = new Date()): string {
  return date.toISOString().slice(0, 13);
}
