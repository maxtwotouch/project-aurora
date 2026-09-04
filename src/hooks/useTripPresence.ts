import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

import spotsData from '../data/spots.json';
import { getTourismConsent, useTourismConsent } from '../analytics/tourismConsent';
import type { TourismConsentState } from '../analytics/tourismConsent';
import { getStoredItem, setStoredItem } from '../lib/storage';
import { solarElevationDeg } from '../scoring/solar';
import { attributeArrival, resetAttributionStore } from '../trip/attributionStore';
import { nightKeyOf } from '../trip/nightKey';
import {
  DEFAULT_PRESENCE_CONFIG,
  INITIAL_PRESENCE_STATE,
  advancePresence,
  endPresenceSession,
  spotsToGeofences
} from '../trip/presenceCore';
import type { PresenceSample, PresenceState, SpotGeofence } from '../trip/presenceCore';
import { enqueueTripEvents, flushFinalTripEvents } from '../trip/tripEventClient';
import type { TripEventIntent } from '../trip/tripEventClient';
import { shouldFlushStopIntents } from '../trip/tripEventGate';
import type { TripPresenceStopReason } from '../trip/tripEventGate';
import { isTripSessionActive, noteTripArrival, useTripSession } from '../trip/tripSession';
import { TROMSO_CENTER, TROMSO_URBAN_EXCLUSION_CELLS } from '../trip/urbanExclusion';
import {
  DEFAULT_ZONE_MAX_GAP_MS,
  INITIAL_NIGHT_DEDUPE_STATE,
  INITIAL_ZONE_DWELL_STATE,
  ZONE_DWELL_MS,
  classifyZoneDwell
} from '../trip/zoneDiscovery';
import type { NightDedupeState, ZoneDwellState } from '../trip/zoneDiscovery';

/**
 * The shared foreground presence engine -- one `Location.watchPositionAsync`
 * subscription that serves TWO independent roles at once (see
 * docs/design-trip-tracking.md, docs/analytics-pivot.md's amendment, and
 * src/trip/tripEventGate.ts's header for the full consent-layering
 * rationale):
 *
 *   (a) BASELINE TOURISM MEASUREMENT -- the identity-free, aggregate
 *       spot_presence/spot_presence_long/spot_visit/recommended_spot_visit/
 *       zone_dwell pipeline this file has always driven, gated end-to-end on
 *       tourism-insights consent (src/analytics/tourismConsent.ts).
 *   (b) TRIP MODE'S OWN "NEARBY / VISITED THIS TRIP" FEATURE -- a product
 *       feature (src/trip/tripSession.ts) that wants live position samples
 *       of its own, entirely independent of whether tourism consent was
 *       ever granted. An active trip session records arrivals into its own
 *       in-memory `visitedSpotIds` list via `noteTripArrival` -- never
 *       transmitted, never gated on any consent, discarded when the session
 *       ends.
 *
 * Mount once, at the app root (see App.tsx) -- this hook renders nothing and
 * returns nothing; it exists purely for its effects.
 *
 * GATING is two independent questions that must not be conflated:
 *
 *   1. MAY THE SAMPLER RUN AT ALL (`shouldRun()`, below)? Yes when
 *      `(getTourismConsent() === 'accepted' || isTripSessionActive())` AND
 *      the app is foregrounded AND foreground location permission is
 *      granted (requested here, lazily, the first time `shouldRun()` is
 *      true -- "at the point of relevance" per Apple's own guidance, quoted
 *      in docs/design-trip-tracking.md section 3 -- never on cold start
 *      regardless of consent or session state). Either tourism consent OR
 *      an active trip session is sufficient to run the sampler -- neither
 *      implies the other, and both can hold at once.
 *      PERMISSION-REVOCATION ASSUMPTION: revoking foreground location
 *      permission requires leaving this app (iOS Settings, or Android's
 *      equivalent) -- so the AppState background handler below already
 *      covers the common case (the app backgrounds the instant the user
 *      goes to revoke it), and the foreground re-check in `start()` covers
 *      the return trip; Android's "only this time" one-shot grant, which
 *      CAN auto-revoke without the user visiting Settings, is caught the
 *      same way: the next `start()` (next foreground, or the next
 *      re-evaluation) re-checks `getForegroundPermissionsAsync()` before
 *      trusting it. `watchPositionAsync`'s own `errorHandler` below is an
 *      additional, defensive `permission-lost` stop for the rarer case
 *      where a running subscription itself errors out.
 *   2. MAY A SAMPLE BE EMITTED OVER THE NETWORK? Decided SOLELY by tourism
 *      consent, via `enqueueTripEvents` -> `mayEmitTripEvents`
 *      (tripEventGate.ts) -- an active trip session never opens this gate.
 *      Sampling that runs purely to support a trip session with tourism
 *      consent off therefore never sends anything; the gate stays closed
 *      the entire time.
 *      `EXPO_PUBLIC_USE_BACKEND`/`EXPO_PUBLIC_API_BASE_URL` are also
 *      checked, deeper, inside tripEventClient.ts -- collection can still
 *      run locally without a configured backend, but nothing is ever queued
 *      to send; see that module.
 *
 * Any change relevant to `shouldRun()` (tourism consent, trip session
 * active-ness, or AppState) is re-evaluated -- see the "Re-evaluation
 * effect" below, and tripEventGate.ts's `shouldFlushStopIntents` for the
 * reason-keyed flush/discard decision the `stop()` function defers to (a
 * `consent-revoked` stop DISCARDS its closing summary outright rather than
 * sending it, per the "consent off stops collection immediately" fix; every
 * other reason flushes it only while consent is still 'accepted' -- see
 * that function's own doc comment).
 *
 * SAMPLING PARAMETERS (battery-conscious, documented per the task):
 *   - `Location.Accuracy.Balanced` (~100m, WiFi/cell-assisted rather than
 *     raw GPS) -- plenty for 500m-radius spot geofences and ~5km^2 zone
 *     cells; the same accuracy src/hooks/useUserLocation.ts already uses for
 *     its one-shot map-centering read.
 *   - `distanceInterval: 50` meters -- the primary throttle on both
 *     platforms; a device sitting still (the common case: someone watching
 *     the sky at a spot) produces no updates at all between samples.
 *   - `timeInterval: 60_000` ms (1 minute) -- honored by Android as a
 *     minimum time between updates; iOS's CLLocationManager has no
 *     equivalent throttle and is driven by `distanceInterval` alone (a
 *     platform limitation, not a bug in this config).
 *   Together: a stationary device effectively stops sampling; a moving one
 *   samples at most once a minute or every 50m, whichever comes first.
 *
 * DARKNESS/URBAN INPUTS for zone discovery (documented per the task):
 *   - `isDark`: `solarElevationDeg(...) < -6` at TROMSO_CENTER -- civil
 *     twilight, a deliberately LOOSER gate than the `darknessFactor`
 *     "fully dark" (<= -11deg) threshold src/scoring/solar.ts uses for
 *     aurora-visibility SCORING. Zone discovery only needs "plausibly dark
 *     enough that a real aurora-hunter could be out looking", not "the
 *     scoring model's honest visibility floor" -- using the stricter
 *     threshold here would under-collect during the -6..-11 twilight ramp
 *     when people are already out and watching.
 *   - `nightKeyOf`: src/trip/nightKey.ts, the Oslo hour<6-rollback
 *     convention mirrored from src/scoring/season.ts / src/api/kp.ts.
 *   - `urbanExclusion`: src/trip/urbanExclusion.ts's
 *     `TROMSO_URBAN_EXCLUSION_CELLS`, a fixed H3 res-7 k-ring computed once
 *     at module init.
 *
 * ZONE DEDUPE PERSISTENCE: `NightDedupeState` (the "already reported
 * tonight" cell set) is the one piece of trip-presence state that outlives
 * a single app session by design (zoneDiscovery.ts's own header explains
 * why) -- persisted to `aurora.zoneDedupe.v1` via src/lib/storage.ts,
 * device-only, read once on mount and rewritten whenever it changes.
 * `PresenceState`/`ZoneDwellState` (the CURRENT-visit/CURRENT-cell
 * ephemeral trackers) are NEVER persisted -- see presenceCore.ts's own
 * "caller MUST hold PresenceState in memory only" contract.
 */

type SpotJson = { id: string; lat: number; lon: number };

const SAMPLE_ACCURACY = Location.Accuracy.Balanced;
const SAMPLE_DISTANCE_INTERVAL_M = 50;
const SAMPLE_TIME_INTERVAL_MS = 60_000;

const ZONE_DEDUPE_STORAGE_KEY = 'aurora.zoneDedupe.v1';

function isDark(timestampMs: number): boolean {
  return solarElevationDeg(timestampMs, TROMSO_CENTER.lat, TROMSO_CENTER.lon) < -6;
}

/**
 * May the sampler run right now? True when tourism consent is accepted OR a
 * trip session is active, AND the app is foregrounded -- see the module
 * header's "GATING" section 1. Reads live module state directly (no hook
 * closures) so it can be called identically from `start()`, the
 * re-evaluation effect, and the AppState listener without going stale.
 */
function shouldRun(): boolean {
  return (getTourismConsent() === 'accepted' || isTripSessionActive()) && AppState.currentState === 'active';
}

function parseStoredZoneDedupe(raw: string | null): NightDedupeState {
  if (!raw) return INITIAL_NIGHT_DEDUPE_STATE;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { nightKey?: unknown }).nightKey === 'string' &&
      Array.isArray((parsed as { emittedCellIds?: unknown }).emittedCellIds) &&
      (parsed as { emittedCellIds: unknown[] }).emittedCellIds.every((id) => typeof id === 'string')
    ) {
      return parsed as NightDedupeState;
    }
  } catch {
    // Fall through to the initial/empty state below.
  }
  return INITIAL_NIGHT_DEDUPE_STATE;
}

export function useTripPresence(): void {
  const { state: tourismConsent, loaded: tourismConsentLoaded } = useTourismConsent();
  const tripSession = useTripSession();

  const geofencesRef = useRef<SpotGeofence[]>(spotsToGeofences(spotsData as SpotJson[]));
  const presenceStateRef = useRef<PresenceState>(INITIAL_PRESENCE_STATE);
  const zoneStateRef = useRef<ZoneDwellState>(INITIAL_ZONE_DWELL_STATE);
  const zoneDedupeRef = useRef<NightDedupeState>(INITIAL_NIGHT_DEDUPE_STATE);
  const watcherRef = useRef<{ remove: () => void } | null>(null);
  const runningRef = useRef(false);
  // Guards against a start()/stop() racing an in-flight watchPositionAsync
  // call (e.g. gating flips off while permission/subscription setup is
  // still awaiting native calls).
  const startTokenRef = useRef(0);
  // Tracks the previous tourism-consent value across the re-evaluation
  // effect so it can tell "consent was just revoked" apart from "a trip
  // session just ended" -- both can leave `shouldRun()` false, but they
  // resolve to different stop reasons (see that effect below).
  const previousTourismConsentRef = useRef<TourismConsentState>(tourismConsent);

  useEffect(() => {
    let cancelled = false;
    void getStoredItem(ZONE_DEDUPE_STORAGE_KEY).then((raw) => {
      if (!cancelled) zoneDedupeRef.current = parseStoredZoneDedupe(raw);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistZoneDedupe = useCallback((next: NightDedupeState) => {
    zoneDedupeRef.current = next;
    void setStoredItem(ZONE_DEDUPE_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const handleSample = useCallback(
    (position: Location.LocationObject) => {
      const sample: PresenceSample = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        timestampMs: position.timestamp
      };
      const spots = geofencesRef.current;
      const outgoing: TripEventIntent[] = [];

      const presenceResult = advancePresence(presenceStateRef.current, sample, spots, DEFAULT_PRESENCE_CONFIG);
      presenceStateRef.current = presenceResult.state;
      outgoing.push(...presenceResult.intents);

      // Recommendation attribution (identity-free pipeline) AND Trip Mode's
      // own visited-list bookkeeping (in-memory, never transmitted) both key
      // off the same fresh-arrival signal -- per docs/analytics-pivot.md's
      // amendment item 2 ("compares on arrival") and tripSession.ts's own
      // "record an arrival" contract. `noteTripArrival` is a no-op while no
      // session is active, so it is always safe to call.
      for (const intent of presenceResult.intents) {
        if (intent.type === 'spot_presence') {
          noteTripArrival(intent.spotId);
          const attributed = attributeArrival(intent.spotId, sample.timestampMs);
          if (attributed) outgoing.push(attributed);
        }
      }

      const zoneResult = classifyZoneDwell(zoneStateRef.current, zoneDedupeRef.current, sample, spots, {
        dwellMs: ZONE_DWELL_MS,
        maxGapMs: DEFAULT_ZONE_MAX_GAP_MS,
        urbanExclusion: TROMSO_URBAN_EXCLUSION_CELLS,
        isDark,
        nightKeyOf
      });
      zoneStateRef.current = zoneResult.state;
      if (zoneResult.dedupe !== zoneDedupeRef.current) {
        persistZoneDedupe(zoneResult.dedupe);
      }
      outgoing.push(...zoneResult.intents);

      if (outgoing.length > 0) {
        enqueueTripEvents(outgoing);
      }
    },
    [persistZoneDedupe]
  );

  /**
   * Stops the watcher (if any) and settles the current visit. The
   * flush/discard decision for the resulting closing summary is
   * `shouldFlushStopIntents(reason, getTourismConsent())` (tripEventGate.ts)
   * -- LIVE tourism consent, not a snapshot, because a stop can happen while
   * sampling ran purely to support a trip session with consent off:
   *
   *   - `'consent-revoked'`: endPresenceSession still runs (so local state
   *     resets cleanly either way), but its resulting intents are always
   *     DISCARDED -- never queued, never sent -- because consent withdrawal
   *     must stop collection immediately. Also resets the attribution store
   *     -- see attributionStore.ts's own comment on why the OTHER reasons
   *     below must NOT do this (the 12h attribution window is meant to
   *     survive exactly a background/foreground gap).
   *   - `'trip-ended' | 'background' | 'permission-lost' | 'unmount'`: the
   *     closing summary is flushed only if tourism consent is STILL
   *     'accepted' at this moment -- if the sampler was only ever running
   *     for a trip session (consent never accepted, or already withdrawn),
   *     there is nothing to flush and `shouldFlushStopIntents` returns
   *     false regardless of reason.
   */
  const stop = useCallback((reason: TripPresenceStopReason) => {
    startTokenRef.current += 1; // invalidate any in-flight start()
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
    if (!runningRef.current) return;
    runningRef.current = false;

    const { state: nextPresence, intents } = endPresenceSession(presenceStateRef.current, Date.now());
    presenceStateRef.current = nextPresence;
    // No partial-dwell emission on stop, by zoneDiscovery.ts's own design --
    // just forget the in-progress cell.
    zoneStateRef.current = INITIAL_ZONE_DWELL_STATE;

    if (intents.length > 0 && shouldFlushStopIntents(reason, getTourismConsent())) {
      flushFinalTripEvents(intents);
    }
    // else: the closing summary is intentionally dropped here -- see
    // shouldFlushStopIntents's doc comment. tripEventClient.ts's own
    // subscribeTourismConsent handler independently clears anything already
    // sitting in its queue the moment consent flips, so revoked consent
    // drops BOTH the trailing summary (here) and any prior not-yet-sent
    // queued items (there).

    if (reason === 'consent-revoked') {
      resetAttributionStore();
    }
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    if (!shouldRun()) return;

    const token = ++startTokenRef.current;

    // Requested lazily, at the point of relevance (`shouldRun()` is true)
    // -- never on cold start, and never re-shown once the OS has recorded a
    // decision (requestForegroundPermissionsAsync itself is a no-op
    // prompt-wise once 'granted'/'denied' is already settled). Mirrors
    // useUserLocation.ts's own lazy-request pattern. ConsentGate already
    // requests this permission at onboarding (making this a no-op there);
    // Trip Mode's own screen also requests it before starting a session.
    let permission: Location.LocationPermissionResponse;
    try {
      permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
    } catch {
      return;
    }
    if (permission.status !== Location.PermissionStatus.GRANTED) return;

    // Re-check nothing changed while the permission round-trip was in
    // flight (gating flipped off, or a newer start() call superseded this
    // one).
    if (token !== startTokenRef.current) return;
    if (!shouldRun()) return;

    let subscription: Location.LocationSubscription;
    try {
      subscription = await Location.watchPositionAsync(
        {
          accuracy: SAMPLE_ACCURACY,
          distanceInterval: SAMPLE_DISTANCE_INTERVAL_M,
          timeInterval: SAMPLE_TIME_INTERVAL_MS
        },
        handleSample,
        // Defensive `permission-lost` stop for a running subscription that
        // itself errors out (e.g. permission revoked out from under an
        // active watch) -- see the module header's "PERMISSION-REVOCATION
        // ASSUMPTION" note above for why this is a defensive backstop, not
        // the primary detection path.
        () => stop('permission-lost')
      );
    } catch {
      return;
    }

    if (token !== startTokenRef.current || !shouldRun()) {
      subscription.remove();
      return;
    }

    watcherRef.current = subscription;
    runningRef.current = true;
  }, [handleSample, stop]);

  // Re-evaluation effect (replaces the old consent-only effect): re-runs
  // whenever tourism consent (or its loaded-ness) or trip-session
  // active-ness changes.
  useEffect(() => {
    if (!tourismConsentLoaded) return;

    const previousTourismConsent = previousTourismConsentRef.current;
    previousTourismConsentRef.current = tourismConsent;
    const tourismConsentJustRevoked = previousTourismConsent === 'accepted' && tourismConsent !== 'accepted';

    if (shouldRun()) {
      void start();
      // Special case: consent was just revoked but a trip session is still
      // active, so `shouldRun()` stays true and the watcher must keep
      // running for the session's sake -- emission is already closed by the
      // gate (mayEmitTripEvents) and tripEventClient.ts's own subscription
      // drops whatever is queued, but the local attribution store must
      // still be reset here, same as a `consent-revoked` stop would do, per
      // attributionStore.ts's contract.
      if (tourismConsentJustRevoked) {
        resetAttributionStore();
      }
      return;
    }

    stop(tourismConsentJustRevoked ? 'consent-revoked' : 'trip-ended');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourismConsent, tourismConsentLoaded, tripSession.active]);

  // Foreground/background transitions. NOTE (post-review, keep these two
  // AppState listeners disjoint): this hook and tripEventClient.ts EACH
  // register their own AppState 'change' listener, deliberately -- do not
  // merge them into one shared listener in a future refactor. This one owns
  // SAMPLING LIFECYCLE (starting/stopping Location.watchPositionAsync and
  // computing the closing `spot_visit` via `endPresenceSession`) -- it has
  // no visibility into, and must not gain any into, the network queue
  // tripEventClient.ts owns. That module's own listener only ever tries to
  // flush ALREADY-BUILT intents on backgrounding; it has no visibility into
  // presence/zone state. Same trigger event, two independent concerns.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        if (shouldRun()) {
          void start();
        }
      } else {
        stop('background');
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, stop, tourismConsent, tourismConsentLoaded, tripSession.active]);

  // Unmount: stop cleanly (should not normally happen -- this hook is
  // mounted once at the app root -- but covers hot reload / test teardown).
  useEffect(() => {
    return () => {
      stop('unmount');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
