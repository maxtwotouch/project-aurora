/**
 * Moon position + illumination -- deterministic, self-contained
 * approximations used to apply a mild "moon washout" penalty to the aurora
 * score (see docs/scoring-model.md, "Moon factor").
 *
 * MIRROR: this file has an identical, independently-maintained twin at
 * backend/src/moon.ts (backend scoring path). The two must stay logically
 * identical -- see that file's header comment for the reverse pointer. Keep
 * both in sync by hand (same hand-sync convention already used for
 * solar.ts / season.ts).
 *
 * Two independent pieces, each with its own documented accuracy budget:
 *
 * 1. `moonIlluminatedFraction` -- moon phase (0 = new, 1 = full) via a
 *    "standard synodic approximation": elapsed time since a known reference
 *    new moon, taken modulo the mean synodic month length, mapped through
 *    (1 - cos(2*pi*phase)) / 2. This ignores the real (small, sub-day)
 *    month-to-month variation in synodic period, so illuminated fraction
 *    from this method can be off by a percent or two versus a precise
 *    ephemeris -- far more precision than a soft scoring penalty needs.
 *
 * 2. `moonAltitudeDeg` -- a low-precision lunar position: truncated
 *    periodic series for ecliptic longitude/latitude (the single largest
 *    correction term for each -- the same style of "a few lines of
 *    trigonometry" approximation Meeus's *Astronomical Algorithms* and
 *    similar references use for casual applications, good to roughly a few
 *    tenths of a degree in the Moon's own apparent position), converted to
 *    equatorial RA/Dec with a fixed mean obliquity (ignoring nutation and
 *    its slow secular drift), then to local altitude via a simplified
 *    Greenwich Mean Sidereal Time formula. Compounding these
 *    simplifications, expect altitude accuracy on the order of a degree or
 *    two -- plenty for a soft, capped, gently-ramping scoring penalty (see
 *    scoring.ts's computeMoonPenaltyPoints), which is never used as a hard
 *    threshold.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function toJulianDay(dateUtcMs: number): number {
  return dateUtcMs / 86400000 + 2440587.5;
}

function normalizeDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

// Mean synodic month (new moon to new moon), days.
const SYNODIC_MONTH_DAYS = 29.530588861;
// A known reference new moon (2000-01-06, ~18:14 UTC) expressed as a Julian
// day. Any reference new moon works equally well here -- illuminated
// fraction only depends on elapsed time modulo the synodic month length,
// not on which specific new moon is chosen as the anchor.
const REFERENCE_NEW_MOON_JD = 2451550.1;

/**
 * Illuminated fraction of the Moon's visible disk, 0 (new) to 1 (full), for
 * a given UTC instant. See this file's header comment for the method and
 * its accuracy budget.
 */
export function moonIlluminatedFraction(dateUtcMs: number): number {
  const jd = toJulianDay(dateUtcMs);
  const daysSinceReference = jd - REFERENCE_NEW_MOON_JD;
  const phase = (((daysSinceReference % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS) / SYNODIC_MONTH_DAYS;

  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

// Fixed mean obliquity of the ecliptic (roughly the J2000 value); ignoring
// its slow secular drift and nutation is well within this module's
// documented few-degree accuracy budget.
const MEAN_OBLIQUITY_DEG = 23.4393;

/**
 * Moon altitude in degrees (positive = above horizon) for a given UTC
 * instant and observer latitude/longitude. See this file's header comment
 * for the method (truncated low-precision lunar position) and its accuracy
 * budget (expect errors up to a degree or two).
 */
export function moonAltitudeDeg(dateUtcMs: number, lat: number, lon: number): number {
  const jd = toJulianDay(dateUtcMs);
  const d = jd - 2451545.0; // days since J2000.0

  // Low-precision lunar position: mean longitude L, mean anomaly M, and
  // argument of latitude F (each a linear function of days-since-epoch),
  // plus the single largest periodic correction term for longitude and for
  // latitude. This is the standard "few-line" truncation of Brown's lunar
  // theory used for casual/low-precision applications.
  const L = normalizeDeg(218.316 + 13.176396 * d);
  const M = normalizeDeg(134.963 + 13.064993 * d);
  const F = normalizeDeg(93.272 + 13.22935 * d);

  const eclipticLonDeg = normalizeDeg(L + 6.289 * Math.sin(M * DEG2RAD));
  const eclipticLatDeg = 5.128 * Math.sin(F * DEG2RAD);

  const lonRad = eclipticLonDeg * DEG2RAD;
  const latRad = eclipticLatDeg * DEG2RAD;
  const obliquityRad = MEAN_OBLIQUITY_DEG * DEG2RAD;

  const raRad = Math.atan2(
    Math.sin(lonRad) * Math.cos(obliquityRad) - Math.tan(latRad) * Math.sin(obliquityRad),
    Math.cos(lonRad)
  );
  const decRad = Math.asin(
    Math.sin(latRad) * Math.cos(obliquityRad) + Math.cos(latRad) * Math.sin(obliquityRad) * Math.sin(lonRad)
  );

  // Greenwich Mean Sidereal Time, simplified linear-in-days formula
  // (degrees) -- accurate to a fraction of a degree, well inside this
  // module's documented tolerance.
  const gmstDeg = normalizeDeg(280.16 + 360.9856235 * d);
  const lstDeg = normalizeDeg(gmstDeg + lon);
  const hourAngleDeg = normalizeDeg(lstDeg - raRad * RAD2DEG);
  const hourAngleRad = hourAngleDeg * DEG2RAD;

  const observerLatRad = lat * DEG2RAD;
  const sinAlt =
    Math.sin(decRad) * Math.sin(observerLatRad) + Math.cos(decRad) * Math.cos(observerLatRad) * Math.cos(hourAngleRad);

  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD2DEG;
}
