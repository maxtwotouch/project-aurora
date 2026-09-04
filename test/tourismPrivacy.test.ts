// The wire boundary: proves the identity-free tourism/trip-event pipeline
// never puts precise coordinates or any identifier on the wire, no matter
// what internal state it started from. See src/trip/tripEventWire.ts's
// header (WIRE FORMAT) and src/trip/presenceCore.ts's header (PRIVACY
// CONTRACT) for the contracts this exercises.
//
// Type-level assertion (compile-time, best-effort): this block is checked by
// `tsc` ONLY if `tsconfig.json`'s `include`/`exclude` covers `test/` -- see
// the runtime grep-based check below, which reports the actual state rather
// than assuming it. `tsx` (the runner `npm run test:app` uses) strips types
// without checking them, so the runtime assertions further down are the
// real guarantee this file provides regardless of tsconfig; the type-level
// block is additional, compile-time-only defense when it IS picked up.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_PRESENCE_CONFIG,
  INITIAL_PRESENCE_STATE,
  advancePresence,
  spotsToGeofences
} from '../src/trip/presenceCore.js';
import type { PresenceSample, SpotGeofence } from '../src/trip/presenceCore.js';
import { toWireBatch } from '../src/trip/tripEventWire.js';
import type { TripEventIntent } from '../src/trip/tripEventWire.js';

// type Keys<T> = T extends unknown ? keyof T : never;
// type WireKeys = Keys<TripEventWirePayload>;
// type Forbidden = 'lat' | 'latitude' | 'lon' | 'lng' | 'longitude' | 'coords' | 'coordinates' | 'accuracy' | 'altitude' | 'speed' | 'heading' | 'userId' | 'user_id' | 'distinctId' | 'distinct_id' | 'deviceId' | 'device_id' | 'installId' | 'install_id' | 'sessionId' | 'session_id' | 'anonymousId' | 'timestamp' | 'timestampMs';
// type NoForbidden = Extract<WireKeys, Forbidden> extends never ? true : false;
// const _wireHasNoForbiddenKeys: NoForbidden = true;
//
// (Left as a comment, not live code: see "type-level check availability"
// below for why -- tsconfig.json excludes `test/`, so this block is never
// actually type-checked by `npm run typecheck` today. If it were live code
// under an included tsconfig, a change to TripEventWirePayload that added
// one of the Forbidden keys would fail `tsc` on the `const` assignment
// (`NoForbidden` would resolve to `false`, which is not assignable to
// `true`). Kept here, inert, as documentation of the intended check; the
// runtime assertions below are this file's actual enforcement.)

describe('type-level check availability (informational)', () => {
  test('tsconfig.json currently EXCLUDES test/, so the type-level assertion above is not checked by `npm run typecheck` -- reported, not assumed', () => {
    const tsconfigPath = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
    const raw = execFileSync('grep', ['-n', 'include\\|exclude', tsconfigPath], { encoding: 'utf8' });
    // tsconfig.json: "exclude": ["backend", "test"] -- no "include" key at
    // all, so the exclude list is the only thing gating which files `tsc`
    // sees. This assertion documents the observed state rather than
    // asserting a desired one; if a future PR moves `test/` out of exclude
    // (or adds an `include` that covers it), this test's failure is the
    // signal to promote the commented type-level block above into live code.
    assert.match(raw, /"exclude":\s*\[[^\]]*"test"[^\]]*\]/);
    assert.doesNotMatch(raw, /"include"/);
  });
});

const FORBIDDEN_WIRE_KEYS = new Set([
  'lat',
  'latitude',
  'lon',
  'lng',
  'longitude',
  'coords',
  'coordinates',
  'accuracy',
  'altitude',
  'speed',
  'heading',
  'userId',
  'user_id',
  'distinctId',
  'distinct_id',
  'deviceId',
  'device_id',
  'installId',
  'install_id',
  'sessionId',
  'session_id',
  'anonymousId',
  'timestamp',
  'timestampMs'
]);

const ALLOWED_WIRE_KEYS = ['type', 'spotId', 'h3Cell', 'utcHour', 'dwellBucket', 'recommendationId'];

describe('runtime: toWireBatch never puts a forbidden key or a non-integer/out-of-range number on the wire', () => {
  test('one intent of each of the five types, run through toWireBatch, only ever exposes the allowed keys', () => {
    const intents: TripEventIntent[] = [
      { type: 'spot_presence', spotId: 'ersfjordbotn', utcHour: 21 },
      { type: 'spot_presence_long', spotId: 'ersfjordbotn', utcHour: 22 },
      { type: 'spot_visit', spotId: 'ersfjordbotn', timeBucket: 20, dwellBucket: '15-30m' },
      {
        type: 'recommended_spot_visit',
        spotId: 'ersfjordbotn',
        recommendationId: 'tonight_best_spot_v1',
        timeBucket: 23
      },
      { type: 'zone_dwell', h3Cell: '8708ed358ffffff', timeBucket: 1, dwellBucket: '60m+' }
    ];

    const batch = toWireBatch(intents);
    assert.equal(batch.length, 5);

    for (const payload of batch) {
      const keys = Object.keys(payload);
      for (const key of keys) {
        assert.ok(ALLOWED_WIRE_KEYS.includes(key), `unexpected wire key "${key}" in ${JSON.stringify(payload)}`);
        assert.ok(!FORBIDDEN_WIRE_KEYS.has(key), `forbidden wire key "${key}" found in ${JSON.stringify(payload)}`);
      }

      // No value is a floating-point coordinate: every number field present
      // is an integer in [0, 23] (the only numeric wire field is utcHour).
      for (const [key, value] of Object.entries(payload)) {
        if (typeof value === 'number') {
          assert.ok(Number.isInteger(value), `expected integer for "${key}", got ${value}`);
          assert.ok(value >= 0 && value <= 23, `expected 0-23 for "${key}", got ${value}`);
        }
      }
    }

    // Scan the DATA values (spotId, h3Cell, utcHour, dwellBucket,
    // recommendationId) for anything coordinate/identifier-shaped -- with
    // the fixed `type` discriminator excluded from the scan. `type`'s own
    // enum member `'spot_presence_long'` legitimately contains the
    // substring "lon" (from "long dwell", nothing to do with longitude),
    // which would otherwise make this a false positive on a value that is a
    // hard-coded, non-PII string literal, never user-supplied data.
    const dataOnly = batch.map(({ type: _type, ...rest }) => rest);
    const serialized = JSON.stringify(dataOnly);
    assert.doesNotMatch(serialized, /lat|lon|coord|accuracy|device|user|session|distinct/i);
  });
});

describe('runtime: a PresenceSample carrying lat/lon never leaks lat/lon into the emitted intents', () => {
  test('advancePresence on a real sample with lat/lon produces intents whose keys never include lat or lon', () => {
    const spots: SpotGeofence[] = spotsToGeofences([{ id: 'ersfjordbotn', lat: 69.6936, lon: 18.617 }]);
    const sample: PresenceSample = { lat: 69.6936, lon: 18.617, timestampMs: Date.UTC(2026, 7, 18, 20, 0, 0) };

    const { intents } = advancePresence(INITIAL_PRESENCE_STATE, sample, spots, DEFAULT_PRESENCE_CONFIG);

    assert.ok(intents.length > 0);
    for (const intent of intents) {
      const keys = Object.keys(intent);
      assert.ok(!keys.includes('lat'));
      assert.ok(!keys.includes('lon'));
      assert.ok(!keys.includes('latitude'));
      assert.ok(!keys.includes('longitude'));
    }

    // Confirmed all the way through the wire translation too.
    const wire = toWireBatch(intents);
    const serialized = JSON.stringify(wire);
    assert.doesNotMatch(serialized, /lat|lon/i);
  });
});
