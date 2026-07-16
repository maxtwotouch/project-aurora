import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { getSpots } from './snapshot.js';
import { toHourBucket, usageCounterStore } from './usageStore.js';
import type { UsageEventInput, UsageEventType } from './types.js';

/**
 * PRIVACY INVARIANT: nothing person-derived is ever persisted or logged here.
 * Every incoming event is validated, then immediately folded into an
 * in-memory counter keyed by (type, spotId, UTC hour) — see usageStore.ts.
 * We never keep the raw event, its arrival timestamp beyond the hour it
 * falls in, request headers, IP address, or any other identifier.
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

const ALLOWED_EVENT_TYPES: readonly UsageEventType[] = ['spot_view', 'navigate_pressed', 'spot_shared'];
const MAX_BATCH_SIZE = 20;
// Small cap: a batch of 20 minimal events fits comfortably well under this.
const MAX_BODY_BYTES = 8 * 1024;
const ROUTE = '/v1/events';

// Built once at module init from the static spot catalog (see snapshot.ts),
// not recomputed per request.
const VALID_SPOT_IDS: ReadonlySet<string> = new Set(getSpots().map((spot) => spot.id));

function isAllowedEventType(value: unknown): value is UsageEventType {
  return typeof value === 'string' && (ALLOWED_EVENT_TYPES as readonly string[]).includes(value);
}

function parseEvents(body: unknown, validSpotIds: ReadonlySet<string>): UsageEventInput[] | null {
  const items = Array.isArray(body) ? body : [body];

  if (items.length === 0 || items.length > MAX_BATCH_SIZE) {
    return null;
  }

  const parsed: UsageEventInput[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') return null;

    const { type, spotId } = item as Record<string, unknown>;
    if (!isAllowedEventType(type)) return null;
    if (typeof spotId !== 'string' || spotId.length === 0 || !validSpotIds.has(spotId)) return null;

    parsed.push({ type, spotId });
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

      const hourBucket = toHourBucket();
      for (const event of events) {
        usageCounterStore.increment({ type: event.type, spotId: event.spotId, hourBucket });
      }

      reply.code(204);
      return null;
    }
  );
}
