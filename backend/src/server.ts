import Fastify from 'fastify';
import type { FastifyInstance, FastifyLoggerOptions, FastifyReply, FastifyRequest } from 'fastify';
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
import { config } from './config.js';
import { registerEventRoutes } from './events.js';
import { registerStatsRoutes } from './stats.js';
import { usageCounterStore } from './usageStore.js';

export type BuildAppOptions = {
  adminToken?: string;
  corsOrigins?: string[];
  /** Test-only hook: redirect log output to a custom stream instead of
   * stdout, so tests can capture and assert on emitted log lines without
   * touching the process's real stdout. */
  loggerStream?: NonNullable<FastifyLoggerOptions['stream']>;
};

/**
 * PRIVACY INVARIANT: no route in this backend may ever log a caller's IP
 * address, port, or headers. Fastify's default request/response access
 * logging (`logger: true`) would otherwise serialize `remoteAddress` /
 * `remotePort` (derived from `request.ip` / the raw socket) for every
 * request via its default `req` serializer -- see
 * `fastify/lib/logger-pino.js`. We override that serializer repo-wide (for
 * every route, not just `/v1/events`) to keep only `method` and `url`. The
 * default `res` serializer already only exposes `statusCode`, but it's kept
 * explicit here so this stays true even if a future Fastify version changes
 * its default. Log levels/behavior are otherwise unchanged (still `info`
 * level access logs for every route except `/v1/events`, which silences its
 * own access logging separately -- see `events.ts`).
 */
export const logSerializers: NonNullable<FastifyLoggerOptions['serializers']> = {
  req(request) {
    return { method: request.method, url: request.url };
  },
  res(reply) {
    return { statusCode: reply.statusCode };
  }
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
  const adminToken = options.adminToken ?? config.adminToken;
  const corsOrigins = options.corsOrigins ?? config.corsOrigins;

  const app = Fastify({
    logger: {
      serializers: logSerializers,
      ...(options.loggerStream ? { stream: options.loggerStream } : {})
    }
  });

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

  // Anonymous, aggregate-only usage collection (see events.ts / stats.ts /
  // usageStore.ts). Registered inside buildApp so injected tests exercise the
  // same wiring as the real server.
  registerEventRoutes(app);
  registerStatsRoutes(app, adminToken);

  return app;
}

async function bootstrap() {
  const app = buildApp();

  // Usage counters: restore persisted aggregates and route data-quality
  // warnings through the app logger before any traffic arrives.
  usageCounterStore.setWarningHandler((message) => app.log.warn(message));
  await usageCounterStore.load();

  // Load the disk-mirrored snapshot first so /v1/tonight and /v1/health can
  // serve stale-but-real data as soon as we start listening -- we deliberately
  // do NOT block `listen()` on the first live refresh (below), since a slow or
  // hung upstream must not delay (or, pre-timeout-fix, block) server startup.
  await loadSnapshotFromDisk();

  await app.listen({ host: config.host, port: config.port });
  app.log.info(`Backend listening on ${config.host}:${config.port}`);

  void refreshSnapshot().catch((error) => {
    app.log.error({ err: error }, 'Initial snapshot refresh failed');
  });

  setInterval(() => {
    void refreshSnapshot().catch((error) => {
      app.log.error({ err: error }, 'Background snapshot refresh failed');
    });
  }, config.refreshMs);

  async function shutdown(signal: string): Promise<void> {
    app.log.info(`Received ${signal}, flushing usage counters and shutting down`);
    usageCounterStore.stop();
    try {
      await usageCounterStore.flush();
    } catch (error) {
      app.log.error({ err: error }, 'Failed to flush usage counters on shutdown');
    }
    await app.close();
    process.exit(0);
  }

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

const isEntryPoint = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1] as string).href;

if (isEntryPoint) {
  void bootstrap().catch((error) => {
    console.error('Fatal startup error', error);
    process.exit(1);
  });
}
