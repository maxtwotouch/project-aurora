import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { pathToFileURL } from 'node:url';

import { buildTonightSnapshot, getSpots } from './snapshot.js';
import {
  getLatestSnapshot,
  getRefreshStatus,
  getSnapshotAgeMs,
  isSnapshotStale,
  loadSnapshotFromDisk,
  recordRefreshOutcome,
  setLatestSnapshot
} from './store.js';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const REFRESH_MS = Number(process.env.REFRESH_MS ?? 5 * 60 * 1000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://127.0.0.1:8081')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export type BuildAppOptions = {
  adminToken?: string;
  corsOrigins?: string[];
};

export async function refreshSnapshot(): Promise<void> {
  try {
    const snapshot = await buildTonightSnapshot();
    await setLatestSnapshot(snapshot);
    recordRefreshOutcome(true);
  } catch (error) {
    recordRefreshOutcome(false, error);
    throw error;
  }
}

/** Builds a fully-wired Fastify app (routes, CORS, store access) without
 * listening on a port or starting the refresh loop, so tests can `app.inject()`
 * directly. The real entry point (`bootstrap`, below) adds `listen` + the
 * refresh interval on top of this. */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const adminToken = options.adminToken ?? ADMIN_TOKEN;
  const corsOrigins = options.corsOrigins ?? CORS_ORIGINS;

  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, corsOrigins.includes(origin));
    }
  });

  app.get('/v1/health', async () => {
    const snapshot = getLatestSnapshot();
    const refreshStatus = getRefreshStatus();
    const snapshotAgeMs = getSnapshotAgeMs();
    const stale = isSnapshotStale();

    if (!snapshot) {
      return {
        ok: false,
        hasSnapshot: false,
        snapshotAgeMs: null,
        stale: null,
        ...refreshStatus
      };
    }

    return {
      ok: true,
      hasSnapshot: true,
      updatedAt: snapshot.updatedAt,
      sourceFreshnessSec: Math.round((Date.now() - new Date(snapshot.updatedAt).getTime()) / 1000),
      dataQuality: snapshot.dataQuality,
      snapshotAgeMs,
      stale,
      ...refreshStatus
    };
  });

  app.get('/v1/tonight', async (_: FastifyRequest, reply: FastifyReply) => {
    const snapshot = getLatestSnapshot();
    if (!snapshot) {
      reply.code(503);
      return {
        message: 'Snapshot not ready yet.'
      };
    }
    return snapshot;
  });

  app.get('/v1/spots/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const params = request.params;
    const snapshot = getLatestSnapshot();
    const spot = getSpots().find((item) => item.id === params.id);

    if (!spot) {
      reply.code(404);
      return { message: 'Spot not found.' };
    }
    if (!snapshot) {
      reply.code(503);
      return { message: 'Snapshot not ready yet.' };
    }

    return {
      updatedAt: snapshot.updatedAt,
      spot,
      forecast: snapshot.forecastsBySpotId[spot.id] ?? [],
      ranking: snapshot.rankings.find((item) => item.spotId === spot.id) ?? null,
      dataQuality: {
        usingFallbackWeather: snapshot.dataQuality.fallbackWeatherSpotIds.includes(spot.id)
      }
    };
  });

  app.post('/v1/admin/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!adminToken || request.headers['x-admin-token'] !== adminToken) {
      reply.code(401);
      return { ok: false, message: 'Unauthorized' };
    }

    await refreshSnapshot();
    const snapshot = getLatestSnapshot();
    return { ok: true, updatedAt: snapshot?.updatedAt ?? null };
  });

  return app;
}

async function bootstrap() {
  const app = buildApp();

  // Load the disk-mirrored snapshot first so /v1/tonight and /v1/health can
  // serve stale-but-real data as soon as we start listening -- we deliberately
  // do NOT block `listen()` on the first live refresh (below), since a slow or
  // hung upstream must not delay (or, pre-timeout-fix, block) server startup.
  await loadSnapshotFromDisk();

  await app.listen({ host: HOST, port: PORT });
  app.log.info(`Backend listening on ${HOST}:${PORT}`);

  void refreshSnapshot().catch((error) => {
    app.log.error({ err: error }, 'Initial snapshot refresh failed');
  });

  setInterval(() => {
    void refreshSnapshot().catch((error) => {
      app.log.error({ err: error }, 'Background snapshot refresh failed');
    });
  }, REFRESH_MS);
}

const isEntryPoint = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1] as string).href;

if (isEntryPoint) {
  void bootstrap().catch((error) => {
    console.error('Fatal startup error', error);
    process.exit(1);
  });
}
