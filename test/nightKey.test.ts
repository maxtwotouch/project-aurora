// Tests for the pure Oslo "which night is this" helper in
// src/trip/nightKey.ts -- no react-native import, so it runs the same way
// under plain node:test as zoneDiscovery.test.ts. See that module's own
// header for why this exists (zoneDiscovery.ts's injected `nightKeyOf`).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { nightKeyOf } from '../src/trip/nightKey.js';

describe('nightKeyOf', () => {
  test('an evening sample keys to that same local day', () => {
    // 2026-08-18T20:00:00Z is 22:00 CEST (Europe/Oslo, UTC+2 in August).
    const ms = Date.UTC(2026, 7, 18, 20, 0, 0);
    assert.equal(nightKeyOf(ms), '2026-08-18');
  });

  test('an early-morning sample (local hour < 6) rolls back to the previous local day', () => {
    // 2026-08-19T02:00:00Z is 04:00 CEST -- local hour 4, before the 06:00 rollback boundary.
    const ms = Date.UTC(2026, 7, 19, 2, 0, 0);
    assert.equal(nightKeyOf(ms), '2026-08-18');
  });

  test('exactly local hour 6 does NOT roll back (boundary is exclusive)', () => {
    // 2026-08-19T04:00:00Z is 06:00 CEST.
    const ms = Date.UTC(2026, 7, 19, 4, 0, 0);
    assert.equal(nightKeyOf(ms), '2026-08-19');
  });

  test('local hour 5:59 still rolls back', () => {
    // 2026-08-19T03:59:00Z is 05:59 CEST.
    const ms = Date.UTC(2026, 7, 19, 3, 59, 0);
    assert.equal(nightKeyOf(ms), '2026-08-18');
  });

  test('deterministic: same input always produces the same key', () => {
    const ms = Date.UTC(2026, 11, 24, 22, 30, 0);
    const first = nightKeyOf(ms);
    const second = nightKeyOf(ms);
    assert.equal(first, second);
  });

  test('rollback correctly crosses a month/year boundary', () => {
    // 2027-01-01T02:00:00Z is 03:00 CET (winter, UTC+1) -- local hour 3, rolls back.
    const ms = Date.UTC(2027, 0, 1, 2, 0, 0);
    assert.equal(nightKeyOf(ms), '2026-12-31');
  });

  test('winter (CET, UTC+1) evening sample keys to that local day', () => {
    // 2026-12-24T21:00:00Z is 22:00 CET.
    const ms = Date.UTC(2026, 11, 24, 21, 0, 0);
    assert.equal(nightKeyOf(ms), '2026-12-24');
  });
});
