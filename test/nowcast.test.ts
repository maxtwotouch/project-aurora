// Twin-drift pin for src/scoring/nowcast.ts -- byte-identical copy (modulo
// import style) of backend/src/nowcast.ts's deriveNowcastLevel + threshold
// constants (see that backend module's "TWIN-READY" header comment and this
// file's own header). This is deliberately a SMALL fixture grid pinning
// known outputs at each threshold boundary, not a full behavioral suite --
// backend/test/nowcast.test.ts already exhaustively covers the boundary/AND-OR
// semantics for the canonical implementation. The point of this file is
// narrower: if either copy's thresholds or branching ever drift from the
// other, this grid should start failing on whichever side changed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  BZ_ACTIVE_THRESHOLD_NT,
  BZ_STORMING_THRESHOLD_NT,
  BZ_STIRRING_THRESHOLD_NT,
  OVATION_ACTIVE_THRESHOLD,
  OVATION_STIRRING_THRESHOLD,
  OVATION_STORMING_THRESHOLD,
  STORMING_BZ_STANDALONE_NT,
  deriveNowcastLevel
} from '../src/scoring/nowcast.js';

describe('deriveNowcastLevel (frontend twin): fixture grid pinned against backend/src/nowcast.ts', () => {
  test('quiet: both sources unavailable', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: null }), 'quiet');
  });

  test('quiet: northward bz, low ovation', () => {
    assert.equal(deriveNowcastLevel({ bz: 5, ovationProbability: 2 }), 'quiet');
  });

  test('stirring: bz just south of zero', () => {
    assert.equal(deriveNowcastLevel({ bz: BZ_STIRRING_THRESHOLD_NT - 0.01, ovationProbability: null }), 'stirring');
  });

  test('stirring: ovation at its own threshold, bz unavailable', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: OVATION_STIRRING_THRESHOLD }), 'stirring');
  });

  test('active: bz at its own threshold, ovation unavailable', () => {
    assert.equal(deriveNowcastLevel({ bz: BZ_ACTIVE_THRESHOLD_NT, ovationProbability: null }), 'active');
  });

  test('active: ovation at its own threshold, bz unavailable', () => {
    assert.equal(deriveNowcastLevel({ bz: null, ovationProbability: OVATION_ACTIVE_THRESHOLD }), 'active');
  });

  test('active, not storming: bz in the -10..-15 AND-only band alone (ovation low)', () => {
    assert.equal(deriveNowcastLevel({ bz: -12, ovationProbability: 0 }), 'active');
  });

  test('storming: bz + ovation both clear their storming thresholds together', () => {
    assert.equal(
      deriveNowcastLevel({ bz: BZ_STORMING_THRESHOLD_NT, ovationProbability: OVATION_STORMING_THRESHOLD }),
      'storming'
    );
  });

  test('storming: standalone escape fires on an extreme bz alone (ovation 0)', () => {
    assert.equal(deriveNowcastLevel({ bz: STORMING_BZ_STANDALONE_NT, ovationProbability: 0 }), 'storming');
  });

  test('storming: escape also fires well past the standalone threshold', () => {
    assert.equal(deriveNowcastLevel({ bz: -30, ovationProbability: 0 }), 'storming');
  });

  test('a positive (northward) bz of any magnitude never counts as southward coupling', () => {
    assert.equal(deriveNowcastLevel({ bz: 20, ovationProbability: null }), 'quiet');
  });
});
