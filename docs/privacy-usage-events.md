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
  - Note for human reviewers: this repo's other routes currently use Fastify's default
    logger (`logger: true`), whose default request serializer does include the caller's
    IP. That pre-existing behavior on the other endpoints is out of scope for this change
    but worth a follow-up review.
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

There is currently no scheduled deletion/rotation of old hour buckets from the JSON
mirror — see open items below.

## Access control

`GET /v1/stats/usage` (the read side intended for the municipality) is gated by the same
`ADMIN_TOKEN` mechanism as `POST /v1/admin/refresh`. It is not a public endpoint in this
iteration. It returns aggregates only: totals, and breakdowns by spot, by hour, and by
day — never anything resembling a row-level record (there is nothing row-level to
return).

## Open items for human / GDPR review

- **Consent banner.** Decide whether the app needs an in-app notice/consent step before
  sending these anonymous aggregate events, even though no personal data is collected,
  for transparency and applicable regulatory reasons.
- **Data-sharing agreement with the municipality.** Formalize what aggregate data is
  shared, how often, and under what terms, before `GET /v1/stats/usage` is used
  operationally by a third party.
- **Retention policy / bucket rotation.** Decide on and implement an explicit retention
  duration for hour-bucket counters (e.g. auto-drop buckets older than N days) rather than
  relying only on the distinct-key cap as an implicit ceiling.
- **Logging on other routes.** As noted above, other endpoints in this backend use
  Fastify's default logger, whose default serializers include caller IP. Consider whether
  that should be scrubbed repo-wide, independent of this feature.
- **Public exposure of `/v1/stats/usage`.** Confirm the intended long-term access model
  (shared token vs. a dedicated municipality-facing service/API key) before this endpoint
  is used outside of internal/manual access.
- **Small-cell / k-anonymity risk.** A count of 1 for a given `(type, spotId, hour)` in a
  low-traffic hour can, in practice, correlate to a single individual's action even though
  no identifier is stored. Before any data leaves the org (e.g. is shared with the
  municipality), the owner must pick and implement a minimum-cell-size suppression or
  rounding policy (e.g. suppress or bucket counts below N, or roll up to coarser time
  windows in low-traffic periods).
- **Data integrity / spoofing.** `POST /v1/events` is intentionally unauthenticated (by
  design, to keep it simple and anonymous for an MVP), which means the counters can be
  inflated by bots or replayed requests with no way to distinguish real usage from noise.
  This is acceptable for an MVP but the dataset should not be treated as authoritative for
  decisions until rate limiting and/or lightweight request signing is added.
- **Timing-safe admin-token comparison.** `GET /v1/stats/usage` and `POST /v1/admin/refresh`
  both compare `x-admin-token` with `===`, which is not constant-time and could in theory
  leak information via timing side channels. Follow-up: switch both to a constant-time
  comparison (e.g. `crypto.timingSafeEqual`) since they share the same token mechanism.
