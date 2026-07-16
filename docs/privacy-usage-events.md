# Privacy: anonymous usage events

This document describes the usage-collection feature added in `backend/src/events.ts`,
`backend/src/stats.ts`, and `backend/src/usageStore.ts`. Its purpose is to give Tromsø
municipality a dataset showing **where and when** tourists head out to see the northern
lights, as counts — never as records about people.

This feature is privacy-sensitive per `CLAUDE.md` and requires human review before merge.

## What is collected

Three anonymous, allowlisted event types, sent by the app when a user views a spot,
taps navigate, or shares a spot:

- `spot_view`
- `navigate_pressed`
- `spot_shared`

Each event carries only:

- `type` — one of the three values above (anything else is rejected with HTTP 400)
- `spotId` — validated against the real spot catalog (invalid ids are rejected with HTTP 400)

On arrival, the event is **immediately aggregated** into an in-memory counter keyed by
`(type, spotId, hourBucket)`, where `hourBucket` is the current UTC hour formatted as
`YYYY-MM-DDTHH` (e.g. `2026-07-16T20`). The counter is incremented by 1; nothing else is
kept. The counters are periodically (every 30s) and on shutdown mirrored atomically to
`backend/data/usage-stats.json`, and reloaded from that file on boot — this file only ever
contains `{ type, spotId, hourBucket } -> count` entries.

## What is deliberately NOT collected

- No raw/row-level events. There is no table or log of individual requests — the counter
  increment is the only thing that ever exists past the moment a request is handled.
- No IP addresses. The `/v1/events` route is registered with a silenced per-route log
  level so Fastify's automatic request/response access logging (which would otherwise
  capture `remoteAddress`/`remotePort`) never fires for it, and the handler itself never
  reads or stores `request.ip` or any header. When a request to this route is rejected
  (invalid payload, oversized body, malformed JSON), the route logs exactly one sanitized
  line via the top-level app logger — containing only the route name, the HTTP status
  code, and a short fixed error-message string (e.g. `"Invalid event payload."`) — and
  nothing derived from the request itself (no body, headers, query string, or IP).
  - Update: the repo-wide follow-up noted here has since been resolved -- see "Logging on
    other routes" under "Open items for human / GDPR review" below. Every route's
    `req`/`res` log serializers are now overridden in `buildApp()`
    (`backend/src/server.ts`), so no route anywhere in this backend logs
    `remoteAddress`/`remotePort`/headers, not just `/v1/events`.
- No device/session identifiers, cookies, or any client-generated ID. The API accepts no
  such field and returns none (204 No Content, no headers set beyond the standard ones).
- No user agent or other request headers are stored or logged.
- No precise coordinates — only the coarse `spotId` (a small, fixed set of named viewing
  spots), never lat/lon of the requester.
- No timestamps finer than the hour. There is no minute/second/millisecond precision
  anywhere in storage — only the UTC hour bucket.
- No free-text fields. There is nowhere in the schema for a user-submitted string.

## Retention

There is no raw data to retain or expire — counters are the only artifact, and a counter
for a given `(type, spotId, hour)` is indistinguishable from any other request that landed
in that same hour for that same spot. Practically, retention is bounded by:

- An in-memory cap of 200,000 distinct `(type, spotId, hourBucket)` keys. Beyond the cap,
  new keys are dropped and a data-quality warning is logged (the service degrades rather
  than crashing or silently growing memory without bound).
- The JSON mirror file (`backend/data/usage-stats.json`) grows roughly with the number of
  distinct spot/hour/type combinations actually seen — at 3 event types and today's spot
  catalog size, this is a small, slowly growing file, not an unbounded log.

Hour-bucket keys older than `USAGE_RETENTION_DAYS` (default 180 days) are pruned from
memory on `load()` (server boot) and again on every `flush()` (every 30s and on
shutdown), so the JSON mirror does not grow unbounded with age — see "Retention policy /
bucket rotation" under "Open items for human / GDPR review" below.

## Access control

`GET /v1/stats/usage` (the read side intended for the municipality) is gated by the same
`ADMIN_TOKEN` mechanism as `POST /v1/admin/refresh`. It is not a public endpoint in this
iteration. It returns aggregates only: totals, and breakdowns by spot, by hour, and by
day — never anything resembling a row-level record (there is nothing row-level to
return).

## Open items for human / GDPR review

- ~~**Consent banner.**~~ **Resolved (owner decision, 2026-07-16): opt-in required.**
  The app shows a consent prompt on first launch (`src/components/ConsentModal.tsx`);
  nothing is ever sent unless the user explicitly accepts (`src/analytics/consent.ts`,
  `src/analytics/events.ts`). Decline means zero collection, with no re-prompt; the
  choice can be changed later via the "Anonymous usage sharing" toggle on the All Spots
  screen. Revoking consent drops any queued, unsent events.
- **Data-sharing agreement with the municipality.** Formalize what aggregate data is
  shared, how often, and under what terms, before `GET /v1/stats/usage` is used
  operationally by a third party.
- ~~**Retention policy / bucket rotation.**~~ **Resolved:** `backend/src/usageStore.ts`
  now enforces `USAGE_RETENTION_DAYS` (default 180 days, parsed the same fail-soft way as
  `STALE_SNAPSHOT_MS`/`SOURCE_TIMEOUT_MS` -- missing/invalid falls back to the default
  rather than failing startup). Hour-bucket keys older than the cutoff (and any key whose
  hour-bucket segment isn't a parseable date at all) are pruned from memory on `load()`
  and again on every `flush()`, so the JSON mirror is continuously bounded by age, not
  just by the distinct-key cap. Pruning logs a single count-only warning (never the
  pruned keys themselves). See `USAGE_RETENTION_DAYS` in `backend/README.md` /
  `docs/deploying.md` / `backend/.env.example`.
- ~~**Logging on other routes.**~~ **Resolved:** `backend/src/server.ts`'s `buildApp()`
  now configures Fastify's logger with custom `req`/`res` serializers (`logSerializers`,
  exported from `server.ts`) so **every** route -- not just `/v1/events` -- only ever
  logs `{ method, url }` for requests and `{ statusCode }` for responses; `remoteAddress`,
  `remotePort`, host, and headers are never serialized into the log stream for any
  route. Log levels/behavior are otherwise unchanged. Verified empirically by booting the
  built server, hitting several routes, and grepping the emitted log lines for
  `remoteAddress`/`remotePort` (absent) and `method`/`url`/`statusCode` (present); see
  `backend/test/server-logging.test.ts` for the automated version of the same check.
- **Public exposure of `/v1/stats/usage`.** Confirm the intended long-term access model
  (shared token vs. a dedicated municipality-facing service/API key) before this endpoint
  is used outside of internal/manual access.
- **Small-cell / k-anonymity risk.** A count of 1 for a given `(type, spotId, hour)` in a
  low-traffic hour can, in practice, correlate to a single individual's action even though
  no identifier is stored. **Mechanism implemented, threshold decision pending owner:**
  `GET /v1/stats/usage` now supports `STATS_MIN_CELL` (`backend/src/stats.ts`, default `0`
  = off). When set > 0, any `bySpot`/`byHour`/`byDay` breakdown entry whose `total` falls
  below the threshold is omitted entirely from that breakdown (never zeroed-in-place);
  `totalEvents`/`totalsByType` remain exact regardless (computed over every record, never
  suppressed). The response envelope always includes `suppression: { minCell,
  suppressedCells }` so a consumer can tell suppression is active and how many cells were
  hidden. The owner still needs to decide and set the actual threshold (and confirm
  whether it should apply before any data is shared with the municipality) --  this item
  makes it a configurable knob, it does not choose a value.
  - **Caveat: this suppression is partial, not a k-anonymity guarantee.** Omitting only
    the small cells is defeatable by subtraction -- if exactly one cell in a breakdown is
    suppressed, its value can be recovered exactly as (exact total) minus (sum of the
    visible cells). The standard fix is complementary suppression (hiding a second,
    otherwise-visible cell per breakdown whenever exactly one cell was suppressed by the
    threshold), which is not implemented here. This is left as a documented follow-up for
    the owner to request before any data leaves the org.
- **Data integrity / spoofing.** `POST /v1/events` is intentionally unauthenticated (by
  design, to keep it simple and anonymous for an MVP), which means the counters can be
  inflated by bots or replayed requests with no way to distinguish real usage from noise.
  This is acceptable for an MVP but the dataset should not be treated as authoritative for
  decisions until rate limiting and/or lightweight request signing is added.
- **Timing-safe admin-token comparison.** `GET /v1/stats/usage` and `POST /v1/admin/refresh`
  both compare `x-admin-token` with `===`, which is not constant-time and could in theory
  leak information via timing side channels. Follow-up: switch both to a constant-time
  comparison (e.g. `crypto.timingSafeEqual`) since they share the same token mechanism.
