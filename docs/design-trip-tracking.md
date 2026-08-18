# Design: Trip mode — aggregated spot presence

Status: **awaiting owner sign-off** (section 8). No implementation before
the consent + policy changes in section 6 are merged by the owner.

## 1. What the owner wants to know (from the congestion/ETL discussions)

- Which viewpoints actually fill up, and when (congestion forming).
- Where people really go vs what we recommend (distribution effects).
- Which spots "work" (people arrive and stay vs turn around quickly).
- Aggregates a municipality/B2B partner could use — never row-level.

## 2. What we may NOT build (hard constraints)

These come from CLAUDE.md's privacy guardrails, our shipped consent screen,
`docs/privacy-policy.md`, and the App Store privacy answers — all of which
currently promise no precise location collection:

- ❌ No precise user coordinates ever sent to, stored by, or logged by the
  backend. Not "hashed", not "briefly", not "for debugging".
- ❌ No trajectories/routes — no ordered sequence of places per device.
- ❌ No device identity: no IDs, no pseudonymous keys that would let two
  events be linked to the same person.
- ❌ No background tracking in v1 (also an App Store review minefield).
- ❌ Nothing collected without a separate, explicit, default-off opt-in.

## 3. The design: coarsen on device, count on server

**Trip mode** is an opt-in the user turns on when heading out for the
night, with a real user benefit (Apple requires location features to serve
the user, not just analytics):

- The map shows their position (ships separately — that part never leaves
  the device at all).
- The app can show "you've arrived at <spot>" context: tonight's score for
  *this* spot, best viewing direction, remaining best-window time.

While Trip mode is on (foreground/when-in-use only):

1. The device compares its own position against the 28 spot coordinates
   (`src/data/spots.json`) locally. **Coarsening happens on the phone** —
   the only fact that can ever leave it is "within ~500 m of spot X" (radius
   an owner decision, section 8).
2. On entering a spot radius, the client emits ONE event through the
   existing consent-gated analytics pipeline: `spot_presence`, payload
   `{spotId, utcHour}` — exactly the shape of today's `spot_view` events.
   Leaving after >20 min emits `spot_presence_long` (the "stayed vs turned
   around" signal), same payload shape. Nothing else. No coordinates, no
   timestamps finer than the hour, no exit hour, no sequence linking.
3. The backend counts them in the existing aggregate counter store
   (`type|spotId|utcHour`), inheriting retention (`USAGE_RETENTION_DAYS`)
   and small-cell suppression (`STATS_MIN_CELL`) unchanged. No new storage
   class, no new endpoint shape — `/v1/stats` gains two event types.

Why this still answers section 1: congestion = `spot_presence` counts per
spot-hour; distribution vs recommendation = presence counts joined (server-
side, aggregate-to-aggregate) against which spot was ranked #1 that night;
success = ratio of `spot_presence_long` to `spot_presence` per spot.

## 4. What this can't answer (accepted costs)

- No routes or origin/destination flows (would need trajectories — banned).
- No sub-hour timing, no per-device repeat-visit analysis (needs identity —
  banned).
- Undercounting: only consenting users with Trip mode on, in foreground.
  This is a floor sample, not a census — fine for relative comparisons
  between spots, which is what every section-1 question needs.

## 5. GDPR position (summary, not legal advice)

Lawful basis: consent (Art. 6(1)(a)) via the separate opt-in; the data is
engineered toward anonymity at the point of collection (spot-level, no
identifiers, aggregate storage) — we still treat the *event in transit* as
personal data and document it in the policy. Consent withdrawal = toggle
off (collection stops; already-aggregated counts contain no identity to
delete, which the policy states plainly). Storage limitation via existing
retention. Data-protection-by-design is literally the architecture above.

## 6. Ship gates — owner-merged PRs required BEFORE any collection code

1. `docs/privacy-policy.md`: new section describing Trip mode, exactly what
   leaves the device (`spotId` + hour), what never does (coordinates), the
   separate opt-in, and withdrawal.
2. Consent UI (`src/components/Consent*`, `UsageConsentToggle` — protected
   paths): a distinct Trip-mode toggle, default off, honest copy in 5
   languages. NOT bundled into the existing usage-stats consent.
3. App Store privacy answers (`docs/store-listing/app-privacy-answers.md`):
   add Location → "Coarse Location, linked to nothing, used for analytics"
   — and verify the wording matches what Apple's form actually offers.
4. Backend event allowlist (`backend/src/events.ts` — protected): accept
   the two new types. Owner-merged like every events change.

## 7. Rollout

1. Owner signs off on this doc (or edits it).
2. Gates 6.1–6.3 ship in one owner-reviewed PR set.
3. Client geofencing + Trip mode UI (protected consent paths → owner-merged).
4. Backend allowlist + stats (protected → owner-merged).
5. Shadow period: collect for 2–3 weeks, review the aggregates together,
   THEN decide on any B2B/municipality sharing (separate doc, separate
   suppression review — complementary-suppression concern from the stats
   work applies double here).

## 7b. What the city gets (the actual deliverable)

Tromsø kommune's need — "where do people go to watch the northern lights"
— is answered by **spot-level aggregates, and spot-level aggregates are
also the only thing a public body can comfortably accept**: raw or
row-level tourist location data would put a GDPR problem on *their* desk
(legal basis, DPIA, retention), which no municipal planner wants. The
standard, safe, immediately-usable deliverable is:

- Per spot × per night × per hour: presence counts and "stayed >20 min"
  counts, small cells suppressed.
- Season summaries: spot ranking by visits, peak hours, weather/score
  context joined from our own snapshots (aggregate-to-aggregate).
- Delivered as a periodic CSV/JSON export or a token-gated stats endpoint
  (the existing `/v1/stats` machinery extended) — that endpoint IS the ETL
  pipeline's outlet: Extract = consented coarse events, Transform =
  on-device coarsening + server aggregation with suppression, Load = the
  counter store the export reads. The "T" happening on the phone is the
  privacy feature, not a limitation.

## 8. Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | Approve the spot-level presence model at all | — |
| 2 | Geofence radius | 500 m (roads/parking near spots; smaller risks missing parked users, larger blurs neighboring spots) |
| 3 | Dwell threshold for `spot_presence_long` | 20 min |
| 4 | Foreground-only confirmed for v1 | yes — background location is a separate Apple review battle, revisit only with real demand |
| 5 | Trip-mode benefit copy (what the user gets) | "arrived at spot" context card |
| 6 | Municipality sharing | defer to step 7.5, separate doc |
