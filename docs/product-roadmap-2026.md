# Product Roadmap — Rest of 2026

Aurora season opens ~Aug 14. Strategic goal: real user traction by April 2027
(see `docs/roadmap-2026-27.md` for the full-season strategy this compresses).

Owner-gated items are marked `(owner)` — they block whatever follows them.

```mermaid
gantt
    title Project Aurora — Aug–Dec 2026
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Ops & Launch
    Deploy backend to Fly.io (owner token)      :crit, ops1, 2026-08-03, 7d
    Firebase + APNs setup (owner)               :crit, ops2, 2026-08-03, 10d
    Privacy policy placeholders + app name (owner) :ops3, 2026-08-03, 7d
    Season opens                                :milestone, m1, 2026-08-14, 0d
    Real-sky screenshots + store listing final  :ops4, 2026-08-17, 12d
    App Store submission                        :crit, ops5, 2026-08-31, 10d
    Public launch                               :milestone, m2, 2026-09-14, 0d
    Android go/no-go (owner)                    :milestone, m3, 2026-10-01, 0d
    Google Play launch (if go)                  :ops6, 2026-10-01, 21d
    Peak-season stability & perf hardening      :ops7, 2026-11-23, 28d

    section Product
    Offline hardening (no-signal viewpoints)    :active, p1, 2026-08-03, 10d
    Alerts live on TestFlight (after Firebase)  :p2, after ops2, 7d
    Spot reviews R1 — scope call (owner) + build :p3, 2026-10-05, 21d
    Nowcast v2 — TGO magnetometer (if access granted) :p4, 2026-11-02, 21d
    Trip mode — design doc + owner decision     :p5, 2026-11-02, 14d
    %% 2026-09-04: shipped early as a product feature; tourism measurement consented at first launch — see decision doc

    section Data & Science
    Validation loop recording (needs deploy)    :crit, d1, 2026-08-14, 110d
    TGO data-access request to UiT (owner email) :d2, 2026-08-10, 5d
    First calibration pass (~6 weeks of nights) :d3, 2026-10-01, 10d
    Alert & nowcast threshold tuning            :d4, after d3, 14d
    Year-end calibration report + 2027 plan     :d5, 2026-12-14, 10d

    section Growth
    Share channel live (shipped)                :done, g1, 2026-08-01, 3d
    Marketing channels — QR posters, hostels, tours :g2, 2026-09-14, 30d
    Tour-operator referral pilot                :g3, 2026-10-12, 30d
    Municipality B2B stats (aggregates only)    :g4, 2026-11-09, 21d
    Holiday tourist peak push                   :g5, 2026-12-07, 24d
```

## Reading the critical path

1. **Aug (now):** everything hinges on the two owner ops items — the Fly.io
   token (backend deploy) and Firebase/APNs. The validation loop only starts
   learning once the backend runs, and the season opens Aug 14; every day
   undeployed after that is lost calibration data. Offline hardening is the
   last pre-launch product item and needs no owner input.
2. **Sep:** App Store submission as soon as real-sky screenshots exist
   (sample-data banner shown honestly, never cropped). Public launch mid-Sept
   into the rising season; marketing channels activate the same week so the
   `?src=` tracking has somewhere to point.
3. **Oct:** first calibration pass turns six weeks of recorded predictions
   into threshold tuning for the score, alerts, and nowcast. Android decision
   gates a Play launch. Reviews R1 starts only after the owner's scope call
   on the design doc's open decisions.
4. **Nov:** deeper science (TGO if UiT grants access), Trip-mode decision
   (privacy-gated — design doc first, owner sign-off, no code before that),
   and the municipality B2B aggregate stats — the first monetization lever.
   *2026-09-04: shipped early as a product feature; tourism measurement
   consented at first launch — see decision doc
   (`docs/decision-tourism-baseline.md`).*
5. **Dec:** peak tourist season — stability over features, holiday marketing
   push, and the year-end calibration report that sets up the April 2027
   traction checkpoint.

## Not on this roadmap (deliberately)

- Expansion beyond Tromsø aurora (owner decision: stay focused).
- The eats sibling app (concept doc exists; separate effort).
- Any location tracking beyond the aggregate, consented events we ship today —
  Trip mode enters only as a *design doc* in November, not as code.
  *2026-09-04: shipped early as a product feature; tourism measurement
  consented at first launch — see decision doc.*
