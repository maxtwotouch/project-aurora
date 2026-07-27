// Twin-drift pin for src/scoring/nowcast.ts -- byte-identical copy (modulo
// import style) of backend/src/nowcast.ts's deriveNowcastLevel + threshold
// constants (see that backend module's "TWIN-READY" header comment and this
// file's own header). This is deliberately a SMALL fixture grid pinning
// known outputs at each threshold boundary, not a full behavioral suite --
// backend/test/nowcast.test.ts already exhaustively covers the boundary/AND-OR
// semantics for the canonical implementation. The point of this file is
// narrower: if either copy's thresholds or branching ever drift from the
// other, this grid should start failing on whichever side changed.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

// -----------------------------------------------------------------------------
// Textual-equivalence guard: the fixture grid above only exercises THIS
// file's copy of the logic -- it would happily keep passing even if someone
// edited backend/src/nowcast.ts's deriveNowcastLevel (or its thresholds) and
// forgot this frontend twin entirely, or vice versa. This second guard reads
// both source files directly (raw text, not imported/executed) and asserts
// the marked `// TWIN-BLOCK-BEGIN deriveNowcastLevel` .. `// TWIN-BLOCK-END
// deriveNowcastLevel` region is byte-identical (modulo trailing whitespace)
// between them, so a one-sided edit to either copy fails loudly here instead
// of silently drifting.
// -----------------------------------------------------------------------------

const TWIN_BLOCK_NAME = 'deriveNowcastLevel';
const TWIN_BLOCK_BEGIN = `// TWIN-BLOCK-BEGIN ${TWIN_BLOCK_NAME}`;
const TWIN_BLOCK_END = `// TWIN-BLOCK-END ${TWIN_BLOCK_NAME}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_TWIN_PATH = path.join(__dirname, '..', 'src', 'scoring', 'nowcast.ts');
const BACKEND_TWIN_PATH = path.join(__dirname, '..', 'backend', 'src', 'nowcast.ts');

/**
 * Extracts the text strictly between the begin/end marker comments
 * (exclusive of the marker lines themselves), then normalizes ONLY trailing
 * whitespace per line (never leading whitespace/indentation -- that's part
 * of what "byte-identical" is meant to catch) so a stray end-of-line space
 * introduced by one editor doesn't produce a false failure unrelated to the
 * logic itself.
 */
function extractTwinBlock(filePath: string): string {
  const content = readFileSync(filePath, 'utf8');
  const beginIndex = content.indexOf(TWIN_BLOCK_BEGIN);
  const endIndex = content.indexOf(TWIN_BLOCK_END);

  assert.notEqual(beginIndex, -1, `${filePath} is missing the "${TWIN_BLOCK_BEGIN}" marker`);
  assert.notEqual(endIndex, -1, `${filePath} is missing the "${TWIN_BLOCK_END}" marker`);
  assert.ok(endIndex > beginIndex, `${filePath}'s TWIN-BLOCK-END appears before its TWIN-BLOCK-BEGIN`);

  const rawBlock = content.slice(beginIndex + TWIN_BLOCK_BEGIN.length, endIndex);
  return rawBlock
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();
}

describe('deriveNowcastLevel: frontend/backend TWIN-BLOCK textual equivalence', () => {
  test('src/scoring/nowcast.ts and backend/src/nowcast.ts carry byte-identical marked twin blocks', () => {
    const frontendBlock = extractTwinBlock(FRONTEND_TWIN_PATH);
    const backendBlock = extractTwinBlock(BACKEND_TWIN_PATH);

    // assert.equal's own diff output on mismatch already shows exactly which
    // lines differ (node:assert prints a full string diff for unequal
    // strings), which is the "helpful diff on divergence" this guard is for.
    assert.equal(
      frontendBlock,
      backendBlock,
      'src/scoring/nowcast.ts has drifted from backend/src/nowcast.ts within their marked ' +
        `${TWIN_BLOCK_NAME} TWIN-BLOCK -- keep both copies in sync by hand (see nowcast.ts's own header comments).`
    );
  });
});
