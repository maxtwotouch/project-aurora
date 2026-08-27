import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

import spotsData from '../data/spots.json';
import { getTripModeConsent, useTripModeConsent } from '../analytics/tripModeConsent';
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
 * Trip mode's foreground collection wiring (v1 -- see docs/design-trip-
 * tracking.md and docs/analytics-pivot.md's amendment; the background
 * nav-session mode from the design doc's section 3 "trip session" is
 * explicitly out of scope here, a later iteration). Mount once, at the app
 * root (see App.tsx) -- this hook renders nothing and returns nothing; it
 * exists purely for its effects.
 *
 * GATING (all four must hold before any `expo-location` call happens):
 *   1. Trip-mode consent === 'accepted' (src/analytics/tripModeConsent.ts).
 *   2. The app is foregrounded (`AppState.currentState === 'active'`).
 *   3. Foreground location permission is granted (requested here, lazily,
 *      the first time (1) and (2) are both true -- "at the point of
 *      relevance" per Apple's own guidance, quoted in docs/design-trip-
 *      tracking.md section 3 -- never on cold start regardless of consent).
 *   4. `EXPO_PUBLIC_USE_BACKEND`/`EXPO_PUBLIC_API_BASE_URL` are configured
 *      (checked deeper, inside tripEventClient.ts -- collection can still
 *      run locally without a configured backend, but nothing is ever
 *      queued to send; see that module).
 * Any one of (1)-(3) becoming false immediately stops the watcher and
 * flushes/reset the local state -- see `stop()` below.
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
  const { state: tripModeConsent, loaded: tripModeConsentLoaded } = useTripModeConsent();

  const geofencesRef = useRef<SpotGeofence[]>(spotsToGeofences(spotsData as SpotJson[]));
  const presenceStateRef = useRef<PresenceState>(INITIAL_PRESENCE_STATE);
  const zoneStateRef = useRef<ZoneDwellState>(INITIAL_ZONE_DWELL_STATE);
  const zoneDedupeRef = useRef<NightDedupeState>(INITIAL_NIGHT_DEDUPE_STATE);
  const watcherRef = useRef<{ remove: () => void } | null>(null);
  const runningRef = useRef(false);
  // Guards against a start()/stop() racing an in-flight watchPositionAsync
  // call (e.g. consent flips off while permission/subscription setup is
  // still awaiting native calls).
  const startTokenRef = useRef(0);

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

      // Recommendation attribution: attempt attribution on every fresh
      // arrival (spot_presence), per docs/analytics-pivot.md's amendment
      // item 2 -- "compares on arrival".
      for (const intent of presenceResult.intents) {
        if (intent.type === 'spot_presence') {
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
   * Stops the watcher (if any) and flushes the current visit, per the task's
   * "Consent off / app background / permission missing -> no watcher, state
   * reset via resetPresence + endPresenceSession flush" instruction.
   * `alsoResetAttribution` is true only for the explicit Trip-mode-off path
   * (item 5) -- see attributionStore.ts's own comment on why backgrounding
   * alone must NOT reset it (the whole point of the 12h attribution window
   * is surviving exactly that kind of gap).
   */
  const stop = useCallback((alsoResetAttribution: boolean) => {
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

    if (intents.length > 0) {
      flushFinalTripEvents(intents);
    }
    if (alsoResetAttribution) {
      resetAttributionStore();
    }
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    if (getTripModeConsent() !== 'accepted') return;
    if (AppState.currentState !== 'active') return;

    const token = ++startTokenRef.current;

    // Requested lazily, at the point of relevance (Trip mode is on AND the
    // app is in the foreground) -- never on cold start, and never re-shown
    // once the OS has recorded a decision (requestForegroundPermissionsAsync
    // itself is a no-op prompt-wise once 'granted'/'denied' is already
    // settled). Mirrors useUserLocation.ts's own lazy-request pattern.
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
    // flight (consent withdrawn, app backgrounded, or a newer start() call
    // superseded this one).
    if (token !== startTokenRef.current) return;
    if (getTripModeConsent() !== 'accepted' || AppState.currentState !== 'active') return;

    let subscription: Location.LocationSubscription;
    try {
      subscription = await Location.watchPositionAsync(
        {
          accuracy: SAMPLE_ACCURACY,
          distanceInterval: SAMPLE_DISTANCE_INTERVAL_M,
          timeInterval: SAMPLE_TIME_INTERVAL_MS
        },
        handleSample
      );
    } catch {
      return;
    }

    if (token !== startTokenRef.current || getTripModeConsent() !== 'accepted' || AppState.currentState !== 'active') {
      subscription.remove();
      return;
    }

    watcherRef.current = subscription;
    runningRef.current = true;
  }, [handleSample]);

  // Re-evaluate whenever Trip-mode consent (or its loaded-ness) changes.
  useEffect(() => {
    if (!tripModeConsentLoaded) return;
    if (tripModeConsent === 'accepted') {
      void start();
    } else {
      stop(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripModeConsent, tripModeConsentLoaded]);

  // Foreground/background transitions.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        if (tripModeConsentLoaded && tripModeConsent === 'accepted') {
          void start();
        }
      } else {
        stop(false);
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, stop, tripModeConsent, tripModeConsentLoaded]);

  // Unmount: stop cleanly (should not normally happen -- this hook is
  // mounted once at the app root -- but covers hot reload / test teardown).
  useEffect(() => {
    return () => {
      stop(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
