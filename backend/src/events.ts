import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getResolution, isValidCell } from 'h3-js';

import { getSpots } from './snapshot.js';
import { toHourBucket, toHourBucketFromUtcHour, usageCounterStore } from './usageStore.js';
import { DWELL_BUCKETS } from './types.js';
import type { DwellBucket, UsageEventInput, UsageEventType } from './types.js';

/**
 * PRIVACY INVARIANT: nothing person-derived is ever persisted or logged here.
 * Every incoming event is validated, then immediately folded into an
 * in-memory counter keyed by (type, UTC hour, and a small set of coarse
 * per-type dimensions — spotId / h3Cell / dwellBucket / recommendationId) —
 * see usageStore.ts. We never keep the raw event, its precise arrival
 * timestamp, request headers, IP address, or any other identifier.
 *
 * Tourism event types (spot_visit, recommended_spot_visit, zone_dwell — see
 * docs/analytics-pivot.md's 2026-08-22 amendment) are unlinked exactly like
 * the original three: no journey reconstruction happens here, each event is
 * folded into its own independent counter the instant it's validated, with
 * nothing that could re-associate two events with the same device/person.
 * `recommendationId` and `h3Cell` are both constrained to small, injection-
 * safe shapes (see RECOMMENDATION_ID_PATTERN / isValidZoneCell below) rather
 * than accepted as free-form strings, for the same reason spotId is
 * validated against the spot catalog: an unconstrained string field on a
 * public, unauthenticated endpoint is a row-level-data/injection risk even
 * when nothing here ever gets interpreted as a query.
 *
 * Logging invariant: this route disables Fastify's automatic per-request
 * access logging (via the route-scoped `logLevel: 'silent'` below), so the
 * built-in request/response log lines — which would otherwise include
 * remoteAddress/headers — are never emitted for /v1/events. The ONLY
 * logging this route ever performs is the sanitized `logRejection()` call
 * below, which logs strictly (route name, HTTP status code, a short fixed
 * error-message string) via the top-level app logger — never the request
 * object, body, headers, query string, or IP address.
 */

const ALLOWED_EVENT_TYPES: readonly UsageEventType[] = [
  'spot_view',
  'navigate_pressed',
  'spot_shared',
  'spot_visit',
  'recommended_spot_visit',
  'zone_dwell'
];
const MAX_BATCH_SIZE = 20;
// Small cap: a batch of 20 minimal events fits comfortably well under this.
const MAX_BODY_BYTES = 8 * 1024;
const ROUTE = '/v1/events';

// recommendationId: a small, injection-safe allowlist shape — lowercase
// alphanumerics plus `-`/`_`, 1-64 chars. Free-form strings would let a
// buggy or malicious client smuggle arbitrary row-level data into what's
// meant to be a bounded, aggregate-only counter dimension.
const RECOMMENDATION_ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

// h3 resolution-7 cell id, required for zone_dwell (see
// docs/analytics-pivot.md's "coarse zones" section: ~5 km² hexes,
// deliberately too coarse to identify a cabin or address). Uses h3-js
// (dependency-free) rather than a hand-rolled regex/bit check: an H3 cell id
// is a 64-bit bit-packed value (mode + resolution + base cell + per-
// resolution digit cells) whose resolution can't be verified from its string
// form by a simple prefix/length check alone -- e.g. a wrong-resolution cell
// can still be a 15-hex-char string starting with the right-looking digits
// while carrying meaningless trailing digit bits for resolution 7. isValidCell
// rejects any malformed/non-canonical index outright (bad mode, reserved
// bits set, unset digit bits beyond the claimed resolution, etc.), and
// getResolution reads the real resolution field back out -- together this
// correctly rejects a house-level (high-resolution) cell id, not just an
// obviously-malformed string.
function isValidZoneCell(value: unknown): value is string {
  return typeof value === 'string' && isValidCell(value) && getResolution(value) === 7;
}

// Built once at module init from the static spot catalog (see snapshot.ts),
// not recomputed per request.
const VALID_SPOT_IDS: ReadonlySet<string> = new Set(getSpots().map((spot) => spot.id));

function isAllowedEventType(value: unknown): value is UsageEventType {
  return typeof value === 'string' && (ALLOWED_EVENT_TYPES as readonly string[]).includes(value);
}

function isValidSpotId(value: unknown, validSpotIds: ReadonlySet<string>): value is string {
  return typeof value === 'string' && value.length > 0 && validSpotIds.has(value);
}

function isDwellBucket(value: unknown): value is DwellBucket {
  return typeof value === 'string' && (DWELL_BUCKETS as readonly string[]).includes(value);
}

function isRecommendationId(value: unknown): value is string {
  return typeof value === 'string' && RECOMMENDATION_ID_PATTERN.test(value);
}

// Hour-of-day only (0-23) -- never a full timestamp. See UsageEventInput's
// doc comment in types.ts for why the tourism event types carry this instead
// of relying purely on the server's current hour.
function isUtcHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;
}

/** Parses and validates the whole batch. Rejection is all-or-nothing: if any
 * single item in the batch is malformed/invalid, the entire batch is
 * dropped and nothing is stored — same convention the original three event
 * types already used (see the "rejects a batch larger than 20 events"/
 * "rejects an unknown event type" tests), now extended to every field of
 * every one of the six event types. */
function parseEvents(body: unknown, validSpotIds: ReadonlySet<string>): UsageEventInput[] | null {
  const items = Array.isArray(body) ? body : [body];

  if (items.length === 0 || items.length > MAX_BATCH_SIZE) {
    return null;
  }

  const parsed: UsageEventInput[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') return null;

    const record = item as Record<string, unknown>;
    const { type } = record;
    if (!isAllowedEventType(type)) return null;

    switch (type) {
      case 'spot_view':
      case 'navigate_pressed':
      case 'spot_shared': {
        if (!isValidSpotId(record.spotId, validSpotIds)) return null;
        parsed.push({ type, spotId: record.spotId });
        break;
      }
      case 'spot_visit': {
        if (!isValidSpotId(record.spotId, validSpotIds)) return null;
        if (!isUtcHour(record.utcHour)) return null;
        if (!isDwellBucket(record.dwellBucket)) return null;
        parsed.push({ type, spotId: record.spotId, utcHour: record.utcHour, dwellBucket: record.dwellBucket });
        break;
      }
      case 'recommended_spot_visit': {
        if (!isValidSpotId(record.spotId, validSpotIds)) return null;
        if (!isRecommendationId(record.recommendationId)) return null;
        if (!isUtcHour(record.utcHour)) return null;
        parsed.push({
          type,
          spotId: record.spotId,
          utcHour: record.utcHour,
          recommendationId: record.recommendationId
        });
        break;
      }
      case 'zone_dwell': {
        if (!isValidZoneCell(record.h3Cell)) return null;
        if (!isUtcHour(record.utcHour)) return null;
        if (!isDwellBucket(record.dwellBucket)) return null;
        parsed.push({ type, h3Cell: record.h3Cell, utcHour: record.utcHour, dwellBucket: record.dwellBucket });
        break;
      }
    }
  }

  return parsed;
}

/**
 * The ONLY logging /v1/events ever performs. Logs strictly a route name, an
 * HTTP status code, and a short fixed message string — never req/body/
 * headers/IP. Uses the top-level app logger (not `request.log`) on purpose:
 * `request.log` is silenced for this route (see `logLevel: 'silent'` on the
 * route below) so that automatic access logging cannot fire, but this
 * explicit, sanitized line still gets through.
 */
function logRejection(app: FastifyInstance, statusCode: number, message: string): void {
  app.log.warn({ route: ROUTE, statusCode }, message);
}

export function registerEventRoutes(app: FastifyInstance): void {
  app.post(
    '/v1/events',
    {
      bodyLimit: MAX_BODY_BYTES,
      // Disables Fastify's automatic request/response access logging for
      // this route so IPs, headers, and other request metadata that the
      // default logger would otherwise capture are never written to logs
      // for usage events. See logRejection() above for the sanitized
      // logging this route performs instead.
      logLevel: 'silent',
      // Catches errors raised before the handler runs (e.g. body-too-large,
      // malformed JSON) so we can emit a sanitized log line for them too,
      // instead of falling through to Fastify's default error logging.
      errorHandler(error: FastifyError, _request: FastifyRequest, reply: FastifyReply) {
        const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
        const message = statusCode === 413 ? 'Payload too large.' : 'Invalid request.';
        logRejection(app, statusCode, message);
        reply.code(statusCode).send({ ok: false, message });
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const events = parseEvents(request.body, VALID_SPOT_IDS);

      if (!events) {
        const message = 'Invalid event payload.';
        logRejection(app, 400, message);
        reply.code(400);
        return { ok: false, message };
      }

      // The original three event types carry no client-supplied time field
      // at all -- they're stamped with the server's own current UTC hour.
      // Computed once per request/batch (not per event), same as before.
      const serverHourBucket = toHourBucket();

      for (const event of events) {
        switch (event.type) {
          case 'spot_view':
          case 'navigate_pressed':
          case 'spot_shared':
            usageCounterStore.increment({ type: event.type, spotId: event.spotId, hourBucket: serverHourBucket });
            break;
          case 'spot_visit':
            usageCounterStore.increment({
              type: 'spot_visit',
              spotId: event.spotId,
              hourBucket: toHourBucketFromUtcHour(event.utcHour),
              dwellBucket: event.dwellBucket
            });
            break;
          case 'recommended_spot_visit':
            usageCounterStore.increment({
              type: 'recommended_spot_visit',
              spotId: event.spotId,
              hourBucket: toHourBucketFromUtcHour(event.utcHour),
              recommendationId: event.recommendationId
            });
            break;
          case 'zone_dwell':
            usageCounterStore.increment({
              type: 'zone_dwell',
              h3Cell: event.h3Cell,
              hourBucket: toHourBucketFromUtcHour(event.utcHour),
              dwellBucket: event.dwellBucket
            });
            break;
        }
      }

      reply.code(204);
      return null;
    }
  );
}
