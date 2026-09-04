# Decision: person-level product analytics (the analytics pivot)

Status: drafted for owner review — **merging the accompanying CLAUDE.md
amendment is the sign-off.** Owner decision 2026-08-19: the aggregate-only
stance was judged too limiting ("too utopic"); with explicit consent and a
truthful policy, the app moves to person-level product analytics.

## 1. What changes and what doesn't

**Changes:**
- The app gains a second analytics pipeline: person-level events with a
  pseudonymous per-install identifier, processed by **PostHog (EU cloud)**
  as a GDPR processor under a signed DPA. This enables retention, funnels,
  and feature-usage analysis that the aggregate pipeline structurally
  cannot provide.
- The privacy policy, consent UI, and App Store privacy answers are
  rewritten to say so plainly (PR 2). App Store label moves to
  "Identifiers + Product Interaction / Analytics, linked to user."

**Does not change:**
- **Precise location never reaches any server** — ours or PostHog's. The
  tourism presence pipeline stays exactly as specified in
  `docs/design-trip-tracking.md`: identity-free, spot-level, aggregate,
  in OUR backend only. Presence events are never sent to PostHog and never
  joined with the PostHog identifier. (This preserves the municipality
  deliverable — a public body can only accept identity-free aggregates —
  and the Apple location justification.)
- **Third-party/B2B data sharing stays aggregate-only** (suppressed,
  fixed-dimension exports). Person-level data is never sold or shared.
- The existing aggregate counter pipeline keeps running (it feeds the
  municipality export and costs nothing).

## 2. Consent model (the hard rules)

1. **Explicit, informed, default-off.** The consent modal describes
   person-level collection in plain words. No pre-ticked boxes, no
   dark patterns, decline is one tap and fully honored (SDK never
   initializes).
2. **Re-consent for everyone.** Existing users consented to "aggregate
   counts, not linked to you." That consent DOES NOT cover the new scope.
   On first launch after the pivot ships, all users see the new consent
   — previous acceptors are reset to unset for the person-level dimension;
   previous decliners stay declined.

   *Clarification (recorded during PR 2 implementation, owner confirms by
   merging):* "previous decliners stay declined" refers to the OLD
   usage-counter dimension — their existing decline is preserved
   untouched. The NEW person-level question is asked of everyone,
   including previous decliners, because the scopes are independent and
   unbundled; declining aggregate counters is not treated as an implicit
   answer to a question that was never asked. Consent is never inferred,
   in either direction.
3. **Withdrawal:** toggle off in Settings stops collection immediately and
   triggers deletion of the person's PostHog data (their deletion API) —
   stated in the policy with the honest latency caveat.
4. **Data subject rights:** access/deletion served via PostHog's person
   APIs; documented contact path in the policy.

## 3. Implementation constraints (PR 3)

- PostHog **EU cloud** (Frankfurt), DPA signed by the owner in the PostHog
  dashboard before the SDK PR merges (owner action, like all credentials).
- **Consent-gated hard:** the SDK is not initialized — not even loaded —
  until person-level consent is 'accepted'. Decline/unset = zero network
  bytes to PostHog.
- **Explicit events only.** No autocapture, no session replay at launch
  (either would need its own policy language and a fresh decision).
- Event allowlist starts small: app_open, screen_view (screen name only),
  spot_view, navigate_pressed, spot_shared, alerts_opt_in, language_set,
  trip_mode_toggled (Trip Mode session start/end — state only).

  **Amendment (owner decision, 2026-08-22 — supersedes the earlier
  "decision A" person-level journey-events draft, which was never
  ratified):** tourism/location analytics are **unlinked**, not
  person-level. The product analytics allowlist above stays exactly as-is
  (8 events, person-level). Location-derived analytics instead flow as
  follows:

  1. **Spot visits (unlinked):** on-device geofencing emits one
     visit-summary event per visit — `spot_visit {spot_id, time_bucket,
     dwell_bucket}` (dwell buckets <5m / 5–15m / 15–30m / 30–60m / 60m+)
     — into the identity-free backend pipeline (`/v1/events` aggregate
     counters). NOT sent to PostHog; no person id, no device id, no
     coordinates. Gated on the tourism-insights consent (2026-09-04;
     previously the Trip-mode consent).
  2. **Recommendation effectiveness (unlinked, attributed on-device):**
     the device stores the last-shown recommendation locally, compares on
     arrival, and emits only the outcome — `recommended_spot_visit
     {spot_id, recommendation_id, time_bucket}` — same identity-free
     pipeline. No journey reconstruction server-side.
  3. **Spot discovery (unlinked, coarse zones):** to find NEW aurora
     hotspots outside the 28 curated spots: when a tourism-consenting
     device dwells ≥15 min in one H3 **resolution-7** cell (~5 km² hexes —
     deliberately too coarse to identify a cabin or address) that is
     outside every known spot geofence AND outside the excluded urban
     zone, during dark hours, it emits `zone_dwell {h3_cell, time_bucket,
     dwell_bucket}` — identity-free pipeline. **At most one zone_dwell per
     cell per night per device, enforced on-device** — this bounds any
     single device's contribution, makes event counts approximate device
     counts for suppression purposes, and caps data volume. The resulting
     suppressed heatmap generates candidate AREAS for human scouting —
     new spots are still curated by the owner, never auto-created.
  4. Person-linkage for location events requires a compelling analytical
     need none of the above has; if one appears (e.g. origin–destination
     matrices), the first resort is unlinked transition-pair events, not
     identifiers.

  Rationale for unlinked: every stated tourism-intelligence goal (volume,
  dwell, congestion, distribution, recommendation effectiveness,
  discovery) is answerable without linkage; unlinked events are cheaper,
  simpler in every disclosure conversation, and keep the municipality
  product's "no identities anywhere in this pipeline" property intact.
  Raw GPS remains explicitly not collected; road-level flow questions
  route to public Vegvesen traffic-counter data.

  Consent & policy: all three event types are location-derived and gated
  on the tourism-insights consent (collection purpose unchanged: aggregate
  tourism statistics). `zone_dwell` extends what the policy enumerates, so
  the policy and consent copy must be updated in the implementation PR set
  BEFORE any code emits it. The 2026-08-22 position was that, because zone
  cells are strictly coarser/less sensitive than the already-consented
  spot-level events and the purpose is unchanged, existing Trip-mode
  consents remained valid with no re-consent reset. *Superseded
  2026-09-04 (`docs/decision-tourism-baseline.md`):* the collection window
  widened from "while Trip mode is on" to "whenever the app is in the
  foreground", which is a scope expansion, so the old Trip-mode consent key
  is never read again and everyone is asked the tourism-insights question
  once at next launch.

- No precise coordinates, no IP-based geolocation enrichment (disable
  GeoIP person properties), no third-party IDs (IDFA/GAID never requested
  — this is analytics, not ad tracking; App Tracking Transparency is NOT
  triggered because there is no cross-app tracking).
- Retention: configure PostHog data retention to a documented period
  (owner decision, default proposal: 24 months).

## 4. Sequencing (honesty-first, as with Trip mode)

1. **PR 1 (this doc + CLAUDE.md amendment)** — owner merge = decision
   ratified.
2. **PR 2** — privacy policy rewrite, consent modal + Settings copy in all
   5 languages with the re-consent flow, App Store privacy answers.
   Owner-merged (protected paths). Owner signs the PostHog DPA.
3. **PR 3** — SDK integration per section 3. Owner-merged.
4. Store submission note: the new privacy label must be live in App Store
   Connect for the first build that ships the SDK.

## 5. Interplay with existing commitments

- `docs/design-trip-tracking.md` still governs presence data, as amended
  by `docs/decision-tourism-baseline.md` (2026-09-04: tourism-insights
  consent at first launch, foreground-only baseline, Trip Mode as a product
  feature). The two pipelines are separate by construction and must stay
  that way; any future proposal to join them is a new owner decision with
  its own policy rewrite.
- The differential-privacy plan for published aggregates (gate 6.6) is
  unaffected — it governs what leaves the organisation, which remains
  aggregate-only.
- Validation/scoring/nowcast data: not personal, not affected.
