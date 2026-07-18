/**
 * Solar position math -- the standard NOAA General Solar Position
 * Calculations approximation (declination + equation of time + hour angle),
 * the same approach behind NOAA's public sunrise/sunset calculator:
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 *
 * Ignores atmospheric refraction; accurate to roughly ~0.5 degrees, which is
 * plenty for gating aurora visibility on darkness.
 *
 * MIRROR: this file has an identical, independently-maintained twin at
 * backend/src/solar.ts (backend scoring path). The two must stay logically
 * identical -- see that file's header comment for the reverse pointer. Keep
 * both in sync by hand if this math ever changes (same hand-sync convention
 * already used for the dress-advice thresholds in score.ts /
 * backend/src/scoring.ts, see dressLevelFromColdScore's comment).
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function toJulianDay(dateUtcMs: number): number {
  return dateUtcMs / 86400000 + 2440587.5;
}

/**
 * Solar elevation angle in degrees (positive = above horizon, negative =
 * below) for a given UTC instant and observer latitude/longitude.
 */
export function solarElevationDeg(dateUtcMs: number, lat: number, lon: number): number {
  const jd = toJulianDay(dateUtcMs);
  const t = (jd - 2451545) / 36525;

  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const mRad = m * DEG2RAD;
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const c =
    Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mRad) * 0.000289;

  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const apparentLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG2RAD);

  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquityCorrected = meanObliquity + 0.00256 * Math.cos(omega * DEG2RAD);

  const declinationRad = Math.asin(Math.sin(obliquityCorrected * DEG2RAD) * Math.sin(apparentLong * DEG2RAD));

  const y = Math.tan((obliquityCorrected * DEG2RAD) / 2) ** 2;
  const l0Rad = l0 * DEG2RAD;
  const eqTimeMinutes =
    4 *
    RAD2DEG *
    (y * Math.sin(2 * l0Rad) -
      2 * e * Math.sin(mRad) +
      4 * e * y * Math.sin(mRad) * Math.cos(2 * l0Rad) -
      0.5 * y * y * Math.sin(4 * l0Rad) -
      1.25 * e * e * Math.sin(2 * mRad));

  const date = new Date(dateUtcMs);
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  // No timezone term here (unlike the NOAA spreadsheet, which subtracts
  // 60*timezone) -- we work entirely in UTC, so the local standard-time
  // offset is implicitly zero.
  let trueSolarTime = (utcMinutes + eqTimeMinutes + 4 * lon) % 1440;
  if (trueSolarTime < 0) trueSolarTime += 1440;

  // trueSolarTime is always in [0, 1440) after the modulo above, so the
  // hour angle is always trueSolarTime/4 - 180 (the NOAA spreadsheet's
  // "< 0" branch is unreachable here but kept in spirit via the modulo
  // normalization above).
  const hourAngleDeg = trueSolarTime / 4 - 180;

  const latRad = lat * DEG2RAD;
  const hourAngleRad = hourAngleDeg * DEG2RAD;
  const cosZenith =
    Math.sin(latRad) * Math.sin(declinationRad) + Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const clampedCosZenith = Math.max(-1, Math.min(1, cosZenith));
  const zenithDeg = Math.acos(clampedCosZenith) * RAD2DEG;

  return 90 - zenithDeg;
}

/**
 * 0 when the sky is still too bright for aurora to be visible (elevation at
 * or above -6deg -- civil twilight or brighter), 1 when it's dark enough
 * (elevation at or below -11deg -- between nautical and astronomical
 * twilight, a practical "dark enough for aurora" threshold), and a linear
 * ramp in between.
 */
export function darknessFactor(elevationDeg: number): number {
  if (elevationDeg >= -6) return 0;
  if (elevationDeg <= -11) return 1;
  return (-6 - elevationDeg) / 5;
}
