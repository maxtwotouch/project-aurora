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
  Trip-mode presence pipeline stays exactly as specified in
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
  trip_mode_toggled (the toggle state only — never presence events).
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

- `docs/design-trip-tracking.md` is unchanged and its gates still apply to
  presence data. The two pipelines are separate by construction and must
  stay that way; any future proposal to join them is a new owner decision
  with its own policy rewrite.
- The differential-privacy plan for published aggregates (gate 6.6) is
  unaffected — it governs what leaves the organisation, which remains
  aggregate-only.
- Validation/scoring/nowcast data: not personal, not affected.
