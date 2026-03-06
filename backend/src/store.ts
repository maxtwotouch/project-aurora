import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { TonightSnapshot } from './types.js';

const SNAPSHOT_PATH = path.resolve(process.cwd(), 'data/latest-snapshot.json');

let latestSnapshot: TonightSnapshot | null = null;

export function getLatestSnapshot(): TonightSnapshot | null {
  return latestSnapshot;
}

export async function setLatestSnapshot(snapshot: TonightSnapshot): Promise<void> {
  latestSnapshot = snapshot;
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
}

export async function loadSnapshotFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
    latestSnapshot = JSON.parse(raw) as TonightSnapshot;
  } catch {
    latestSnapshot = null;
  }
}
