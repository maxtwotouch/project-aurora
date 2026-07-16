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
  }

  async flush(): Promise<void> {
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
