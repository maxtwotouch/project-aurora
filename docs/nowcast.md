# Nowcast

`backend/src/nowcast.ts` produces `TonightSnapshot.nowcast` (`NowcastSummary`,
`backend/src/types.ts`): an additive, optional, real-time **"is it happening
right now"** signal, assembled in `snapshot.ts`'s `buildTonightSnapshot`.

**This is not the planning score.** `docs/scoring-model.md` covers the 0-100
per-spot/per-hour score (`scoring.ts`) that drives tonight's outlook and best
viewing window -- that's about *tonight*, driven by weather + Kp, and it
never reads from the nowcast. The nowcast is about *right now*, driven by
live solar wind + the OVATION aurora-oval model (+ best-effort ground
magnetometer truth), and it never writes to the planning score or to
`alerts.ts`. They are deliberately independent signals shown side by side.

## Sources

### 1. Solar wind at L1 (NOAA SWPC) -- required

- IMF Bz: `https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json`
- Speed/density: `https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json`

**Deviation from the original task brief, recorded here for anyone
revisiting this:** the brief specified
`https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json` and
`.../plasma-1-day.json` (array-of-arrays, same family as the Kp endpoints
`sources.ts` already parses). Live-probing those from the implementation
sandbox on 2026-07-27 got a genuine 404 straight from NOAA's CloudFront (not
a local/proxy issue) -- `https://services.swpc.noaa.gov/products/` no longer
lists a `solar-wind/` subdirectory at all. The functional replacement NOAA
currently serves is `/json/rtsw/` ("real-time solar wind"): JSON
array-of-*objects* (not array-of-arrays), each with a `time_tag`, an
`active` flag (which spacecraft -- ACE/DSCOVR/etc -- is the current
official real-time source; other rows are stale/backup), and the physical
fields. This module targets the live endpoint. If NOAA restores or replaces
the `/products/solar-wind/` files again, only `nowcast.ts`'s two URL
constants and its two small parsers (`extractLatestBz`,
`extractLatestPlasma`) need to change -- the rest of the module (thresholds,
`deriveNowcastLevel`, the snapshot wiring) is agnostic to the wire format.

Sample row (`rtsw_mag_1m.json`, 2026-07-27T08:27 UTC, trimmed):

```json
{ "time_tag": "2026-07-27T08:27:00", "active": true, "source": "ACE", "bz_gsm": 2.14 }
```

Sample row (`rtsw_wind_1m.json`, 2026-07-27T08:28 UTC, trimmed):

```json
{ "time_tag": "2026-07-27T08:28:00", "active": true, "source": "ACE", "proton_speed": 386.34, "proton_density": 1.39 }
```

**Physics.** The interplanetary magnetic field's north-south component
(`Bz`, in the GSM frame, which is aligned with Earth's magnetic dipole) is
*the* primary driver of dayside/nightside reconnection with Earth's
magnetosphere: southward IMF (`Bz` negative) couples efficiently and drives
geomagnetic activity; northward IMF (`Bz` positive) mostly doesn't. This is
why `deriveNowcastLevel` treats `Bz` as the headline driver rather than
speed or density alone.

L1 (where these spacecraft sit) is roughly 1.5 million km upstream of Earth,
so a reading there gives lead time before that solar wind parcel actually
reaches the magnetosphere -- typically **~30-60 minutes** at typical solar
wind speeds (400-800 km/s). `nowcast.ts#computeLeadTimeMinutes` estimates
this as `(1,500,000 km / speed_km_per_s) / 60`. This is a ballpark, not a
guarantee (see Limitations).

**Parsing.** Both files can contain inactive/stale rows and rows missing the
field we need; `nowcast.ts#pickLatestComplete` scans for the newest row
(by parsed `time_tag`, not array position -- the array is not guaranteed
strictly time-sorted) that has the field populated, preferring rows marked
`active: true` but falling back to any complete row if none is marked
active.

### 2. OVATION aurora oval (NOAA SWPC) -- required

`https://services.swpc.noaa.gov/json/ovation_aurora_latest.json`

Sample shape (2026-07-27T08:27 UTC observation, trimmed):

```json
{
  "Observation Time": "2026-07-27T08:27:00Z",
  "Forecast Time": "2026-07-27T09:35:00Z",
  "Data Format": "[Longitude, Latitude, Aurora]",
  "coordinates": [[0, -90, 4], [0, -89, 0], "... ~65k rows ...", [359, 90, 0]],
  "type": "MultiPoint"
}
```

**Longitude convention (verified against the live payload, not assumed):**
the payload's own `"Data Format"` field documents each coordinate triple as
`[Longitude, Latitude, Aurora]`. Observed longitude values run **0 to 359**
(degrees **east**, not -180..180), latitude -90 to 90, on a 1-degree grid.
Tromso's ~18.9°E therefore maps directly onto the grid -- no
-180..180-style conversion needed.

**Window used:** max value over `|gridLon - 18.9| <= 2` AND
`|gridLat - 69.6| <= 2` (a 5x5-cell neighbourhood on the 1-degree grid, not
just the single nearest cell) -- see `OVATION_LON_WINDOW_DEG` /
`OVATION_LAT_WINDOW_DEG` in `nowcast.ts`. A window (rather than one cell)
avoids silently missing the local peak if Tromso's true position sits near a
grid boundary.

**"Aurora" semantics.** OVATION (Oval Variation, Assessment, Tracking,
Intensity, and Online Nowcasting) is a NOAA/SWPC empirical **model**, driven
by recent solar wind conditions, that estimates the aurora oval's position
and a probability/flux-like intensity value per grid cell -- it is not a
direct observation of aurora at that location. The payload names this value
"Aurora"; in the live sample above (quiet conditions) values in the Tromso
window topped out at 3 (max grid-wide: 28), consistent with SWPC's own
usage of this field as a 0-100-ish probability/intensity scale that runs
much higher during active/storm conditions.

**Forecast time.** `ovationForecastTime` is the payload's own `"Forecast
Time"` (its forward-looking nowcast validity time, distinct from
`"Observation Time"`) -- passed through as-is.

`ovation_aurora_latest.json` is ~0.9-1.6 MB; fetched with the same
`fetchWithTimeout`/`SOURCE_TIMEOUT_MS` discipline as every other source in
`sources.ts`, and parsed defensively (missing/malformed `coordinates` ->
`null`, never a throw).

### 3. TGO ground magnetometer (Tromso Geophysical Observatory / UiT) -- best-effort, currently a stub

A ground magnetometer directly over Tromso is the closest thing to local
ground truth: it measures the actual magnetic disturbance overhead, rather
than inferring it from solar wind ~30-60 minutes upstream or from a model.

**Investigation (2026-07-27):** `flux.phys.uit.no` / `geo.phys.uit.no` are
reachable. `flux.phys.uit.no/ascii/` presents a form (posting to
`https://flux.phys.uit.no/cgi-bin/mkascii.cgi`) with a Norwegian-mainland
site list that includes Tromso as `site=tro2a`, resolutions down to 1-minute
(`res=1min`), and a "Get Realtime Data" mode described as covering "the last
24 hours". This *looks* like exactly the machine-readable endpoint we
wanted.

However, TGO's own data-access page
(`https://flux.phys.uit.no/div/DataAccess.html`) states explicitly:

> "Digital data from DTU Space ... and TGO in ASCII format are available
> here, but are protected by a password. Requests for password should be
> directed to DTU Space for Danish/Greenlandic data and **to TGO for data
> from Norwegian magnetometers**."

We have no such password, and no confirmation from the observatory that
unauthenticated/automated polling of that CGI endpoint is an acceptable use
-- so wiring this up would mean either bypassing a stated access control or
guessing at an implicit exception, neither of which this PR should do
unilaterally.

**Outcome: implemented as a deliberate stub, not a working integration.**
`nowcast.ts#fetchTgoDisturbanceWithQuality` always returns
`{ tgoDisturbanceNt: null, usingFallback: true }`, with an inline comment
pointing back to this section. `NowcastSummary.tgoDisturbanceNt` is
currently always `null`, and `'tgo_magnetometer'` never appears in
`sourcesAvailable`. This does not block the PR -- solar wind + OVATION are
the two required sources and both are live.

**If a human owner later obtains a TGO password and activates this
source:** the derived measure should be "max `|deviation|` of the
horizontal `X`/`H` component from that hour's own baseline, in nT" (a
simple local-disturbance proxy), and -- per TGO's data-access page -- any
UI or documentation that displays TGO-derived data **must acknowledge
Tromso Geophysical Observatory / UiT (University of Tromso, The Arctic
University of Norway) as the source**. This applies whether the
attribution is legally required or not: TGO explicitly asks for it
("a reference or acknowledgement is expected as if the data were provided
directly").

## Interpretation: `deriveNowcastLevel`

Pure, deterministic, no Node imports -- copy-ready for a future
`src/scoring/` frontend twin the same way `scoring.ts` has one today (see
`docs/scoring-model.md`'s intro). Takes only `{ bz, ovationProbability }`
(both nullable) and returns one of `'quiet' | 'stirring' | 'active' |
'storming'`. Missing sources degrade gracefully: each level check only uses
whichever of the two inputs is non-null, rather than collapsing to `quiet`
just because one upstream failed.

### Threshold table (heuristic priors pending validation)

| Level      | Condition                                                              |
|------------|-------------------------------------------------------------------------|
| `storming` | `Bz <= -10 nT` **AND** OVATION probability `>= 50` (both signals, corroborating) |
| `active`   | `Bz <= -5 nT` **OR** OVATION probability `>= 20`                        |
| `stirring` | `Bz < 0 nT` **OR** OVATION probability `>= 5`                           |
| `quiet`    | none of the above (including: both sources unavailable)                 |

Named constants: `BZ_STORMING_THRESHOLD_NT` (-10), `BZ_ACTIVE_THRESHOLD_NT`
(-5), `BZ_STIRRING_THRESHOLD_NT` (0), `OVATION_STORMING_THRESHOLD` (50),
`OVATION_ACTIVE_THRESHOLD` (20), `OVATION_STIRRING_THRESHOLD` (5) -- all in
`nowcast.ts`.

These are **priors, not validated against real Tromso nowcast outcomes**
(no ground-truth "was aurora actually visible at that moment" dataset was
used to fit them) -- same "heuristic, treat as a dial" caveat
`docs/scoring-model.md` applies to its own constants. The -5/-10 nT Bz cut
points are commonly-cited rough thresholds in space-weather write-ups
("geomagnetic activity likely" / "strong coupling"); the OVATION cut points
were picked to roughly track the Bz ones, not derived from an OVATION-vs.
visible-aurora study specific to Tromso. `storming` additionally requires
**both** signals to agree, specifically so a single noisy one-minute Bz
spike (solar wind Bz is genuinely spiky at 1-minute cadence) can't alone
claim "storming" without OVATION corroborating it.

## `NowcastSummary` shape

See `backend/src/types.ts` for the authoritative, commented definition.
Field list: `updatedAt`, `level`, `bz`, `solarWindSpeed`,
`solarWindDensity`, `leadTimeMinutes`, `ovationProbability`,
`ovationForecastTime`, `tgoDisturbanceNt` (always `null` today),
`sourcesAvailable` (`('solar_wind' | 'ovation' | 'tgo_magnetometer')[]`).

`TonightSnapshot.nowcast` is optional; it is `undefined` whenever *every*
source failed (`sourcesAvailable` would otherwise be empty), so a NOAA/UiT
outage never affects the rest of the snapshot -- weather/Kp planning and
spot rankings build exactly as before nowcast existed.
`DataQuality.usingFallbackNowcast` mirrors that same total-failure case, next
to the existing `usingFallbackKp` / `usingFallbackSighting` flags.

## Limitations (read before treating this as a promise)

- **L1 lead time varies.** `leadTimeMinutes` is `distance / speed` with a
  single representative L1 distance (1.5M km); it ignores the solar wind
  parcel's actual travel direction and any acceleration/deceleration between
  L1 and Earth. Real arrival can differ by several minutes either way, and
  more at unusual speeds.
- **OVATION is a model, not an observation.** It estimates the oval from
  recent solar wind inputs; it can disagree with what a camera or a person
  standing outside sees at that instant, especially during rapidly-evolving
  substorms.
- **The Bz reading is effectively instantaneous**, not literally "sustained"
  over a trailing window -- we take the single latest valid 1-minute sample,
  not e.g. a trailing 30-minute average. A short-lived spike can therefore
  briefly push the level up before reverting. A trailing-window average
  would be a reasonable future refinement.
- **Nowcast != guarantee of visible aurora.** Even a `storming` reading
  still needs a dark, clear sky over Tromso (see the separate planning
  score / `sightingPossibleFrom` / darkness-season fields) to actually be
  visible to a person on the ground.
- **TGO is currently not wired up at all** (see above) -- today's nowcast is
  solar-wind + OVATION only, with no local ground-truth corroboration.
