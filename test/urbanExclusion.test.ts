// Tests for the pure urban-exclusion H3 cell computation in
// src/trip/urbanExclusion.ts -- no react-native import, so it runs the same
// way under plain node:test as zoneDiscovery.test.ts. Determinism here
// matters directly: zoneDiscovery.ts's `classifyZoneDwell` is only correct
// if the SAME cell set is used on every call (the "urban exclusion" gate),
// and this module is expected to compute it once at module init.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cellToLatLng, isValidCell, latLngToCell } from 'h3-js';

import {
  TROMSO_CENTER,
  TROMSO_URBAN_EXCLUSION_CELLS,
  URBAN_EXCLUSION_K_RING,
  computeUrbanExclusionCells
} from '../src/trip/urbanExclusion.js';
import { ZONE_H3_RESOLUTION, cellIdFor } from '../src/trip/zoneDiscovery.js';

describe('computeUrbanExclusionCells: determinism', () => {
  test('the same center/k always produces the same cell set', () => {
    const first = computeUrbanExclusionCells(TROMSO_CENTER.lat, TROMSO_CENTER.lon, 2);
    const second = computeUrbanExclusionCells(TROMSO_CENTER.lat, TROMSO_CENTER.lon, 2);
    assert.deepEqual([...first].sort(), [...second].sort());
  });

  test('a different k produces a different (larger) cell count', () => {
    const k1 = computeUrbanExclusionCells(TROMSO_CENTER.lat, TROMSO_CENTER.lon, 1);
    const k2 = computeUrbanExclusionCells(TROMSO_CENTER.lat, TROMSO_CENTER.lon, 2);
    assert.equal(k1.size, 7); // 1 center + 6 ring-1
    assert.equal(k2.size, 19); // + 12 ring-2
    assert.ok(k2.size > k1.size);
  });
});

describe('computeUrbanExclusionCells: geometry', () => {
  test('every returned cell is a valid resolution-7 H3 cell', () => {
    const cells = computeUrbanExclusionCells(TROMSO_CENTER.lat, TROMSO_CENTER.lon);
    for (const cell of cells) {
      assert.equal(isValidCell(cell), true);
      const [lat, lon] = cellToLatLng(cell);
      // Sanity: every excluded cell should itself resolve back to res 7.
      assert.equal(latLngToCell(lat, lon, ZONE_H3_RESOLUTION), cell);
    }
  });

  test('contains the cell the center point itself falls in', () => {
    const cells = computeUrbanExclusionCells(TROMSO_CENTER.lat, TROMSO_CENTER.lon);
    const centerCell = cellIdFor(TROMSO_CENTER.lat, TROMSO_CENTER.lon);
    assert.ok(cells.has(centerCell));
  });

  test('does not contain a point far outside central Tromsø (Ersfjordbotn, ~14km away)', () => {
    const cells = computeUrbanExclusionCells(TROMSO_CENTER.lat, TROMSO_CENTER.lon);
    const farCell = cellIdFor(69.6936, 18.617);
    assert.equal(cells.has(farCell), false);
  });
});

describe('TROMSO_URBAN_EXCLUSION_CELLS (the precomputed constant)', () => {
  test('matches computeUrbanExclusionCells at the default k-ring', () => {
    const recomputed = computeUrbanExclusionCells(TROMSO_CENTER.lat, TROMSO_CENTER.lon, URBAN_EXCLUSION_K_RING);
    assert.deepEqual([...TROMSO_URBAN_EXCLUSION_CELLS].sort(), [...recomputed].sort());
  });

  test('is non-empty', () => {
    assert.ok(TROMSO_URBAN_EXCLUSION_CELLS.size > 0);
  });
});
