import spots from './spots.json';
import { deriveTrend, dressLevelFromColdScore, type DressLevel } from '../scoring/score';
import type {
  AppDataQuality,
  DarknessSeasonState,
  GeneralForecastScore,
  HourlyForecast,
  KpTrend,
  Spot,
  SpotHourlyScore,
  SpotScoreResult
} from '../types';

/**
 * Deterministic, hand-crafted "open season, great night" snapshot for
 * Settings > Design preview (see src/preview/previewMode.ts). Its shape
 * exactly matches what useForecast (src/hooks/useForecast.ts) normally
 * produces from live sources, so every screen renders exactly as it would
 * on a genuinely good aurora night -- useful for the owner to review the
 * open-season design during Tromso's midnight-sun months, when the real
 * feed can never score above ~0.
 *
 * Deliberately self-contained rather than reusing scoring/score.ts's
 * scoreSpot(): that function gates every hourly score by the *real*
 * astronomical darkness at the *real* current date (src/scoring/solar.ts),
 * which would zero this out whenever preview mode is actually needed (i.e.
 * during polar day). The handful of pure helpers below (computeScore's
 * cloud/KP blend, deriveTrend, dressLevelFromColdScore) are still reused
 * where they don't carry that real-clock dependency, so the numbers this
 * produces stay consistent with how the live engine would score the same
 * cloud/KP inputs on a real dark night.
 */

const TONIGHT_HOURS = 13; // 18:00 tonight through 06:00 tomorrow, one entry per hour.
const HOUR_LABEL_START = 18;

// Regional cloud-cover curve (%), the same shape for every spot before its
// own jitter is applied: hazier in the evening, clearing through the
// 22:00-01:00 window, hazing back up before dawn. The trough (24-25%) is
// deliberately well above every HERO_CLOUD_OVERRIDES entry's own trough
// (Ersfjordbotn's 4-6%) so the jitter below -- and the floor clamp in
// cloudCurveForSpot -- can never accidentally let a "generic" spot's cloud
// cover (and therefore score) beat a hand-tuned hero spot.
const BASE_CLOUD_CURVE = [58, 52, 44, 36, 28, 25, 26, 31, 38, 46, 54, 60, 66];

// Planetary KP forecast (regional, same for every spot), peaking 22:00-00:00
// at ~4.3 -- the "KP ~4.3" tonight the owner asked for.
const KP_CURVE = [2.6, 3.0, 3.4, 3.9, 4.2, 4.3, 4.3, 4.1, 3.7, 3.3, 2.9, 2.6, 2.4];

// Typical clear Tromso autumn/winter night air temperature (deg C) and wind
// (m/s), same shape for every spot before jitter.
const BASE_TEMP_CURVE = [-2, -3, -4, -5, -6, -7, -7, -6.5, -6, -5, -4, -3, -2.5];
const BASE_WIND_CURVE = [3, 3, 2.5, 2, 2, 2.5, 3, 3.5, 4, 4.5, 4, 3.5, 3];

// Hand-tuned overrides for the "hero" spots called out in the design brief:
// Ersfjordbotn as tonight's clear standout, plus two visibly-varied runners
// up so the top-spots list doesn't read as a flat, suspiciously-uniform
// score ladder.
const HERO_CLOUD_OVERRIDES: Record<string, number[]> = {
  ersfjordbotn: [40, 32, 22, 12, 6, 4, 5, 9, 18, 28, 38, 46, 52],
  kattfjordvatnet: [50, 45, 38, 30, 22, 18, 15, 13, 16, 24, 34, 44, 50],
  grotfjord: [55, 48, 40, 30, 20, 18, 19, 24, 34, 44, 52, 58, 62]
};

const typedSpots = spots as Spot[];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function hashSeed(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Mirrors scoring/score.ts's computeScore exactly (cloud/KP blend, distance
 * and light-pollution penalties) -- deliberately duplicated rather than
 * imported so this file has zero dependency on scoreSpot's darkness gate.
 * See ../../docs/scoring-model.md for the rationale behind each constant. */
// Design-preview-only: deliberately kept on the old flat `kp * 15` line
// rather than the production kpAuroraFactor curve (see
// docs/scoring-model.md, "Latitude-aware KP curve") -- this generator is a
// hand-tuned synthetic fixture for Settings > Design preview, not the
// production formula, so it isn't wired up to track scoring-model changes.
function computeSampleScore(cloudCover: number, kp: number, distanceKm: number, lightPollution: number): number {
  const cloudFactor = 100 - cloudCover;
  const kpFactor = kp * 15;
  const estimatedDriveMinutes = distanceKm * 1.15;
  const distancePenalty = estimatedDriveMinutes > 120 ? (estimatedDriveMinutes - 120) * 0.35 : 0;
  const lightPenalty = lightPollution * 5;
  return clamp(0.7 * cloudFactor + 0.3 * kpFactor - distancePenalty - lightPenalty, 0, 100);
}

function computeSampleColdScore(temperature: number, windSpeed: number): number {
  const perceived = temperature - windSpeed * 0.9;
  return clamp(Math.round((2 - perceived) * 6.5), 0, 100);
}

const DRESS_ADVICE_TEXT: Record<DressLevel, string> = {
  arctic: 'Arctic setup: thermal base, insulated mid-layer, down jacket, windproof shell, mittens, warm boots.',
  veryCold: 'Very cold: wool base layer, fleece/down mid-layer, insulated jacket, hat, gloves, winter boots.',
  cold: 'Cold: layered top, insulated jacket, gloves, and warm footwear.',
  cool: 'Cool: light layers plus a wind-resistant outer jacket.'
};

/** Local copy of scoring/score.ts's findBestWindow (not exported there) --
 * picks the best 3-hour rolling-average window. */
function findSampleBestWindow(hourlyScores: SpotHourlyScore[]): { start: number; end: number } {
  let bestStart = 0;
  let bestWindowScore = -1;

  for (let i = 0; i <= hourlyScores.length - 3; i += 1) {
    const window = hourlyScores.slice(i, i + 3);
    const avg = window.reduce((sum, hour) => sum + hour.score, 0) / window.length;
    if (avg > bestWindowScore) {
      bestWindowScore = avg;
      bestStart = i;
    }
  }

  return { start: bestStart, end: bestStart + 2 };
}

function tonightHourTimestamps(now: () => number): Date[] {
  const base = new Date(now());
  return Array.from({ length: TONIGHT_HOURS }, (_, index) => {
    const hourOfDay = (HOUR_LABEL_START + index) % 24;
    const dayOffset = HOUR_LABEL_START + index >= 24 ? 1 : 0;
    const d = new Date(base);
    d.setHours(hourOfDay, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    return d;
  });
}

// Floor every "generic" (non-hero) spot's cloud cover at 20% -- deliberately
// above every HERO_CLOUD_OVERRIDES entry's own trough (Ersfjordbotn's own
// best hour is 4%, the next two hero runners-up bottom out at 15/18%), so
// no amount of per-spot jitter below can ever let a generic spot's score
// (cloud-driven, 0.7 weight -- see computeSampleScore) beat a hand-tuned
// hero spot. This is what keeps Ersfjordbotn tonight's clear #1 by
// construction rather than by luck of the jitter.
const GENERIC_CLOUD_FLOOR = 20;

function cloudCurveForSpot(spot: Spot): number[] {
  const override = HERO_CLOUD_OVERRIDES[spot.id];
  if (override) return override;

  const seed = hashSeed(spot.id);
  const baseJitter = (seed % 13) - 5; // spot-wide offset, -5..7
  return BASE_CLOUD_CURVE.map((cloud, index) => {
    const hourJitter = ((seed >> (index % 8)) % 7) - 3; // -3..3 per hour, deterministic
    return clamp(Math.round(cloud + baseJitter + hourJitter), GENERIC_CLOUD_FLOOR, 92);
  });
}

function curveForSpot(base: number[], spot: Spot, salt: number): number[] {
  const seed = hashSeed(spot.id + String(salt));
  return base.map((value, index) => {
    const jitter = ((seed >> (index % 8)) % 5) - 2; // -2..2, deterministic
    return Math.round((value + jitter) * 10) / 10;
  });
}

function buildSampleSpotResult(spot: Spot, hours: Date[]): { result: SpotScoreResult; forecast: HourlyForecast[] } {
  const cloudCurve = cloudCurveForSpot(spot);
  const tempCurve = curveForSpot(BASE_TEMP_CURVE, spot, 1);
  const windCurve = curveForSpot(BASE_WIND_CURVE, spot, 2).map((value) => Math.max(0, value));

  const forecast: HourlyForecast[] = hours.map((hour, index) => ({
    time: hour.toISOString(),
    cloudCover: cloudCurve[index],
    temperature: tempCurve[index],
    windSpeed: windCurve[index]
  }));

  const hourlyScores: SpotHourlyScore[] = forecast.map((hour, index) => ({
    time: hour.time,
    cloudCover: hour.cloudCover,
    temperature: Number(hour.temperature ?? 0),
    windSpeed: Number(hour.windSpeed ?? 0),
    score: computeSampleScore(hour.cloudCover, KP_CURVE[index], spot.distanceKm, spot.lightPollution)
  }));

  const { start, end } = findSampleBestWindow(hourlyScores);
  const windowSlice = hourlyScores.slice(start, end + 1);
  const bestHour = windowSlice.reduce((top, curr) => (curr.score > top.score ? curr : top), windowSlice[0]);
  const coldScore = computeSampleColdScore(bestHour.temperature, bestHour.windSpeed);

  const result: SpotScoreResult = {
    spotId: spot.id,
    spotName: spot.name,
    score: Math.round(bestHour.score),
    trend: deriveTrend(hourlyScores),
    bestWindowStart: hourlyScores[start].time,
    bestWindowEnd: hourlyScores[end].time,
    hourlyScores,
    cloudCoverAtBestHour: Math.round(bestHour.cloudCover),
    temperatureAtBestHour: Math.round(bestHour.temperature * 10) / 10,
    windSpeedAtBestHour: Math.round(bestHour.windSpeed * 10) / 10,
    coldScore,
    dressAdvice: DRESS_ADVICE_TEXT[dressLevelFromColdScore(coldScore)]
  };

  return { result, forecast };
}

export type SampleForecastSnapshot = {
  lastUpdatedAt: string;
  dataQuality: AppDataQuality;
  kp: KpTrend;
  rankedSpots: SpotScoreResult[];
  forecastsBySpotId: Record<string, HourlyForecast[]>;
  tonightScore: GeneralForecastScore;
  tomorrowScore: GeneralForecastScore;
  sightingPossibleFrom: string;
  darkness: DarknessSeasonState;
};

/**
 * Builds the sample snapshot fresh each call (rather than a static constant)
 * so its ISO timestamps always read as "tonight" relative to whenever
 * preview mode is actually toggled on -- everything else (scores, cloud,
 * KP, spot ranking) is fully deterministic.
 */
export function getSampleForecastSnapshot(now: () => number = Date.now): SampleForecastSnapshot {
  const hours = tonightHourTimestamps(now);

  const built = typedSpots.map((spot) => buildSampleSpotResult(spot, hours));
  const rankedSpots = built.map((item) => item.result).sort((a, b) => b.score - a.score);
  const forecastsBySpotId = built.reduce<Record<string, HourlyForecast[]>>((acc, item) => {
    acc[item.result.spotId] = item.forecast;
    return acc;
  }, {});

  const best = rankedSpots[0];

  const tonightScore: GeneralForecastScore = {
    label: best?.spotName,
    score: best?.score ?? 82,
    chance: 'High',
    cloudCover: best?.cloudCoverAtBestHour ?? 18,
    peakKp: 4.3,
    bestWindowStart: best?.bestWindowStart,
    bestWindowEnd: best?.bestWindowEnd
  };

  const tomorrowEvening = new Date(hours[0]);
  tomorrowEvening.setDate(tomorrowEvening.getDate() + 1);
  tomorrowEvening.setHours(22, 0, 0, 0);

  const tomorrowScore: GeneralForecastScore = {
    label: 'Tomorrow',
    score: 65,
    chance: 'Medium',
    cloudCover: 32,
    peakKp: 4.0,
    bestWindowStart: tomorrowEvening.toISOString(),
    bestWindowEnd: new Date(tomorrowEvening.getTime() + 2 * 60 * 60 * 1000).toISOString()
  };

  const kp: KpTrend = {
    current: 3.6,
    peakNext12h: 4.3,
    tonightPeak: 4.3,
    hourly: KP_CURVE,
    dailyOutlook: [
      { label: 'Today', peak: 4.3 },
      { label: 'Tomorrow', peak: 4.0 },
      { label: 'Day 3', peak: 3.2 }
    ]
  };

  const darkness: DarknessSeasonState = {
    seasonClosed: false,
    seasonReturns: null
  };

  const dataQuality: AppDataQuality = {
    sourceMode: 'direct',
    backendRequested: false,
    backendUnavailable: false,
    usingFallbackKp: false,
    fallbackWeatherSpotIds: []
  };

  return {
    lastUpdatedAt: new Date(now()).toISOString(),
    dataQuality,
    kp,
    rankedSpots,
    forecastsBySpotId,
    tonightScore,
    tomorrowScore,
    // Hand-picked per the design brief: sunset-based "aurora could be
    // visible from" time on a plausible early-autumn Tromso evening.
    sightingPossibleFrom: '20:30',
    darkness
  };
}
