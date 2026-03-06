# Aurora Backend (Fastify)

## Endpoints

- `GET /v1/tonight`: precomputed snapshot for app home/feed
- `GET /v1/spots/:id`: spot details + hourly forecast + ranking
- `GET /v1/health`: freshness and fallback status
- `POST /v1/admin/refresh`: force refresh snapshot

## Run

```bash
npm install
npm run dev
```

## Environment

- `PORT` (default `8080`)
- `HOST` (default `0.0.0.0`)
- `REFRESH_MS` (default `300000` = 5 minutes)
