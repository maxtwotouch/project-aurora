/**
 * Urban-exclusion H3 cell set for central Tromsø -- pure, deterministic, no
 * I/O. Computed once at module init from a small hardcoded center + k-ring,
 * per docs/analytics-pivot.md's amendment item 3 ("outside the excluded
 * urban zone") and zoneDiscovery.ts's `ZoneDiscoveryConfig.urbanExclusion`.
 *
 * Why a k-ring around a center point rather than a hand-drawn polygon: the
 * zone-discovery goal is coarse, deliberate over-exclusion ("too coarse to
 * identify a cabin or address" is the module's own privacy bar, and the same
 * "err toward excluding, not including" reasoning applies here to avoid
 * counting the city itself as a discovered hotspot) -- a symmetric k-ring is
 * simpler to reason about and audit than a polygon boundary, and city center
 * + ~5km covers Tromsø's urban core (the city center, Tromsøya, and the
 * built-up parts of the mainland immediately across the bridges) with margin
 * to spare, at the cost of also excluding a bit of open water/hillside near
 * the edges -- an acceptable trade for a discovery signal that already
 * treats undercounting as an accepted cost (see docs/design-trip-tracking.md
 * section 4).
 */

import { gridDisk, latLngToCell } from 'h3-js';

import { ZONE_H3_RESOLUTION } from './zoneDiscovery';

/** Central Tromsø reference point (roughly Stortorget/city center). */
export const TROMSO_CENTER = { lat: 69.6492, lon: 18.9553 };

/**
 * gridDisk "k" ring radius, chosen from h3-js's own res-7 geometry:
 * `getHexagonEdgeLengthAvg(7, 'km')` ~= 1.4065 km, so adjacent-cell
 * center-to-center distance (edgeLength * sqrt(3)) ~= 2.44 km. `gridDisk`
 * with k=2 therefore reaches roughly 2 * 2.44 ~= 4.9 km from the center --
 * matching the task's "k-ring radius covering the urban area ~5km"
 * instruction. That is 19 cells (1 center + 6 ring-1 + 12 ring-2).
 */
export const URBAN_EXCLUSION_K_RING = 2;

/**
 * Computes the H3 resolution-7 cell set within `k` rings of
 * (`centerLat`, `centerLon`). Exported (rather than only the precomputed
 * constant below) so the computation itself -- not just its one fixed
 * output -- is directly unit-testable for determinism and geometry.
 */
export function computeUrbanExclusionCells(
  centerLat: number,
  centerLon: number,
  k: number = URBAN_EXCLUSION_K_RING
): ReadonlySet<string> {
  const origin = latLngToCell(centerLat, centerLon, ZONE_H3_RESOLUTION);
  return new Set(gridDisk(origin, k));
}

/**
 * Computed once at module init -- the wiring layer's fixed
 * `config.urbanExclusion` value for zoneDiscovery.ts's `classifyZoneDwell`.
 * A named constant (not recomputed per call) per the task's instruction.
 */
export const TROMSO_URBAN_EXCLUSION_CELLS: ReadonlySet<string> = computeUrbanExclusionCells(
  TROMSO_CENTER.lat,
  TROMSO_CENTER.lon
);
