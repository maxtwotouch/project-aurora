import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildTonightSnapshot, getSpots } from '../src/snapshot.js';
import { rankSpots } from '../src/scoring.js';
import { computeDarknessSeasonState } from '../src/season.js';

const TROMSO = { lat: 69.6492, lon: 18.9553 };

// buildTonightSnapshot() has no dependency-injection seam: it calls the
// sources.ts functions directly, which in turn call the global `fetch`.
// We stub `globalThis.fetch` to always reject, which drives every source
// (KP, per-spot weather, Tromso-point weather, sunset) down its documented,
// deterministic fallback path -- with zero real network I/O.
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

test('buildTonightSnapshot assembles a full snapshot from fallback data when every external source fails', async () => {
  globalThis.fetch = (async () => {
    throw new Error('simulated network failure');
  }) as typeof fetch;

  const snapshot = await buildTonightSnapshot();
  const spots = getSpots();

  // --- all spots present ---
  assert.equal(spots.length, 28, 'expected the spot catalog to contain 28 spots');
  assert.equal(snapshot.rankings.length, 28);
  assert.equal(Object.keys(snapshot.forecastsBySpotId).length, 28);
  for (const spot of spots) {
    assert.ok(snapshot.forecastsBySpotId[spot.id], `missing forecast for spot ${spot.id}`);
    assert.ok(
      snapshot.rankings.some((r) => r.spotId === spot.id),
      `missing ranking for spot ${spot.id}`
    );
  }

  // --- data-quality flags reflect the fallback usage ---
  assert.equal(snapshot.dataQuality.usingFallbackKp, true);
  // 28 per-spot fallbacks + the Tromso-center point forecast fallback
  assert.equal(snapshot.dataQuality.fallbackWeatherSpotIds.length, 29);
  assert.ok(snapshot.dataQuality.fallbackWeatherSpotIds.includes('tromso_center'));
  for (const spot of spots) {
    assert.ok(
      snapshot.dataQuality.fallbackWeatherSpotIds.includes(spot.id),
      `expected ${spot.id} to be flagged as using fallback weather`
    );
  }

  // sunset/sighting source also failed -> null, and now reflected in dataQuality via usingFallbackSighting
  assert.equal(snapshot.sightingPossibleFrom, null);
  assert.equal(snapshot.dataQuality.usingFallbackSighting, true);

  // --- rankings are sorted descending by score ---
  for (let i = 1; i < snapshot.rankings.length; i += 1) {
    assert.ok(
      snapshot.rankings[i - 1].score >= snapshot.rankings[i].score,
      `rankings not sorted descending at index ${i}`
    );
  }

  // --- topSpots is exactly the first 5 rankings, same order ---
  assert.equal(snapshot.topSpots.length, 5);
  assert.deepEqual(
    snapshot.topSpots.map((s) => s.spotId),
    snapshot.rankings.slice(0, 5).map((s) => s.spotId)
  );

  // --- rankings are consistent with independently recomputed scores ---
  // Re-run the same pure scoring function over the exact forecasts/KP the
  // snapshot used, and confirm it reproduces the snapshot's rankings exactly.
  const recomputed = rankSpots(spots, snapshot.forecastsBySpotId, snapshot.kp.hourly);
  assert.deepEqual(recomputed, snapshot.rankings);

  // --- tonightScore is derived from the top-ranked spot ---
  assert.ok(snapshot.tonightScore);
  assert.equal(snapshot.tonightScore?.label, snapshot.rankings[0].spotName);
  assert.equal(snapshot.tonightScore?.score, snapshot.rankings[0].score);
  assert.equal(snapshot.tonightScore?.cloudCover, snapshot.rankings[0].cloudCoverAtBestHour);
  assert.ok(['High', 'Medium', 'Low'].includes(snapshot.tonightScore?.chance ?? ''));

  // --- updatedAt is a well-formed timestamp (exact value is Date.now()-dependent, not asserted) ---
  assert.equal(Number.isNaN(new Date(snapshot.updatedAt).getTime()), false);

  // --- tomorrowScore depends on the wall-clock hour the fallback forecast starts from
  //     (buildFallbackForecast() anchors to `new Date()`), so we only assert its shape
  //     when present rather than asserting it is always non-null. See report: flagged
  //     as a Date.now()-coupled branch that can't be made fully deterministic here. ---
  if (snapshot.tomorrowScore) {
    assert.equal(snapshot.tomorrowScore.label, 'Tomorrow');
    assert.ok(['High', 'Medium', 'Low'].includes(snapshot.tomorrowScore.chance));
  } else {
    assert.equal(snapshot.tomorrowScore, null);
  }
});

test('getSpots returns the full, unfiltered spot catalog', () => {
  const spots = getSpots();
  assert.equal(spots.length, 28);
  const ids = new Set(spots.map((s) => s.id));
  assert.equal(ids.size, 28, 'expected all spot ids to be unique');
});

describe('buildTonightSnapshot: darkness.seasonClosed / seasonReturns', () => {
  test('a July clock closes the season (midnight sun) and points seasonReturns at a plausible August date', async () => {
    globalThis.fetch = (async () => {
      throw new Error('simulated network failure');
    }) as typeof fetch;

    const july = () => new Date('2026-07-18T12:00:00Z').getTime();
    const snapshot = await buildTonightSnapshot(july);

    assert.equal(snapshot.darkness.seasonClosed, true);
    // seasonClosed and seasonReturns now share the same factor > 0
    // criterion (see season.ts), so this is the exact date the flag would
    // flip to false -- not just "sometime in August".
    assert.equal(snapshot.darkness.seasonReturns, '2026-08-14');

    // Every hourly score across every spot must be exactly 0 tonight -- the
    // whole point of the darkness gate.
    for (const ranking of snapshot.rankings) {
      assert.ok(
        ranking.hourlyScores.every((hour) => hour.score === 0),
        `expected spot ${ranking.spotId} to have every hourly score at 0 during midnight sun`
      );
    }
  });

  test('a December clock leaves the season open (long polar night, plenty of dark hours)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('simulated network failure');
    }) as typeof fetch;

    const december = () => new Date('2026-12-10T12:00:00Z').getTime();
    const snapshot = await buildTonightSnapshot(december);

    assert.equal(snapshot.darkness.seasonClosed, false);
    assert.equal(snapshot.darkness.seasonReturns, null);
  });
});

describe('computeDarknessSeasonState: early-morning rollback (< 06:00 local is still "tonight")', () => {
  test('02:00 local on 2026-04-28, still inside the genuinely-dark night of April 27, is NOT season-closed', () => {
    // 2026-04-28T02:00 local (CEST, UTC+2) = 2026-04-28T00:00:00Z. Before the
    // fix, this unconditionally evaluated the calendar-date night of
    // "April 28" (18:00 Apr 28 -> 08:00 Apr 29), which is already too bright
    // this close to the midnight-sun season, wrongly reporting
    // seasonClosed:true while still standing in a genuinely dark night.
    const state = computeDarknessSeasonState(new Date('2026-04-28T00:00:00Z').getTime(), TROMSO.lat, TROMSO.lon);
    assert.equal(state.seasonClosed, false);
    assert.equal(state.seasonReturns, null);
  });

  test('02:00 local deep in July (2026-07-16) is still inside a genuinely bright night -- season closed', () => {
    // 2026-07-16T02:00 local (CEST, UTC+2) = 2026-07-16T00:00:00Z. Unlike
    // the April case above, rolling back to the night of July 15 doesn't
    // change the outcome -- midsummer nights in Tromso never get dark.
    const state = computeDarknessSeasonState(new Date('2026-07-16T00:00:00Z').getTime(), TROMSO.lat, TROMSO.lon);
    assert.equal(state.seasonClosed, true);
    assert.equal(state.seasonReturns, '2026-08-14');
  });
});
