import type { NowcastLevel } from '../types';

// -----------------------------------------------------------------------------
// MIRROR: this is a byte-identical copy (modulo import style -- extensionless
// here, `.js`-suffixed in the backend's ES modules) of
// backend/src/nowcast.ts's `deriveNowcastLevel` plus its threshold constants
// and `NowcastLevelInputs` type. backend/src/nowcast.ts's own header comment
// marks that section "TWIN-READY -- ... If/when this needs a frontend twin
// under src/scoring/ ... this function plus its threshold constants and
// `NowcastLevelInputs` type should be copied verbatim" -- this file is that
// twin. Keep both in sync by hand; do not let them drift. See
// docs/nowcast.md's threshold table (marked as priors pending validation)
// for the rationale behind every constant below.
// -----------------------------------------------------------------------------

/** Southward (negative) Bz, nT, GSM -- the primary aurora-coupling driver.
 * Rationale for the two southward cut points: -5 nT is a commonly-cited
 * "geomagnetic activity likely" threshold in space-weather nowcasting
 * write-ups; -10 nT is comfortably into "strong coupling, storm-class"
 * territory. Both are heuristic priors (see docs/nowcast.md), not
 * calibrated against Tromso-specific outcomes yet. */
export const BZ_ACTIVE_THRESHOLD_NT = -5;
export const BZ_STORMING_THRESHOLD_NT = -10;
/** Any southward Bz at all is a departure from "quiet" -- see docs/nowcast.md. */
export const BZ_STIRRING_THRESHOLD_NT = 0;

/**
 * Standalone `storming` escape: a Bz THIS negative is unambiguous evidence
 * of strong coupling on its own, regardless of what OVATION says. Product
 * decision (see docs/nowcast.md): OVATION's modeled probability in the
 * Tromso window has been observed running low/lagged in this codebase's own
 * live probes (single digits during genuinely disturbed-looking solar wind)
 * -- almost certainly because OVATION is itself derived from recent solar
 * wind history and lags a fresh, sharp Bz swing, plus Tromso sits near the
 * oval's edge at quiet-to-moderate activity where the model is less
 * confident. Requiring OVATION corroboration in that regime would make
 * `storming` under-fire exactly when the Bz signal is loudest. -15 nT is set
 * comfortably past `BZ_STORMING_THRESHOLD_NT` so this escape only fires for
 * genuinely extreme single-source readings, not routine noise. Trade-off,
 * accepted deliberately: Bz is spiky at 1-minute cadence, so this escape
 * alone can promote the level on a brief single-minute spike with no
 * corroboration at all -- acceptable for a *display-only* signal that
 * doesn't feed the planning score or alerts, pending real validation data.
 */
export const STORMING_BZ_STANDALONE_NT = -15;

/** OVATION probability/flux cut points in the Tromso window. Heuristic
 * priors picked to roughly track the Bz cut points above (a moderately
 * southward Bz and a moderately elevated OVATION reading should land in the
 * same level), not derived from a validated OVATION-vs-visible-aurora study
 * for Tromso specifically -- see docs/nowcast.md. */
export const OVATION_STIRRING_THRESHOLD = 5;
export const OVATION_ACTIVE_THRESHOLD = 20;
export const OVATION_STORMING_THRESHOLD = 50;

export type NowcastLevelInputs = {
  /** IMF Bz at L1 (nT, GSM). `null` when unavailable. */
  bz: number | null;
  /** Max OVATION aurora probability/flux in the Tromso window. `null` when unavailable. */
  ovationProbability: number | null;
};

/**
 * `storming` is reached two ways: (1) a strongly southward Bz AND a high
 * OVATION reading corroborating each other (so a single brief Bz spike --
 * solar wind Bz is spiky at 1-minute cadence -- can't alone claim
 * "storming" in the -10..-15 nT band), or (2) a standalone Bz reading past
 * `STORMING_BZ_STANDALONE_NT`, unambiguous enough on its own that it
 * doesn't need OVATION's (often low/lagged near Tromso) corroboration --
 * see `STORMING_BZ_STANDALONE_NT`'s doc comment. `active` and `stirring`
 * only need ONE signal at the matching threshold, so a missing source
 * degrades gracefully to relying on whichever source is actually available,
 * rather than collapsing to `quiet` just because one of the two upstreams
 * failed.
 */
export function deriveNowcastLevel(inputs: NowcastLevelInputs): NowcastLevel {
  const { bz, ovationProbability } = inputs;

  const bzStandaloneStorming = typeof bz === 'number' && bz <= STORMING_BZ_STANDALONE_NT;
  const bzStorming = typeof bz === 'number' && bz <= BZ_STORMING_THRESHOLD_NT;
  const bzActive = typeof bz === 'number' && bz <= BZ_ACTIVE_THRESHOLD_NT;
  const bzStirring = typeof bz === 'number' && bz < BZ_STIRRING_THRESHOLD_NT;

  const ovationStorming = typeof ovationProbability === 'number' && ovationProbability >= OVATION_STORMING_THRESHOLD;
  const ovationActive = typeof ovationProbability === 'number' && ovationProbability >= OVATION_ACTIVE_THRESHOLD;
  const ovationStirring = typeof ovationProbability === 'number' && ovationProbability >= OVATION_STIRRING_THRESHOLD;

  if (bzStandaloneStorming || (bzStorming && ovationStorming)) return 'storming';
  if (bzActive || ovationActive) return 'active';
  if (bzStirring || ovationStirring) return 'stirring';
  return 'quiet';
}
