// Tests for the pure wire-translation layer in src/trip/tripEventWire.ts --
// no react-native import, so it runs the same way under plain node:test as
// presenceCore.test.ts / zoneDiscovery.test.ts. Covers every one of the
// five trip event types' wire shapes, plus the "drop only the bad item"
// behavior toWireBatch relies on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { RECOMMENDATION_ID_PATTERN, toWireBatch, toWirePayload } from '../src/trip/tripEventWire.js';
import type { TripEventIntent } from '../src/trip/tripEventWire.js';

describe('toWirePayload: all five event types', () => {
  test('spot_presence passes utcHour through unchanged', () => {
    const intent: TripEventIntent = { type: 'spot_presence', spotId: 'ersfjordbotn', utcHour: 21 };
    assert.deepEqual(toWirePayload(intent), { type: 'spot_presence', spotId: 'ersfjordbotn', utcHour: 21 });
  });

  test('spot_presence_long passes utcHour through unchanged', () => {
    const intent: TripEventIntent = { type: 'spot_presence_long', spotId: 'ersfjordbotn', utcHour: 22 };
    assert.deepEqual(toWirePayload(intent), { type: 'spot_presence_long', spotId: 'ersfjordbotn', utcHour: 22 });
  });

  test('spot_visit translates timeBucket -> utcHour and keeps dwellBucket', () => {
    const intent: TripEventIntent = { type: 'spot_visit', spotId: 'ersfjordbotn', timeBucket: 20, dwellBucket: '15-30m' };
    assert.deepEqual(toWirePayload(intent), {
      type: 'spot_visit',
      spotId: 'ersfjordbotn',
      utcHour: 20,
      dwellBucket: '15-30m'
    });
  });

  test('recommended_spot_visit translates timeBucket -> utcHour and keeps recommendationId', () => {
    const intent: TripEventIntent = {
      type: 'recommended_spot_visit',
      spotId: 'ersfjordbotn',
      recommendationId: 'tonight_best_spot_v1',
      timeBucket: 23
    };
    assert.deepEqual(toWirePayload(intent), {
      type: 'recommended_spot_visit',
      spotId: 'ersfjordbotn',
      recommendationId: 'tonight_best_spot_v1',
      utcHour: 23
    });
  });

  test('zone_dwell translates timeBucket -> utcHour and keeps h3Cell/dwellBucket', () => {
    const intent: TripEventIntent = { type: 'zone_dwell', h3Cell: '8708ed358ffffff', timeBucket: 1, dwellBucket: '60m+' };
    assert.deepEqual(toWirePayload(intent), {
      type: 'zone_dwell',
      h3Cell: '8708ed358ffffff',
      utcHour: 1,
      dwellBucket: '60m+'
    });
  });
});

describe('toWirePayload: recommendationId validation', () => {
  test('a recommendationId matching the backend pattern is kept', () => {
    assert.equal(RECOMMENDATION_ID_PATTERN.test('tonight_best_spot_v1'), true);
    const intent: TripEventIntent = {
      type: 'recommended_spot_visit',
      spotId: 'ersfjordbotn',
      recommendationId: 'tonight_best_spot_v1',
      timeBucket: 20
    };
    assert.notEqual(toWirePayload(intent), null);
  });

  test('an empty recommendationId is dropped (returns null)', () => {
    const intent: TripEventIntent = { type: 'recommended_spot_visit', spotId: 'ersfjordbotn', recommendationId: '', timeBucket: 20 };
    assert.equal(toWirePayload(intent), null);
  });

  test('a recommendationId with disallowed characters (uppercase, spaces) is dropped', () => {
    const intent: TripEventIntent = {
      type: 'recommended_spot_visit',
      spotId: 'ersfjordbotn',
      recommendationId: 'Tonight Best Spot',
      timeBucket: 20
    };
    assert.equal(toWirePayload(intent), null);
  });

  test('a recommendationId longer than 64 characters is dropped', () => {
    const intent: TripEventIntent = {
      type: 'recommended_spot_visit',
      spotId: 'ersfjordbotn',
      recommendationId: 'a'.repeat(65),
      timeBucket: 20
    };
    assert.equal(toWirePayload(intent), null);
  });
});

describe('toWireBatch: drops only the bad item', () => {
  test('a batch with one invalid recommendationId still sends the other four valid items', () => {
    const batch: TripEventIntent[] = [
      { type: 'spot_presence', spotId: 'a', utcHour: 20 },
      { type: 'spot_presence_long', spotId: 'a', utcHour: 20 },
      { type: 'spot_visit', spotId: 'a', timeBucket: 20, dwellBucket: '<5m' },
      { type: 'recommended_spot_visit', spotId: 'a', recommendationId: 'BAD ID!', timeBucket: 20 },
      { type: 'zone_dwell', h3Cell: 'cell', timeBucket: 20, dwellBucket: '5-15m' }
    ];

    const wire = toWireBatch(batch);

    assert.equal(wire.length, 4);
    assert.ok(!wire.some((item) => item.type === 'recommended_spot_visit'));
    assert.deepEqual(
      wire.map((item) => item.type).sort(),
      ['spot_presence', 'spot_presence_long', 'spot_visit', 'zone_dwell'].sort()
    );
  });

  test('an all-valid batch keeps every item, in order', () => {
    const batch: TripEventIntent[] = [
      { type: 'spot_presence', spotId: 'a', utcHour: 20 },
      { type: 'zone_dwell', h3Cell: 'cell', timeBucket: 20, dwellBucket: '5-15m' }
    ];
    const wire = toWireBatch(batch);
    assert.equal(wire.length, 2);
    assert.equal(wire[0].type, 'spot_presence');
    assert.equal(wire[1].type, 'zone_dwell');
  });

  test('an empty batch produces an empty wire batch', () => {
    assert.deepEqual(toWireBatch([]), []);
  });
});
