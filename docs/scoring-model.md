# Scoring model

This documents every constant in the aurora-viewing scoring model, and why it
has the value it does. The model is implemented in two independently
maintained twins that must stay logically identical:

- Backend: `backend/src/scoring.ts` (+ `backend/src/solar.ts` for darkness,
  `backend/src/moon.ts` for the moon factor).
- Frontend (direct-source path, used when `EXPO_PUBLIC_USE_BACKEND=false`):
  `src/scoring/score.ts` (+ `src/scoring/solar.ts`, `src/scoring/moon.ts`).

Where a constant below is marked **heuristic**, it was picked by feel during
early development against a handful of real Tromsø nights, not derived from a
formula or external dataset. Moving it changes *how aggressively* the score
reacts to that input, not the input's underlying meaning -- treat it as a
dial, not as a fact worth defending.

## `computeScore(cloudCover, kp, distanceKm, lightPollution, cloudLayers?)`

The core per-hour, per-spot score, 0-100.

### Latitude-aware KP curve: `kpAuroraFactor(kp)`

**Replaces the old flat `kp * 15` line with a piecewise-linear curve, hand-fit
to Tromso's magnetic latitude specifically.** The planetary K-index (KP) is a
*global* activity index; how far south the aurora is actually visible for a
given KP depends on geomagnetic (not geographic) latitude. Tromso sits at
roughly 69.65deg geographic latitude but only **~66.7deg corrected geomagnetic
latitude** (hard-coded as `TROMSO_MAGNETIC_LATITUDE_DEG` in both twins -- a
single named constant rather than a per-request calculation, because this app
is deliberately single-region by product decision, not because the
underlying physics only works for one place). That geomagnetic latitude sits
close enough to the auroral oval's typical quiet-time position that overhead
displays are genuinely common even at low planetary Kp.

The old `kp * 15` line implied Kp 2 was "barely anything" and Kp 9 was
"maximum, unambiguously the best possible night." Both are wrong for Tromso
specifically:

- **Kp 0-2 is not "nothing happening" here.** The curve rises steeply over
  this range (20 points at Kp 0 up to 80 at Kp 2) because overhead aurora is
  a realistic, common occurrence on quiet nights at this magnetic latitude --
  a clear, dark Kp 2 night in Tromso is genuinely a good night, not a
  marginal one, and the curve now says so (a clear-sky, Kp 2 hour scores
  meaningfully higher than it did under the old linear curve -- see the
  worked example below).
- **Kp 2-4 keeps climbing** (80 -> 125 points): this is the classic "good,
  active night" range, and remains the steepest part of the curve.
- **Kp 6+ gently plateaus and slightly rolls off** (peaking at 130 points at
  Kp 6, easing back to 110 by Kp 9) rather than climbing further, because
  very high Kp pushes the auroral oval's equatorward edge *south* of
  Tromso's latitude (the well-documented "equatorward expansion" of the oval
  during geomagnetic storms). That means a Kp 8-9 night can genuinely put on
  a *weaker* overhead show in Tromso specifically than a moderate Kp 4-6
  night, even though Kp 8-9 is a bigger storm globally. This is modeled as a
  soft, gentle rolloff -- not a cliff -- because it's a real but gradual
  effect, and because a big storm can still produce spectacular (if
  lower-overhead) displays even when the oval's core has moved on.

The curve's control points (`KP_AURORA_CURVE` in both twins), each a
`[kp, points]` pair connected by straight lines:

| Kp  | Points | Note |
| --- | ------ | ---- |
| 0   | 20     | quiet, but overhead aurora is still plausible at this latitude |
| 2   | 80     | "a good night in Tromso" -- boosted well above the old linear value (30) |
| 4   | 125    | near-peak: strong, active night |
| 6   | 130    | peak: the oval's edge is approaching Tromso's own latitude |
| 9   | 110    | gentle rolloff: the oval has expanded south past Tromso |

The output is expressed in the same units as the old `kp * 15` line (roughly
0-135) so it plugs into the unchanged 0.7/0.3 blend below without any other
formula changes. **Heuristic in its exact shape** (the control-point values
themselves were picked by feel, the same as every other constant in this
file) but **not heuristic in its premise**: that Tromso's magnetic latitude
makes low-to-moderate Kp more valuable, and extreme Kp only mildly more
valuable (or slightly less), than a naive linear scale suggests, reflects
real auroral-oval geometry, not a stylistic preference. Moving a control
point up/down changes how much that specific Kp range is worth; flattening
the Kp 6-9 segment further would understate the real (if gradual)
equatorward-expansion effect, while steepening it into a hard drop would
overstate how quickly Tromso's own view degrades during a major storm.

**Worked calibration example:** a clear (0% cloud), dark, Kp 2 night at a
0-light-pollution, 0-distance spot now scores `0.7*100 + 0.3*80 = 94` before
the darkness/moon factors, versus `0.7*100 + 0.3*30 = 79` under the old
linear curve -- a deliberate, meaningful boost reflecting that this is
genuinely a good night to go out in Tromso, not a marginal one.

### Cloud/KP blend: `0.7 * cloudFactor + 0.3 * kpFactor`

**Heuristic.** `cloudFactor = 100 - effectiveCloudCover` (see "Layered
clouds" below for how `effectiveCloudCover` is derived), i.e. "how much
clear sky is available." The 0.7/0.3 split says: clear sky matters roughly
twice as much as KP activity for whether *anything* will be visible tonight,
because no amount of geomagnetic activity is visible through solid overcast,
whereas a merely-clear sky with low KP can still occasionally show a faint
aurora. Raising the cloud weight (and lowering KP's) makes the model more
conservative about calling cloudy nights "good" even during a big storm;
lowering it makes big-KP nights score well even through more cloud.

### Layered clouds: `computeEffectiveCloudCover`

**Upgrade from a single cloud-cover percentage to three independent
layers.** MET Norway's locationforecast compact API also reports
`cloud_area_fraction_low` / `_medium` / `_high` alongside the aggregate
`cloud_area_fraction`. Not all cloud is equally aurora-blocking: low, dense
cloud is opaque, while high, thin cirrus is often visibly translucent -- a
bright aurora can punch through a hazy cirrus layer that would fully hide it
behind low stratus.

Each layer is treated as an independent, partially-transparent veil, with a
named blocking weight (**heuristic, priors to be validated against real
outcome data as it accumulates -- see docs/roadmap-2026-27.md's Phase 3 data
iteration**):

- `CLOUD_LOW_BLOCKING = 1.0` -- low cloud is dense and close to the ground;
  treated as fully opaque.
- `CLOUD_MEDIUM_BLOCKING = 0.75` -- mid-level cloud mostly blocks, but
  thinner patches can leak some light through.
- `CLOUD_HIGH_BLOCKING = 0.4` -- high cloud is frequently thin cirrus, which
  is often noticeably translucent.

The three layers' transmissions (`1 - weight * fraction`) multiply together
into a single effective transmission, converted back to an effective 0-100
"cloud cover" for the existing `cloudFactor` formula above -- so a sky that's
80% covered in high cirrus alone is scored quite differently (transmission
`1 - 0.4*0.8 = 0.68`, i.e. an *effective* cloud cover of 32) from the same
80% covered in low stratus (transmission `1 - 1.0*0.8 = 0.2`, effective
cloud cover of 80).

**Graceful degradation is the point, not an afterthought:** whenever any of
the three layer fields is missing -- an older cached snapshot from before
this change, or any source that only ever populates the aggregate field --
`computeEffectiveCloudCover` falls back to the plain `cloudCover` value
untouched, exactly reproducing the pre-upgrade behavior. `sources.ts`'s
deterministic fallback forecast (used when the MET API itself is
unreachable) also emits a plausible layered split rather than omitting the
fields, so even a fully-offline forecast exercises the same code path.

### Light pollution penalty: `lightPollution * 5`

**Heuristic.** `lightPollution` is a small integer per spot (see
`src/data/spots.json`, roughly a 0-5 hand-assigned scale describing how much
ambient light washes out the sky at that location). Each unit subtracts a
flat 5 points. This is a straightforward linear penalty rather than anything
photometric -- it exists to consistently rank a dark wilderness spot above a
similar spot near town lighting, not to model actual sky-brightness units.
Raising the per-unit penalty makes light pollution a stronger differentiator
between otherwise-similar spots.

### Distance penalty: `distanceKm * 1.15` drive-time proxy, 120-minute threshold

**Heuristic, but grounded.** `distanceKm * 1.15` estimates drive minutes from
straight-line/road distance (1.15 minutes per km is roughly ~52 km/h average,
a reasonable rough proxy for Tromsø-area roads in winter conditions,
including stops and slower rural stretches -- not a real routing-API
estimate). No penalty applies under 120 minutes (2 hours): a 2-hour drive is
treated as the practical ceiling for "still doable for a tonight outing,"
below which distance shouldn't discourage the visit at all. Past that
threshold, every excess minute costs `0.35` points (also heuristic) so that
very far spots trail off gradually rather than being disqualified outright.
Lowering the 120-minute threshold penalizes moderate drives that are
currently free; raising the per-minute rate makes far spots drop out of
contention faster once they cross the threshold.

## Cloud gate: `applyCloudGate` (>80% cloud cover)

If the best hour's cloud cover exceeds 80%, the spot's score is hard-capped
at 20 and its trend is forced to `'worse'`, regardless of what the raw
weighted score computed to. **Heuristic threshold**, chosen as "this is
functionally overcast, don't let a high KP number alone make the UI claim a
good night." Without this gate, a very high KP could still produce a
misleadingly high score at 85% cloud cover from the 0.3 KP term alone.
Lowering the 80% threshold makes the app more pessimistic about marginal
cloud; raising it lets more cloudy-but-active nights through uncapped.

## Darkness ramp: `darknessFactor` (-6deg / -11deg elevation)

Implemented in `solar.ts` (both twins). Aurora is physically invisible
against a bright sky (e.g. Tromsø's midnight sun in summer), independent of
cloud cover or KP, so every hourly score is multiplied by a `darknessFactor`
based on solar elevation at the spot's own coordinates:

- **Not a heuristic** in *kind* -- these are recognized twilight boundaries:
  -6deg is the end of civil twilight (sky still has meaningful ambient
  light), -11deg is between nautical and astronomical twilight, used here as
  a practical "dark enough to see aurora" cutoff.
- The specific numbers -6 / -11 (rather than, say, -6 / -12 astronomical
  twilight exactly) **are** a heuristic choice of "practical enough to see
  aurora," picked to be a bit more permissive than the strictest
  astronomical-darkness definition, since aurora is often visible somewhat
  before full astronomical night. Moving -11 further negative makes the
  model wait for darker skies before crediting any score; narrowing the gap
  to -6 makes the ramp shorter/steeper.
- Between the two thresholds, `darknessFactor` ramps linearly from 0 to 1.

## Moon factor: `computeMoonPenaltyPoints` (+ `moon.ts`)

A bright moon high in the sky washes out faint aurora the same way a bright
sky does, just less totally -- a strong substorm still punches through
moonlight, but a faint, quiet-night glow can be lost in it. This is applied
per-hour, alongside `darknessFactor`, using the hour's own timestamp and the
spot's own coordinates (rather than inside `computeScore`, which has no
notion of time or place).

**Two independent astronomical approximations, implemented in the new
`moon.ts` twin pair** (`backend/src/moon.ts` / `src/scoring/moon.ts`):

- **`moonIlluminatedFraction`** -- moon phase (0 = new, 1 = full) via a
  standard synodic approximation: elapsed time since a known reference new
  moon, taken modulo the mean synodic month (29.530588861 days), mapped
  through `(1 - cos(2*pi*phase)) / 2`. This ignores the small, real
  month-to-month variation in synodic period, so it can be off by a percent
  or two versus a precise ephemeris -- far more precision than a soft scoring
  penalty needs.
- **`moonAltitudeDeg`** -- a low-precision lunar position: the single largest
  periodic correction term for the moon's ecliptic longitude and latitude
  (the standard "few-line" truncation of Brown's lunar theory used for
  casual/low-precision applications, good to roughly a few tenths of a
  degree in the moon's own apparent position), converted to equatorial
  RA/Dec with a fixed mean obliquity (ignoring nutation), then to local
  altitude via a simplified Greenwich Mean Sidereal Time formula. Compounding
  these simplifications, **expect altitude accuracy on the order of a degree
  or two** -- this is explicitly a "few degrees is plenty" approximation, not
  a precision ephemeris, because the penalty it feeds is a soft, gently-
  ramping, capped multiplier rather than a hard threshold (a couple of
  degrees of error near the ramp's edges shifts the penalty by a small
  fraction of a point, not by whether the moon "counts" at all).

**The penalty itself (`computeMoonPenaltyPoints`), all named constants,
heuristic and capped:**

- `MOON_ILLUMINATION_RAMP_START = 0.5` -- below half-illuminated, no washout
  is modeled at all; only a moon that's at least half-full is bright enough
  to matter here.
- `MOON_ALTITUDE_RAMP_DEG = 30` -- the penalty ramps from 0 (at or below the
  horizon) to full strength by roughly 30deg altitude; a moon low on the
  horizon washes out far less sky than one high overhead.
- `KP_MOON_IRRELEVANT_AT = 7` -- the penalty is damped by
  `1 - kp / KP_MOON_IRRELEVANT_AT` (clamped to 0-1), so it fades out as Kp
  rises and is fully zero by Kp 7 -- a bright aurora is visible through
  moonlight; a faint one isn't, so the moon should only matter on the nights
  it would otherwise be marginal.
- `MOON_MAX_PENALTY_POINTS = 15` -- a hard cap on the total point deduction,
  regardless of how bright/high the moon is or how low Kp is. This keeps the
  moon a *mild* factor by construction, consistent with a full moon, high in
  the sky, on an otherwise-faint (low-Kp) night costing "roughly 10-20 score
  points" as intended, and never a swing large enough on its own to turn a
  genuinely great night into a bad one.

**Calibration examples:** a full moon (`illuminatedFraction = 1`) directly
overhead (`altitudeDeg >= 30`) on a quiet night (`kp = 0`) costs the full
`MOON_MAX_PENALTY_POINTS = 15` points. The same moon on a Kp 7+ night costs
0 points (`kpDampening` reaches 0 at `KP_MOON_IRRELEVANT_AT`). A new moon, or
a full moon still below the horizon, costs 0 points regardless of Kp.

**Judgment call:** the cap is a flat point value rather than something tied
to the app's alert-tier thresholds (see `alerts.ts`) -- deliberately, to
avoid coupling the scoring model to alerting configuration it has no other
reason to know about. In practice the Kp-dampening term already protects
genuinely Kp-driven "great" nights (moonlight barely matters once Kp is
high), but a great night driven mostly by exceptionally clear skies at low
Kp could in principle still lose close to the full 15 points to a bright,
high moon. This is an accepted, intentionally mild trade-off, not an
oversight -- 15 points is small enough relative to a "great" (>=70) night
that it should rarely, if ever, single-handedly cross a meaningfully lower
tier.

## Cold-score dress thresholds: 80 / 60 / 40

`computeColdScore` derives a 0-100 "how cold does it feel" score from
temperature and wind (`(2 - perceived) * 6.5`, itself a **heuristic**
perceived-cold formula, not a standard wind-chill formula). The resulting
score is bucketed into dress-advice tiers:

- `>= 80` -- Arctic setup (thermal base, insulated mid-layer, down jacket,
  windproof shell, mittens, warm boots)
- `>= 60` -- Very cold (wool base layer, fleece/down mid-layer, insulated
  jacket, hat, gloves, winter boots)
- `>= 40` -- Cold (layered top, insulated jacket, gloves, warm footwear)
- `< 40` -- Cool (light layers plus a wind-resistant outer jacket)

**Heuristic thresholds and heuristic copy**, tuned to feel right for
Tromsø-area winter conditions rather than derived from an official
cold-weather advisory scale. Moving a threshold up/down shifts how much
temperature/wind it takes before the app recommends the next tier of
warmer clothing.

## Trend thresholds: 55 / 40 / +8

`deriveTrend` (both twins) decides the `good_now` / `improving` / `worse`
label shown next to a spot's headline score. The headline `score` on
`SpotScoreResult` is always the *best* hour's score (see `scoreSpot`), so
trend is judged against that same best hour rather than against
`hourlyScores[0]` in isolation -- otherwise the UI could show e.g.
"80 - good now" when the 80 is actually five hours away.

- `GOOD_SCORE = 55` -- **heuristic** "good" bar: the headline score itself
  is high enough that heading out now is worth it.
- `DECENT_SCORE = 40` -- **heuristic** floor below which a later hour isn't
  worth flagging as an upgrade worth waiting for.
- `MEANINGFUL_IMPROVEMENT = 8` (points) -- **heuristic** minimum gain over
  the current hour's score to call a later hour "meaningfully better,"
  rather than noise-level variation.
- `IMMINENT_INDEX = 1` -- "now-or-imminent" means the best-scoring hour is
  at index 0 (this hour) or index 1 (the next hour) of `hourlyScores`.

Logic:

```
isImminent = bestIndex <= IMMINENT_INDEX
improvement = bestScore - current   // current = hourlyScores[0].score

if isImminent && bestScore >= GOOD_SCORE:                       'good_now'
if !isImminent && bestScore >= DECENT_SCORE && improvement >= MEANINGFUL_IMPROVEMENT: 'improving'
otherwise:                                                       'worse'
```

Moving `GOOD_SCORE`/`DECENT_SCORE` down makes the app call more nights
"good"/"improving" than before; raising `MEANINGFUL_IMPROVEMENT` makes
`'improving'` rarer (requires a bigger jump before bothering to say "wait for
later"); raising `IMMINENT_INDEX` widens what counts as "now" for
`good_now` purposes.
