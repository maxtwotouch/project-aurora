# Aurora Backend (Fastify)

## Endpoints

- `GET /v1/tonight`: precomputed snapshot for app home/feed
- `GET /v1/spots/:id`: spot details + hourly forecast + ranking
- `GET /v1/health`: freshness and fallback status
- `POST /v1/admin/refresh`: force refresh snapshot
- `POST /v1/events`: anonymous, aggregate-only usage collection (event types: `spot_view`, `navigate_pressed`, `spot_shared`). Body is `{ type, spotId }` or an array of up to 20 such events. Immediately folded into in-memory (type, spotId, UTC-hour) counters — no raw events, timestamps, IPs, or identifiers are ever stored. See `src/events.ts`, `src/usageStore.ts`, and `../docs/privacy-usage-events.md`.
- `GET /v1/stats/usage` (requires `x-admin-token`): aggregate-only usage counts by spot, hour, and day, for the municipality dataset. See `src/stats.ts`.

## Aurora push alerts

`src/alerts.ts` evaluates "tonight looks good" push-alert triggers after every successful snapshot refresh (see `refreshSnapshot()` in `src/server.ts`), and `src/fcm.ts` publishes to Firebase Cloud Messaging topics. See `../docs/design-aurora-alerts.md` for the full design (Option B: topic-based FCM -- this backend never requests, sees, or stores an individual device/registration token; devices subscribe client-side to a threshold-tier topic, and Google's FCM servers hold the device↔topic mapping, not us) and `../docs/setup-firebase-alerts.md` for the owner's one-time Firebase setup steps.

- Two tiers, matching `chanceFromScore` in `src/snapshot.ts`: `alerts-ge70` ("Only great nights", score ≥ 70) and `alerts-ge45` ("Any decent chance", score ≥ 45).
- Hysteresis (a tier only fires again after dipping 10 points below its own threshold), quiet hours (01:00–16:00 Europe/Oslo, suppressed pushes are remembered and fire once quiet hours end if still above threshold), a hard cap of 1 push per night total across both tiers, and staleness guards (never fires on fallback KP/weather data or when `darkness.seasonClosed`) are all implemented in `src/alerts.ts` — see that file's doc comments for the exact rules.
- State (`{ nightKey, firedTiers, totalFired }` — no user data, ever) is mirrored to `data/alerts-state.json` the same way `src/usageStore.ts` mirrors usage counters (atomic write, corrupt/missing mirror → clean state, no crash).
- The FCM publisher is configured via `FCM_PROJECT_ID` / `FCM_SERVICE_ACCOUNT` (see `.env.example`). **Both are owner-held secrets, never committed.** Leaving either unset is a fully supported "inert" mode: the engine still evaluates and persists state, it just skips the actual publish (logs one info line instead).

**Process note for reviewers:** `../docs/design-aurora-alerts.md` is titled "Status: draft, awaiting owner sign-off" and lists provider choice / thresholds / CODEOWNERS additions under "Decisions for the owner" (§5), not marked confirmed in the doc itself. The doc's own rough implementation plan (§6) calls the provider-wiring step "OWNER REVIEW REQUIRED" / "the hard human-review gate," independent of which provider is chosen. This PR implements that wiring (per its task brief), but nothing here is merged automatically, and the publisher stays inert until the owner deliberately sets the two secrets above — see the PR description for the fuller flag.

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
- `USAGE_RETENTION_DAYS` (default `180`) — how many days a usage-counter hour bucket is kept before being pruned from memory and the `usage-stats.json` mirror (on `load()` and every `flush()`). See `src/usageStore.ts` and `../docs/privacy-usage-events.md`.
- `STATS_MIN_CELL` (default `0` = off) — minimum per-cell count for `GET /v1/stats/usage`'s `bySpot`/`byHour`/`byDay` breakdowns; entries below the threshold are omitted (totals stay exact). Small-cell/k-anonymity suppression knob; the owner picks the real threshold. See `src/stats.ts` and `../docs/privacy-usage-events.md`.
- `FCM_PROJECT_ID` / `FCM_SERVICE_ACCOUNT` (both unset by default) — Firebase project id and service-account key (inline JSON, not a file path) for the aurora push-alerts publisher. Owner-held secrets, never committed; unset = the publisher stays inert. See "Aurora push alerts" above and `../docs/setup-firebase-alerts.md`.

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

## Known architecture ceilings

Two known limitations of the current design, called out here so they aren't
mistaken for oversights:

- **Single-instance in-memory snapshot + JSON mirror.** The latest snapshot
  lives in a single process's memory (`src/store.ts`) and is mirrored to
  `data/latest-snapshot.json` on disk. This does not horizontally scale --
  running multiple backend instances would each refresh and mirror
  independently, with no shared source of truth, so today's deployment model
  assumes exactly one running instance. A restart (deploy, crash-restart,
  etc.) has a brief staleness window: the process reloads the on-disk mirror
  immediately (see "Restart survival" above) so it doesn't 503, but that
  reloaded snapshot is only as fresh as the last successful refresh before
  the restart, until the next live refresh completes.
- **Duplicated frontend/backend scoring.** The scoring model
  (`backend/src/scoring.ts` + `backend/src/solar.ts`) has an
  independently-maintained twin in the frontend
  (`src/scoring/score.ts` + `src/scoring/solar.ts`), used when the app talks
  to MET/NOAA directly instead of this backend. The two must be kept in sync
  by hand -- there's drift risk any time one is edited without the other.
  This is mitigated today by cross-check tests in both test suites that pin
  identical fixture inputs to identical expected outputs (see
  `backend/test/scoring.test.ts` and `test/scoring.test.ts`), so an
  un-mirrored edit fails at least one twin's own test suite. A longer-term
  option is unifying the two into one shared package, deferred for now to
  keep the frontend's direct-source fallback path dependency-free.
