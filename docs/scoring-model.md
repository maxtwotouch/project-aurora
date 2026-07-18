# Scoring model

This documents every constant in the aurora-viewing scoring model, and why it
has the value it does. The model is implemented in two independently
maintained twins that must stay logically identical:

- Backend: `backend/src/scoring.ts` (+ `backend/src/solar.ts` for darkness).
- Frontend (direct-source path, used when `EXPO_PUBLIC_USE_BACKEND=false`):
  `src/scoring/score.ts` (+ `src/scoring/solar.ts`).

Where a constant below is marked **heuristic**, it was picked by feel during
early development against a handful of real Tromsø nights, not derived from a
formula or external dataset. Moving it changes *how aggressively* the score
reacts to that input, not the input's underlying meaning -- treat it as a
dial, not as a fact worth defending.

## `computeScore(cloudCover, kp, distanceKm, lightPollution)`

The core per-hour, per-spot score, 0-100.

### KP weighting: `kp * 15`

**Heuristic.** The planetary K-index (KP) ranges roughly 0-9 in practice
(the scale technically tops out higher during extreme storms, hence the
clamp below). `kp * 15` maps that range onto roughly 0-135 raw points before
the 0.3 blend weight and the final 0-100 clamp are applied, so that KP alone
is capable of carrying a spot from "not worth it" to "clamped at 100" when
skies are clear. `kp * 15` was chosen because it makes KP feel like the
dominant lever once skies are clear -- as it should be, since a bright aurora
is visible through moderate cloud but a dim one (low KP) usually isn't
visible at all. Increasing this multiplier makes the score more
KP-sensitive (a jump from KP 3 to KP 5 swings the score more); decreasing it
makes cloud cover dominate more.

### Cloud/KP blend: `0.7 * cloudFactor + 0.3 * kpFactor`

**Heuristic.** `cloudFactor = 100 - cloudCover`, i.e. "how much clear sky is
available." The 0.7/0.3 split says: clear sky matters roughly twice as much
as KP activity for whether *anything* will be visible tonight, because no
amount of geomagnetic activity is visible through solid overcast, whereas a
merely-clear sky with low KP can still occasionally show a faint aurora.
Raising the cloud weight (and lowering KP's) makes the model more
conservative about calling cloudy nights "good" even during a big storm;
lowering it makes big-KP nights score well even through more cloud.

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
