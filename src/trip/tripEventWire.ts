/**
 * Pure translation from this app's internal trip-event intent shapes (see
 * presenceCore.ts / recommendationAttribution.ts / zoneDiscovery.ts) to the
 * backend's wire shape -- no react-native import, so this is directly
 * unit-testable under plain node:test (see test/tripEventWire.test.ts),
 * unlike src/trip/tripEventClient.ts (which imports react-native for
 * AppState/fetch and can't load outside an RN environment). Extracted from
 * tripEventClient.ts as its own file (post-review fix) so the translation
 * itself -- not just its effect inside the client -- is directly tested.
 *
 * WIRE FORMAT (per the finalized parallel backend-PR contract note): the
 * backend's field name for the hour bucket is `utcHour` on every event type,
 * including the three that this app's own pure trip modules internally call
 * `timeBucket` (spot_visit, recommended_spot_visit, zone_dwell -- see
 * presenceCore.ts/zoneDiscovery.ts's own doc comments on why THEY chose
 * `timeBucket`). `toWirePayload()` below is the ONE place that translates
 * `timeBucket` -> `utcHour` at the send boundary; `spot_presence`/
 * `spot_presence_long` already use `utcHour` internally, so those pass
 * through unchanged. The merged pure modules (presenceCore.ts,
 * recommendationAttribution.ts, zoneDiscovery.ts) are deliberately NOT
 * renamed to match -- this is a wire-serialization concern, not a change to
 * their own documented intent shapes.
 *
 * `recommendationId` must additionally match the backend's
 * `^[a-z0-9_-]{1,64}$` validator; `toWirePayload()` drops (returns `null`
 * for) any `recommended_spot_visit` whose id fails that check, rather than
 * letting one malformed item fail the entire batch atomically (see
 * backend/src/events.ts's `parseEvents`, which rejects a whole batch on any
 * single invalid item) -- this app only ever mints
 * attributionStore.ts's `TONIGHT_BEST_SPOT_RECOMMENDATION_ID` today, which
 * satisfies the pattern, so this is defense in depth, not an expected path.
 */

import type { DwellBucket, PresenceIntent } from './presenceCore';
import type { RecommendedSpotVisitIntent } from './recommendationAttribution';
import type { ZoneDwellIntent } from './zoneDiscovery';

export type TripEventIntent = PresenceIntent | RecommendedSpotVisitIntent | ZoneDwellIntent;

/** The backend wire shape -- `utcHour` throughout, per the finalized backend contract (see module header). */
export type TripEventWirePayload =
  | { type: 'spot_presence'; spotId: string; utcHour: number }
  | { type: 'spot_presence_long'; spotId: string; utcHour: number }
  | { type: 'spot_visit'; spotId: string; utcHour: number; dwellBucket: DwellBucket }
  | { type: 'recommended_spot_visit'; spotId: string; recommendationId: string; utcHour: number }
  | { type: 'zone_dwell'; h3Cell: string; utcHour: number; dwellBucket: DwellBucket };

export const RECOMMENDATION_ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

/**
 * Translates one internal intent into the backend's wire shape, or `null`
 * to drop it (currently only possible for a `recommended_spot_visit` whose
 * `recommendationId` fails `RECOMMENDATION_ID_PATTERN` -- see module
 * header). Pure: no I/O, no randomness, deterministic for a given intent.
 */
export function toWirePayload(intent: TripEventIntent): TripEventWirePayload | null {
  switch (intent.type) {
    case 'spot_presence':
    case 'spot_presence_long':
      return { type: intent.type, spotId: intent.spotId, utcHour: intent.utcHour };
    case 'spot_visit':
      return { type: 'spot_visit', spotId: intent.spotId, utcHour: intent.timeBucket, dwellBucket: intent.dwellBucket };
    case 'recommended_spot_visit':
      if (!RECOMMENDATION_ID_PATTERN.test(intent.recommendationId)) return null;
      return {
        type: 'recommended_spot_visit',
        spotId: intent.spotId,
        recommendationId: intent.recommendationId,
        utcHour: intent.timeBucket
      };
    case 'zone_dwell':
      return { type: 'zone_dwell', h3Cell: intent.h3Cell, utcHour: intent.timeBucket, dwellBucket: intent.dwellBucket };
    default:
      return null;
  }
}

/**
 * Translates a whole batch, dropping (not failing) any individual item
 * `toWirePayload` rejects -- the small helper `tripEventClient.ts`'s
 * `postBatch` calls, extracted here so the "drop-only-the-bad-item"
 * behavior over an array is itself covered by a pure test too.
 */
export function toWireBatch(intents: readonly TripEventIntent[]): TripEventWirePayload[] {
  const result: TripEventWirePayload[] = [];
  for (const intent of intents) {
    const wire = toWirePayload(intent);
    if (wire !== null) result.push(wire);
  }
  return result;
}
