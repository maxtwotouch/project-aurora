import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { TonightSnapshot } from './types.js';

const SNAPSHOT_PATH = path.resolve(process.cwd(), 'data/latest-snapshot.json');
const DEFAULT_STALE_SNAPSHOT_MS = 30 * 60 * 1000;

function getStaleSnapshotMs(): number {
  const raw = Number(process.env.STALE_SNAPSHOT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STALE_SNAPSHOT_MS;
}

let latestSnapshot: TonightSnapshot | null = null;

// Tracks the outcome of the most recent refresh attempt (live snapshot build),
// independent of whether we're currently serving a disk-mirrored snapshot.
let lastRefreshSucceeded: boolean | null = null;
let lastRefreshAttemptAt: string | null = null;
let lastRefreshError: string | null = null;

export function getLatestSnapshot(): TonightSnapshot | null {
  return latestSnapshot;
}

/** Age (ms) of the currently-held snapshot, or null if there is none / it has
 * an unparseable `updatedAt`. */
export function getSnapshotAgeMs(now = Date.now()): number | null {
  if (!latestSnapshot) return null;
  const updatedAt = new Date(latestSnapshot.updatedAt).getTime();
  if (Number.isNaN(updatedAt)) return null;
  return now - updatedAt;
}

export function isSnapshotStale(now = Date.now()): boolean {
  const age = getSnapshotAgeMs(now);
  return age !== null && age > getStaleSnapshotMs();
}

export function recordRefreshOutcome(success: boolean, error?: unknown): void {
  lastRefreshSucceeded = success;
  lastRefreshAttemptAt = new Date().toISOString();
  lastRefreshError = success ? null : error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

export function getRefreshStatus(): {
  lastRefreshSucceeded: boolean | null;
  lastRefreshAttemptAt: string | null;
  lastRefreshError: string | null;
} {
  return { lastRefreshSucceeded, lastRefreshAttemptAt, lastRefreshError };
}

export async function setLatestSnapshot(snapshot: TonightSnapshot): Promise<void> {
  latestSnapshot = snapshot;
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
}

/** Loads the disk-mirrored snapshot (if present and parseable) into the
 * in-memory store, so `/v1/tonight` can serve stale-but-real data immediately
 * after a restart, before the first live refresh completes. Marks the
 * snapshot's dataQuality.staleSnapshot flag if it's older than the
 * STALE_SNAPSHOT_MS threshold. Corrupt/missing mirror -> start empty, warn, no crash. */
export async function loadSnapshotFromDisk(now = Date.now()): Promise<void> {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw) as TonightSnapshot;

    latestSnapshot = {
      ...parsed,
      dataQuality: {
        ...parsed.dataQuality,
        staleSnapshot: isSnapshotStaleFor(parsed, now)
      }
    };
  } catch (error) {
    latestSnapshot = null;
    console.warn(
      '[store] Could not load mirrored snapshot from disk; starting with an empty store.',
      error instanceof Error ? error.message : error
    );
  }
}

function isSnapshotStaleFor(snapshot: TonightSnapshot, now: number): boolean {
  const updatedAt = new Date(snapshot.updatedAt).getTime();
  if (Number.isNaN(updatedAt)) return false;
  return now - updatedAt > getStaleSnapshotMs();
}
