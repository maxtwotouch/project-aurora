# Aurora Backend (Fastify)

## Endpoints

- `GET /v1/tonight`: precomputed snapshot for app home/feed
- `GET /v1/spots/:id`: spot details + hourly forecast + ranking
- `GET /v1/health`: freshness and fallback status
- `POST /v1/admin/refresh`: force refresh snapshot
- `POST /v1/events`: anonymous, aggregate-only usage collection (event types: `spot_view`, `navigate_pressed`, `spot_shared`). Body is `{ type, spotId }` or an array of up to 20 such events. Immediately folded into in-memory (type, spotId, UTC-hour) counters — no raw events, timestamps, IPs, or identifiers are ever stored. See `src/events.ts`, `src/usageStore.ts`, and `../docs/privacy-usage-events.md`.
- `GET /v1/stats/usage` (requires `x-admin-token`): aggregate-only usage counts by spot, hour, and day, for the municipality dataset. See `src/stats.ts`.

## Run

```bash
npm install
npm run dev
```

See `.env.example` for every environment variable this app reads (each with a
one-line comment). This app does not auto-load `.env` files (no `dotenv`
dependency) -- export these as real shell/process environment variables, or
have your process manager / container runtime inject them. For building/
running this as a deployed service (Docker or plain Node), required vs.
optional env vars, and health-check/persistence notes, see
[`docs/deploying.md`](../docs/deploying.md).

## Environment

- `PORT` (default `8080`)
- `HOST` (default `0.0.0.0`)
- `REFRESH_MS` (default `300000` = 5 minutes)
- `ADMIN_TOKEN` for `POST /v1/admin/refresh` and `GET /v1/stats/usage`
- `CORS_ORIGINS` comma-separated allowed frontend origins. Default only allows localhost development origins.
- `STALE_SNAPSHOT_MS` (default `1800000` = 30 minutes) — how old the on-disk mirrored snapshot can be before it's flagged as stale (`dataQuality.staleSnapshot`) after a restart.
- `SOURCE_TIMEOUT_MS` (default `10000` = 10 seconds) — timeout applied to every outbound call to MET/NOAA; a hung upstream aborts instead of stalling a refresh cycle.

## Restart survival

On boot, the server loads the last mirrored snapshot from `data/latest-snapshot.json` into memory *before* the first live refresh completes, so `/v1/tonight` can serve stale-but-real data immediately after a restart instead of a `503`. If the mirror is missing or unparseable, the store starts empty (a warning is logged; the server does not crash). If the loaded snapshot is older than `STALE_SNAPSHOT_MS`, its `dataQuality.staleSnapshot` flag is set to `true`.

**Cold-start caveat:** the "immediate, no-503" guarantee only holds when a disk mirror exists (i.e. the server has completed at least one refresh at some point in the past, e.g. a restart, rather than a true first-ever boot on a fresh checkout/volume). On a genuine cold start with no mirror on disk — or a corrupt one — `/v1/tonight` still returns `503` until the first live refresh completes. In that window, the frontend's `useForecast` hook (`src/hooks/useForecast.ts`) catches the failed/`503` backend call and falls back to calling MET/NOAA directly, so the app degrades gracefully rather than blocking on the backend.

## Health response

`GET /v1/health` returns (additively, existing fields are never removed):

```jsonc
{
  "ok": true,
  "hasSnapshot": true,
  "updatedAt": "2026-07-16T12:00:00.000Z",
  "sourceFreshnessSec": 42,
  "dataQuality": { "usingFallbackKp": false, "fallbackWeatherSpotIds": [], "usingFallbackSighting": false, "staleSnapshot": false },
  "snapshotAgeMs": 42000,
  "stale": false,
  "lastRefreshSucceeded": true,
  "lastRefreshAttemptAt": "2026-07-16T12:00:00.000Z",
  "lastRefreshError": null
}
```

`lastRefreshSucceeded` / `lastRefreshAttemptAt` / `lastRefreshError` reflect the most recent *live* refresh attempt (independent of whether the currently-served snapshot came from the disk mirror), so an uptime check can alert on silent degradation (e.g. `stale: true` or repeated `lastRefreshSucceeded: false`).
