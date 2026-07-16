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

## Environment

- `PORT` (default `8080`)
- `HOST` (default `0.0.0.0`)
- `REFRESH_MS` (default `300000` = 5 minutes)
- `ADMIN_TOKEN` for `POST /v1/admin/refresh` and `GET /v1/stats/usage`
- `CORS_ORIGINS` comma-separated allowed frontend origins. Default only allows localhost development origins.
