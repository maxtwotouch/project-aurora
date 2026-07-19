# Deploying the backend

Provider-neutral notes for running `backend/` somewhere real. Nothing here is
specific to any particular host -- pick whichever runs a Docker image or a
long-lived Node process.

## Option A: Docker

The image is a multi-stage build (`deps` -> `build` -> `runtime`): it compiles
TypeScript in a throwaway stage and ships only the compiled `dist/`, the JSON
data it needs, and production `npm` dependencies. It runs as a non-root user.

**Build context must be the repo root**, not `backend/`, because
`backend/src/snapshot.ts` imports `src/data/spots.json`, which lives outside
`backend/`. Build and run from the repo root:

```bash
docker build -f backend/Dockerfile -t aurora-backend .

docker run -d \
  --name aurora-backend \
  -p 8080:8080 \
  -v aurora-backend-data:/app/backend/data \
  -e ADMIN_TOKEN=<a real, random token> \
  -e CORS_ORIGINS=https://your-frontend.example.com \
  aurora-backend

curl http://localhost:8080/v1/health
```

See `backend/.env.example` for every variable and its default.

## Option B: plain Node

No Docker required -- this is the same thing the container does internally.

```bash
cd backend
npm ci
npm run build
NODE_ENV=production ADMIN_TOKEN=<a real, random token> node dist/server.js
```

Whatever process supervisor you use (systemd, pm2, a platform's own
process manager, ...) should restart the process on crash and forward its
stdout/stderr (the app logs via Fastify's built-in logger, one JSON line per
request/event) to your log aggregator.

## Environment variables

All variables are optional; missing ones use the documented default. Invalid
values for the numeric ones (e.g. a non-numeric `PORT`) fail startup fast with
a clear error instead of silently falling back -- see `backend/src/config.ts`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | TCP port the server listens on. |
| `HOST` | `0.0.0.0` | Bind address. Use `0.0.0.0` in containers. |
| `REFRESH_MS` | `300000` (5 min) | How often the background job rebuilds the snapshot. |
| `ADMIN_TOKEN` | *(unset)* | Required header value (`x-admin-token`) for `POST /v1/admin/refresh`. **Unset means the route rejects everything (fails closed)** -- it never opens up by accident. Set a real, randomly generated token in any deployed environment. |
| `CORS_ORIGINS` | localhost Expo web origins | Comma-separated list of frontend origins allowed to call the API. Set this explicitly for any deployed frontend. |
| `STALE_SNAPSHOT_MS` | `1800000` (30 min) | How old the on-disk mirrored snapshot can be before `/v1/health` flags it stale after a restart. |
| `SOURCE_TIMEOUT_MS` | `10000` (10 s) | Timeout for outbound MET/NOAA calls before falling back to deterministic sample data. |
| `USAGE_RETENTION_DAYS` | `180` (days) | How long a usage-counter hour bucket (`type\|spotId\|hourBucket`) is kept before being pruned from memory and `backend/data/usage-stats.json`, on both server boot and every periodic flush. |
| `STATS_MIN_CELL` | `0` (off) | Small-cell/k-anonymity suppression threshold for `GET /v1/stats/usage`. When > 0, breakdown entries (`bySpot`/`byHour`/`byDay`) with a count below this value are omitted; totals remain exact. The owner must choose the real threshold before this endpoint's output is shared externally -- see `docs/privacy-usage-events.md`. |
| `FCM_PROJECT_ID` | *(unset)* | Firebase project id for the aurora push-alerts topic publisher (`backend/src/fcm.ts`). Owner-held; see `docs/setup-firebase-alerts.md`. |
| `FCM_SERVICE_ACCOUNT` | *(unset)* | Firebase service-account key as a single inline JSON string (not a file path). **Secret -- never commit a real value; set via `flyctl secrets set` or your provider's secret manager.** Leaving `FCM_PROJECT_ID`/`FCM_SERVICE_ACCOUNT` unset (either or both) is fully supported: the alerts engine still runs, but the publish step is inert (logs one line, sends nothing). See `docs/setup-firebase-alerts.md`. |

None of these have real values checked into the repo; `backend/.env.example`
holds placeholders only (`ADMIN_TOKEN=change-me`, clearly fake).

## Persisting `backend/data/`

The server mirrors its latest snapshot to `backend/data/latest-snapshot.json`
so a restart can serve stale-but-real data immediately, before the first live
refresh completes (see `backend/README.md`). This directory also holds
`usage-stats.json` (aggregate usage counters) and `alerts-state.json` (aurora
push-alerts night key / fired-tier state -- no user data, see
`backend/src/alerts.ts`); both are gitignored, locally-regenerated caches,
unlike the git-tracked `latest-snapshot.json` seed file.

Mount it as a volume so it survives container recreation/redeploys:

```bash
-v aurora-backend-data:/app/backend/data
```

The image ships with the git-tracked seed file already in that path, so a
brand-new volume starts with real (if aging) data rather than an empty store.

## Health checks

`GET /v1/health` is the endpoint for uptime/liveness checks. It returns
`200` with `{ ok: true, ... }` once a snapshot has ever been built (including
one loaded from the disk mirror on restart), and `{ ok: false, ... }` (still
`200`, by design -- this is a status body, not an HTTP error) before that.
Look at `stale` and `lastRefreshSucceeded` in the response to detect silent
degradation (e.g. the background refresh has been failing repeatedly).
The Docker image's own `HEALTHCHECK` hits this endpoint every 30s.

## Decisions left to the owner

This doc intentionally stops short of prescribing:

- **Hosting provider.** Any host that can run a container (or a long-lived
  Node process) and mount a small persistent volume works. No provider-
  specific config is included here.
- **Domain name and TLS.** Terminate TLS at whatever reverse proxy / load
  balancer / platform edge your provider offers; this app speaks plain HTTP
  and expects to sit behind that.
- **Generating a real `ADMIN_TOKEN`.** Use a proper random-token generator
  (e.g. `openssl rand -hex 32`) and store it in your provider's secret
  manager -- never in the repo, never in a committed `.env`.
- **Log retention/aggregation.** The app logs structured JSON to stdout;
  pick a retention window and aggregator (or your platform's built-in
  logging) appropriate for your compliance/cost needs.
