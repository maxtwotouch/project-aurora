import Fastify from 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';

import { buildTonightSnapshot, getSpots } from './snapshot.js';
import { getLatestSnapshot, loadSnapshotFromDisk, setLatestSnapshot } from './store.js';

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const REFRESH_MS = Number(process.env.REFRESH_MS ?? 5 * 60 * 1000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:8081,http://127.0.0.1:8081')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

async function refreshSnapshot(): Promise<void> {
  const snapshot = await buildTonightSnapshot();
  await setLatestSnapshot(snapshot);
}

app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    callback(null, CORS_ORIGINS.includes(origin));
  }
});

app.get('/v1/health', async () => {
  const snapshot = getLatestSnapshot();
  if (!snapshot) {
    return {
      ok: false,
      hasSnapshot: false
    };
  }

  return {
    ok: true,
    hasSnapshot: true,
    updatedAt: snapshot.updatedAt,
    sourceFreshnessSec: Math.round((Date.now() - new Date(snapshot.updatedAt).getTime()) / 1000),
    dataQuality: snapshot.dataQuality
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
  if (!ADMIN_TOKEN || request.headers['x-admin-token'] !== ADMIN_TOKEN) {
    reply.code(401);
    return { ok: false, message: 'Unauthorized' };
  }

  await refreshSnapshot();
  const snapshot = getLatestSnapshot();
  return { ok: true, updatedAt: snapshot?.updatedAt ?? null };
});

async function bootstrap() {
  await loadSnapshotFromDisk();

  try {
    await refreshSnapshot();
  } catch (error) {
    app.log.error({ err: error }, 'Initial snapshot refresh failed');
  }

  setInterval(() => {
    void refreshSnapshot().catch((error) => {
      app.log.error({ err: error }, 'Background snapshot refresh failed');
    });
  }, REFRESH_MS);

  await app.listen({ host: HOST, port: PORT });
  app.log.info(`Backend listening on ${HOST}:${PORT}`);
}

void bootstrap().catch((error) => {
  app.log.error({ err: error }, 'Fatal startup error');
  process.exit(1);
});
