# Spot geographic validation (pre-geofencing pass)

Date: 2026-08-18 · Branch: `fix/spot-coordinates` · Scope: all 28 spots in
`src/data/spots.json`.

This is the "geographic validation pass of all 28 spots before
implementation" required by `docs/design-trip-tracking.md` §3 (item 2) and
§7 (rollout step 3): verify every coordinate is a real on-land viewing
location, and derive per-spot Trip-mode geofence radii from the corrected
geometry (default 500 m, deterministic nearest-spot rule).

## Method

1. **Reverse geocoding** — OpenStreetMap Nominatim
   (`/reverse?format=jsonv2&zoom=18`), 1 request/second, custom
   User-Agent, responses cached locally. A pin whose only result is the
   municipality boundary 20–32 km away is in open water (Norwegian
   municipal polygons extend over the sea); category/type of
   bay/fjord/water is also treated as water.
2. **Road corroboration** — Overpass API: `highway=*` ways within 300 m of
   the pin (widened to 1500 m for suspicious ones). A curated viewing spot
   should have a road, pull-out, or parking nearby.
3. **Corrections** — Nominatim forward search for the spot's name /
   `parking` field, then snapped to the named OSM parking, bus stop, road,
   or settlement centre serving that exact place. Every corrected point was
   re-reverse-geocoded to confirm it lands on a mapped
   parking/road/building (all within 2–40 m of an OSM feature).
4. **Geometry** — pairwise haversine distances on the corrected set;
   radius rule: 500 m default, shrunk to at most half the distance to the
   nearest other spot (rounded down to 50 m, floor 150 m) where circles
   would overlap.

Verdicts: **OK** = on land with road access, unchanged. **FIXED** = pin was
in water or clearly displaced; high-confidence correction applied to
`spots.json`. **NEEDS-OWNER** = ambiguous; left unchanged, decision needed.

**Result: 17 OK · 9 FIXED · 2 NEEDS-OWNER.**

The nine bad pins share a pattern: eight sit in the sea west/off of Kvaløya
or in roadless terrain at longitudes ~18.13–18.37 / displaced 3–20 km from
the place their name refers to — they look hand-estimated rather than
looked up. Corrections keep the owner's intent: same named place, pin moved
to its parking/bus stop/settlement.

## Per-spot table

Radius = recommended Trip-mode geofence radius (m). Evidence links open the
(corrected) pin on openstreetmap.org.

| id | verdict | old → new (lat, lon) | snapped to (OSM evidence) | radius |
|---|---|---|---|---|
| ersfjordbotn | **FIXED** | 69.6626, 18.3738 → **69.6936, 18.6170** | Village parking on Ersfjordvegen, 75 m from "Ersfjordbotn skole" bus stop (the spot's busStop). Old pin: open sea. [map](https://www.openstreetmap.org/?mlat=69.6936&mlon=18.6170#map=16/69.6936/18.6170) | 500 |
| kattfjordvatnet | **FIXED** | 69.6667, 18.2000 → **69.6497, 18.4936** | Lakeside parking (OSM way 1416329732) on fv862 on Kattfjordvatnet's south shore. Old pin: open sea. [map](https://www.openstreetmap.org/?mlat=69.6497&mlon=18.4936#map=16/69.6497/18.4936) | 500 |
| grotfjord | **FIXED** | 69.7500, 18.2167 → **69.7779, 18.5398** | Grøtfjord beach parking (way 286125115) at the hamlet, 370 m from "Grøtfjord" bus stop. Old pin: open sea. [map](https://www.openstreetmap.org/?mlat=69.7779&mlon=18.5398#map=16/69.7779/18.5398) | 450 |
| sommaroy | OK | — | Håjavegen, Sommarøy; roads within 60 m. | 500 |
| sandvika_beach | OK | — | House on Nordvegen 78 m; residential road + beach tracks. | 500 |
| skulsfjord | **FIXED** | 69.7280, 18.2840 → **69.8006, 18.7525** | OSM parking named "Skulsfjord" with adjacent "Skulsfjord" bus stop on Skulsfjordvegen. Old pin: open sea. [map](https://www.openstreetmap.org/?mlat=69.8006&mlon=18.7525#map=16/69.8006/18.7525) | 500 |
| tromvik | **FIXED** | 69.7766, 18.1322 → **69.7794, 18.3991** | Tromvik village centre (OSM place node), Tromtindvegen fv7768 24 m away; bus stop "Tromvik" 580 m. Old pin: ~10 km west, roadless shore/islet (0 roads within 1.5 km). [map](https://www.openstreetmap.org/?mlat=69.7794&mlon=18.3991#map=16/69.7794/18.3991) | 500 |
| grunnfjord | **NEEDS-OWNER** | 69.7720, 18.1980 (unchanged) | Pin is in open sea west of Kvaløya. The only matching place in reach is Grunnfjorden hamlet on Ringvassøya (Karlsøy), proposed **69.9925, 19.5607** (road 23 m away, straight-line 32 km ≈ but ~70 km by road via Hansnes, vs `distanceKm: 45`). No Grunnfjord exists on Kvaløya near the other spots. Can't confirm intent. [proposed](https://www.openstreetmap.org/?mlat=69.9925&mlon=19.5607#map=15/69.9925/19.5607) | 500 |
| telegrafbukta | OK | — | Parking 256 m (Folkeparken area), residential roads. | 500 |
| prestvannet | OK | — | 75 m from Sommerlyst skole, at the lake's south side near listed parkings. | 500 |
| fjellheisen_storsteinen | OK | — | ~100 m from OSM parking named "Fjellheisen" (Sollivegen); cable-car base 300 m. | 150 |
| floya | OK | — | On "Langbakken" path at the Fløya/Sherpa-stairs trailhead in Tromsdalen (note: trailhead, not the 671 m summit — consistent with how visitors park and walk). | 150 |
| vardentoppen | **NEEDS-OWNER** | 69.6650, 18.9350 (unchanged) | Pin sits on a private house (Workinntoppen 11, 31 m). On land with roads, but a "hilltop viewpoint" shouldn't pin a residence. Nearest mapped viewpoint on the Tromsøya lit-trail ridge is 490 m south at **69.6606, 18.9358** — likely the intended Varden viewpoint, but unnamed in OSM so intent unconfirmed. [proposed](https://www.openstreetmap.org/?mlat=69.6606&mlon=18.9358#map=16/69.6606/18.9358) | 500 |
| breivikeidet_valley | **FIXED** | 69.6360, 19.6160 → **69.6566, 19.5716** | Parking named "Breivikeidet skole" (way 170825978) on fv91 at Breivikeidet hamlet, next to "Hov kryss"/"Breivikeidet skole" bus stops (spot's `parking`: "Breivikeidet"). Old pin: mid-valley terrain, nearest real road 1.2 km. [map](https://www.openstreetmap.org/?mlat=69.6566&mlon=19.5716#map=16/69.6566/19.5716) | 500 |
| oldervik | **FIXED** | 69.7617, 19.5306 → **69.7568, 19.6758** | Oldervik hamlet centre on Oldervikvegen (5 m), "Oldervik" bus stop 190 m. Old pin: 5.6 km west on a roadless hillside ("Grønnheia"). [map](https://www.openstreetmap.org/?mlat=69.7568&mlon=19.6758#map=16/69.7568/19.6758) | 500 |
| lyngseidet | OK | — | Lyngseidet centre, Kjosveien 7 m, fv91. | 500 |
| skibotn | OK | — | Skibotn Camping 81 m, village roads. | 500 |
| signaldalen | **FIXED** | 69.3333, 20.2833 → **69.1848, 19.9912** | Signaldalen hamlet (OSM place + valley of the same name), Fosseveien 152 m, Signaldalsveien fv7928 up-valley. Old pin: trackless mountainside ~17 km NE of the valley (nearest named feature 2 km). [map](https://www.openstreetmap.org/?mlat=69.1848&mlon=19.9912#map=15/69.1848/19.9912) | 500 |
| kilpisjarvi | OK | — | Parking on Käsivarrentie (E8), Kilpisjärvi village. | 500 |
| nordjeteen | **FIXED** | 69.6503, 18.9699 → **69.6507, 18.9683** | Snapped 75 m onto the breakwater OSM names "Nordsjeteen" (relation 19352862), by Brygge 3/4 piers. Old pin: harbor basin just off the jetty. [map](https://www.openstreetmap.org/?mlat=69.6507&mlon=18.9683#map=17/69.6507/18.9683) | 500 |
| skihytta | OK | — | 25 m from Skihytta café, Dramsvegen. | 500 |
| nordspissen | OK | — | Ringvegen + service roads named "Nordspissen". | 500 |
| kattfjordeidet | OK | — | On fv862 named "Kattfjordeidet", 19 m. | 500 |
| vasstrand | OK | — | 7 m from "Vasstrand" bus stop on Vasstrandvegen. | 500 |
| rekvikvegen | OK | — | 19 m from Brosmortinden trailhead, Rekvikvegen adjacent. | 500 |
| grotfjord_litlevatnet | OK | — | 6 m from parking on Bårdsvikvegen at Litlevatnet. | 450 |
| tonsvika | OK | — | 38 m from toilets/parking, Tønsvikdalen service road. | 500 |
| finnvikdalen_sorskaret | OK | — | 96 m from parking named "Sørskaret". | 500 |

## Geofence geometry (corrected coordinates)

### Pairs closer than 1200 m

| pair | distance |
|---|---|
| fjellheisen_storsteinen ↔ floya | **308 m** |
| grotfjord ↔ grotfjord_litlevatnet | 943 m |
| sommaroy ↔ sandvika_beach | 1088 m |

All other pairs are ≥ 1302 m apart (next closest: prestvannet ↔
vardentoppen 1302 m; nordjeteen ↔ fjellheisen_storsteinen 1324 m).

### Radius recommendations

Rule applied: default 500 m; where two 500 m circles would overlap, shrink
to ⌊(nearest-neighbour distance / 2) / 50⌋ × 50 m, minimum 150 m.

- **25 spots → 500 m** (nearest neighbour ≥ 1088 m; sommaroy ↔
  sandvika_beach at 1088 m leaves a 88 m gap between 500 m circles — no
  overlap, no shrink needed).
- **grotfjord, grotfjord_litlevatnet → 450 m** each (943 m apart).
- **fjellheisen_storsteinen, floya → 150 m** each (308 m apart). **Tight:**
  half-distance is 154 m, right at the 150 m floor. These two pins are the
  Fjellheisen parking and the Sherpa-stairs trailhead — effectively the
  same arrival area. With 150 m radii the deterministic nearest-spot rule
  still separates them, but the owner may prefer to treat them as one
  presence area (or accept that classification between them is fuzzy).

Judgment notes (beyond the deterministic rule, for the owner):

- **nordjeteen (500 m)** — a 500 m circle centred on the jetty covers much
  of downtown Tromsø and the harbour; ordinary pedestrians would register
  as "present at Nordjeteen". Consider ~200–250 m here even though no
  overlap forces it.
- **prestvannet (500 m)** — the circle includes surrounding residential
  blocks; acceptable for aggregate counts, just expect background noise.

### distanceKm sanity check (notes only — no edits)

`distanceKm` is clearly **road/driving distance**, not straight-line: every
spot flagged by a naive haversine comparison (>40 % and >3 km off) is a far
spot where road distance legitimately exceeds straight-line — e.g.
kilpisjarvi 160 km by road vs 99 km haversine, skibotn 90 vs 58, lyngseidet
75 (ferry route) vs 50, ersfjordbotn 25 vs 14. No value looks wrong under
the road-distance interpretation, with one caveat:

- **grunnfjord: 45** matches neither the straight-line (32 km) nor the road
  distance (~70 km) to the proposed Ringvassøya Grunnfjorden — one more
  reason that spot is NEEDS-OWNER.

## NEEDS-OWNER summary

1. **grunnfjord** — pin is in the open sea; the only real "Grunnfjorden"
   in range is on north Ringvassøya (Karlsøy), proposed 69.9925, 19.5607,
   but that is a ~26 km move and `distanceKm: 45` doesn't match its road
   distance. Confirm the intended place (or drop the spot).
2. **vardentoppen** — pin is on a private residence in Workinnmarka;
   proposed viewpoint 490 m south at 69.6606, 18.9358 on the lit-trail
   ridge, but OSM has no feature named "Vardentoppen" to confirm.

## Reproducing

Audit scripts and cached API responses live in `tmp-geo-cache/` in the
worktree (not committed): `audit.mjs` (reverse + roads), `forward.mjs`
(forward search + wide road check), `snap.mjs` (snap targets),
`verify-and-geometry.mjs` (land check of fixes + pairwise geometry).
Reruns hit the cache, not the APIs.
