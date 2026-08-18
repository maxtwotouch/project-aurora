# Design: Trip mode — aggregated spot presence

Status: **Decision #1 approved by owner with amendments (2026-08-18)** —
this revision incorporates them and is the working privacy specification.
Implementation order is fixed by the ship gates in section 6.

## 1. What we need to know (product + municipality)

- Which viewpoints fill up, and when (congestion forming).
- Where people really go vs what we recommend (distribution effects).
- Which spots "work" (arrive-and-stay vs turn around).
- Statistics Tromsø kommune can use — never row-level data.

Terminology rule (owner amendment): results are **"observed presence among
consenting Trip Mode users"**, never "visitor counts". The sample is
app-users × analytics-consenting × Trip-mode-on × app-foregrounded, and
that selection bias can vary by spot (famous spots vs remote ones attract
different usage). Trends and distributions are analysable; absolute counts
are not representative until validated. Reports to the municipality say
"Grøtfjord represented 27% of observed Trip Mode presence events", not
"Grøtfjord had 600 visitors".

## 2. What we may NOT build (hard constraints)

From CLAUDE.md's guardrails, the shipped consent screen,
`docs/privacy-policy.md`, the App Store privacy answers — and the owner's
review:

- ❌ No precise user coordinates ever sent to, stored by, or logged by the
  backend. Not "hashed", not "briefly", not "for debugging".
- ❌ No trajectories/routes — no ordered sequence of places per device.
- ❌ No device identity: no IDs, no pseudonymous keys linking two events.
- ❌ **No linkable ingestion (owner amendment, engineering-enforced):** the
  ingestion path must not persist IP addresses, request identifiers,
  auth/user IDs, session IDs, device metadata, or anything else capable of
  linking presence events into a sequence. "We don't send a deviceId" is
  not sufficient — an access log retaining `IP 1.2.3.4 → spot A 21:03,
  spot B 22:08, spot C 23:14` reconstructs a trajectory. This applies to
  every hop: CDN/edge → load balancer → reverse proxy → application →
  crash/error/analytics tooling. (App-level Fastify serializers already
  strip req to `{method,url}` with no IP; the Fly.io edge/proxy logging
  layer is the open item — see ship gate 6.5.)
- ❌ No PASSIVE background tracking, ever — the phone is never sampled
  while the user is simply living their life with the app closed. (Owner
  data-quality rationale, 2026-08-18: passive collection would pollute the
  dataset with residents living near spots and commuters driving past —
  the opposite of the aurora-hunter signal we want.) Location during an
  ACTIVE trip session continues if the user switches to their maps app
  mid-drive — see section 3's session model; that is the iOS-standard
  navigation pattern (when-in-use permission + the OS's visible location
  indicator), not passive tracking.
- ❌ Nothing collected without a separate, explicit, default-off opt-in.

## 3. The design: coarsen on device, count on server

**Trip mode** is an opt-in the user turns on when heading out, with a real
user-facing benefit (Apple requires location to serve the user, and
recommends requesting authorization when the user engages the feature that
needs it):

- The map shows their position (ships separately; never leaves the device).
- On arrival: an "arrived at <spot>" context card — tonight's score for
  *this* spot, best viewing direction, remaining best-window time.

While Trip mode is on (foreground/when-in-use only):

1. The phone uses **precise location locally** (Core Location / fused
   provider) and compares it against the 28 spot coordinates
   (`src/data/spots.json`) on-device. The server only ever receives the
   derived statement *"this device is currently within the area associated
   with spot X"*. The classification is the privacy boundary.
2. **Spot classification rule (deterministic, owner amendment):**
   - inside exactly one spot radius → that spot;
   - inside several → the nearest spot;
   - nearest > radius → none.
   Initial radius 500 m, **subject to a geographic validation pass of all
   28 spots before implementation** (two spots within ~1 km overlap at
   500 m; a roadside pull-out and a large recreation area don't share
   geometry). Per-spot radii are the expected end state; the validation
   pass decides.
3. **Local presence state machine (owner amendment — dwell measured inside,
   not at exit):**
   - enter radius → emit `spot_presence {spotId, utcHour}`;
   - 20 minutes *continuously inside* → emit `spot_presence_long
     {spotId, utcHour}` (so a long visit is recorded even if Trip mode or
     the app closes before the user leaves);
   - leave radius → forget the local state.
   The client keeps ephemeral state (`enteredSpot`, `enteredAt`,
   `presenceSent`, `longPresenceSent`) solely to prevent duplicate emission
   — it lives on-device only, is never transmitted, and is **reset when
   Trip mode ends** so no local visit history accumulates.
4. The backend counts events in the existing aggregate counter store
   (`type|spotId|utcHour`), inheriting retention (`USAGE_RETENTION_DAYS`)
   and small-cell suppression (`STATS_MIN_CELL`). No new storage class.
   `presence_long / presence` per spot estimates the ≥20-minute-stay share.

## 4. What this can't answer (accepted costs)

- No routes or origin/destination flows (needs trajectories — banned).
- No sub-hour timing, no repeat-visit analysis (needs identity — banned).
- Undercounting and spot-varying selection bias (see section 1's
  terminology rule). This is a floor sample, not a census.

## 5. GDPR position (summary, not legal advice — owner-amended wording)

Lawful basis: consent (Art. 6(1)(a)) via the separate default-off opt-in,
withdrawable at any time (Datatilsynet's stated model for geolocation
services). On anonymity, the conservative position, per the owner's review
and EDPB's pseudonymisation-vs-anonymisation distinction:

> The system is designed to minimise identifiability and prevent
> longitudinal tracking. Individual presence events are treated as
> personal data while being transmitted and processed. Only sufficiently
> aggregated and suppressed statistics are treated as anonymous, and only
> where the applicable anonymisation standard is met.

No identifier ≠ anonymous: a bare `spot_presence | Grøtfjord | 22:00`
event can be identifying in combination with other information (IPs,
request logs, sparse cells). Hence the ingestion constraint in section 2
and ship gates 6.5/6.6. Withdrawal = toggle off (collection stops;
already-aggregated counts contain no identity to delete — the policy says
this plainly). Storage limitation via existing retention. EDPB
anonymisation guidance is being updated in 2026 — gate 6.6 tracks it.

## 6. Ship gates — ALL owner-merged, ALL before any collection code

1. `docs/privacy-policy.md`: Trip mode section — what it is, exactly what
   leaves the device, what never does, the separate opt-in, withdrawal,
   retention/deletion (Apple review guidelines require the policy to cover
   collection, uses, retention/deletion, and consent revocation).
2. Consent UI (protected paths): distinct Trip-mode toggle, default off,
   honest copy, 5 languages. NOT bundled into usage-stats consent, NOT in
   the first-open modal — Settings, at point of relevance.
3. App Store privacy answers: **do not hard-code the final answer in this
   doc** (owner amendment). The app *accesses* precise location for local
   processing; the developer *collects* only the coarse derived event —
   Apple's questionnaire distinguishes these, and the exact form wording
   must be checked against the final implementation in App Store Connect
   before any build containing Trip mode is submitted. Hard ship gate,
   not an assumption.
4. Backend event allowlist (`backend/src/events.ts` — protected): the two
   new types.
5. **Infrastructure privacy audit (owner-added):** prove the full path —
   Fly edge/CDN, load balancer, reverse proxy, application, error
   monitoring — cannot reconstruct event sequences via IPs, auth IDs, or
   request metadata. Document findings; fix or terminate any hop that
   retains linkable data before launch.
6. **Statistical disclosure review (owner-added):** define exactly what
   constitutes an anonymous publishable aggregate; test complementary
   suppression (see 7b) before anything leaves the organisation.

## 7. Rollout

1. ~~Owner signs off~~ — done 2026-08-18, with amendments (this revision).
2. Gates 6.1–6.3 ship in one owner-reviewed PR set (in progress).
3. Geographic validation of the 28 spot radii (pre-implementation check).
4. Client geofencing + Trip mode UI (protected → owner-merged).
5. Backend allowlist + stats (protected → owner-merged).
6. Gates 6.5 and 6.6 executed and documented.
7. Shadow period: 2–3 weeks of collection, review aggregates together,
   THEN decide municipality sharing (separate doc).

## 7b. What the city gets (the actual deliverable)

Spot-level aggregates are both what a municipal planner uses and the only
thing a public body can comfortably accept (row-level tourist data puts a
GDPR problem on *their* desk). **Owner amendment: the internal `/v1/stats`
endpoint is NOT exposed to third parties, even though it exists.**
Arbitrary querying enables complementary-suppression attacks: `all spots =
101` minus `all-except-Grøtfjord = 99` reveals a suppressed `Grøtfjord =
2`. Instead, B2B delivery is a purpose-built export with fixed dimensions
and suppression applied to the dataset as a whole:

```text
spot       date        hour   presence   long_presence
-------------------------------------------------------
Grøtfjord  2027-01-14  21     17         11
Grøtfjord  2027-01-14  22     31         25
Ersfjord   2027-01-14  21     <5         suppressed
```

so its disclosure characteristics can be reasoned about as one artifact
(gate 6.6). Season summaries join our own snapshot context
(aggregate-to-aggregate). All figures labelled per section 1's terminology
rule.

## 8. Decision record (owner, 2026-08-18)

| # | Decision | Outcome |
|---|---|---|
| 1 | Spot-level presence model | **Approved with amendments** (all folded into this revision) |
| 2 | Geofence radius | 500 m initially, pending geographic validation of all 28 spots (7.3); per-spot radii expected eventually |
| 3 | Dwell threshold | 20 min, measured as continuous-inside (not at exit) |
| 4 | Collection scope | REVISED 2026-08-18: app-in-use baseline + active trip sessions (navigation pattern, when-in-use + background location mode during session only). No passive background, ever. Store-answer/App-Review note: UIBackgroundModes location must be declared and justified via the session framing — folds into ship gate 6.3. |
| 5 | Trip-mode user benefit | Arrival context card |
| 6 | Municipality sharing | Deferred to 7.7; fixed-dimension export only, never `/v1/stats`; gates 6.5+6.6 mandatory first |
