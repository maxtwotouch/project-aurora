# Design: "Tonight looks good" aurora push alerts

Status: **draft, awaiting owner sign-off**. No code in this PR — see
`docs/roadmap-2026-27.md` Phase 2 ("Aurora alerts... the flagship Phase-2
build") and the privacy guardrails in `CLAUDE.md`. This exists so the
provider choice and privacy architecture are decided before anyone writes
`backend/src/alerts.ts`.

Grounding: `backend/src/scoring.ts`, `snapshot.ts`, `store.ts`, `server.ts`,
`sources.ts`, `src/analytics/*`, `docs/privacy-usage-events.md`.

---

## 1. Product behavior

- **Opt-in only, default off.** No push permission requested and no
  subscription happens until the user explicitly turns this on — same
  philosophy as `src/analytics/consent.ts` ("unset" behaves like declined).
- **Settings row, not a first-open modal.** Unlike analytics consent (data
  collection *about* the user, gets a modal), an alert subscription is
  "please tell me things." Propose a row styled like
  `src/components/UsageConsentToggle.tsx` on the All Spots screen: a toggle
  plus a threshold picker that appears once it's on. iOS's own permission
  prompt is the second, OS-level gate on top of this (owner: confirm this
  is acceptable — see §5).
- **Threshold sensibility, two tiers.** Scores are 0–100
  (`backend/src/scoring.ts`); `chanceFromScore` in `snapshot.ts` already
  draws lines at 70 (High) and 45 (Medium). A July night in Tromsø
  (near-constant cloud/twilight) scores ~19; a clear, geomagnetically active
  winter night scores in the 70s–90s. Proposal: reuse the existing
  boundaries so alert language matches what the app already shows:
  - **"Only great nights"** → score ≥ 70 (= "High chance").
  - **"Any decent chance"** → score ≥ 45 (= "Medium chance"; the task
    brief's example of ≥40 also works, but 45 avoids a second, unexplained
    number in the product).
  - Default on first opt-in: "Only great nights" (≥70) — a higher bar
    minimizes false-alarm fatigue for a brand-new feature.
- **Quiet hours: 01:00–16:00 Tromsø local, no pushes, by default.** Aurora
  viewing is an evening decision; an overnight or lunchtime push is either
  too late to act on or just noise. 16:00 still supports "plan tonight."
- **Max 1 push per night.** "Night" = the same 18:00→06:00 window
  `sources.ts` already uses for `tonightPeak` (`parseTonightPeak`'s
  `tonightStartDay`/`tonightEndDay`), not a naive calendar day, so a
  midnight rollover doesn't reset the cap.
- **Localized text** via the existing 5-language catalogs
  (`src/i18n/locales/{en,de,fr,es,zh}.json`), new `alerts.*` keys, following
  the tone/format of `consent.*` / `dataQuality.*`.

## 2. Privacy architecture (the core decision)

Read against the `CLAUDE.md` guardrail: *"No PII, ever. Do not store or log
... device IDs, or anything that identifies a person."* A push token is,
plausibly, a device ID under that wording — this section stays honest about
that tension rather than defining it away.

### Option A — Expo Push Service (per-device token stored server-side)

`expo-notifications` gives each device an Expo push token; sending to a
specific device requires our backend to hold that token.

- **Is it PII?** Not a person's identity, but a stable per-device handle —
  functionally the same category as the "device IDs" the guardrail names.
  Storing it is a guardrail *exception*, not routine privacy-sensitive code.
- **Mitigations if chosen:** store tokens keyed by a random client-generated
  UUID with nothing else attached (no spot views, no language, no IP, no
  timestamp beyond "registered at" / "last successful send"); a store
  **separate** from `usageStore.ts`/`usage-stats.json`; deletable
  immediately on opt-out; documented retention (prune on any
  `DeviceNotRegistered` response, and anything with no successful send in
  90 days — owner to confirm); a new `docs/privacy-push-alerts.md`
  mirroring `docs/privacy-usage-events.md`.
- **Upside:** stays inside the current Expo-managed workflow — no Firebase
  project, no native config, lowest engineering cost, direct server→device
  send.

### Option B — Topic-based push (FCM topics) — **recommended**

Devices subscribe client-side to a topic encoding only the chosen threshold
(`alerts-ge70`, `alerts-ge45`). The backend publishes to the topic on a
crossing; it never sees, requests, or stores an individual device token.
Google's FCM servers hold the device↔topic mapping, not ours.

- **Privacy:** the only option where "no person-identifying data in our
  storage" is structurally true, not policy discipline alone — no table to
  audit, no retention job to get wrong, nothing to leak in a breach.
  Consistent with how far `events.ts`/`usageStore.ts` already go to avoid
  any identifier for the existing analytics feature. Caveat: the token
  still exists — at Google. Both A and B ultimately hand it to Apple/Google
  for delivery; the difference is solely whether *we* keep a copy too.
- **Localization without exploding topic count:** don't make a topic per
  language. Publish a small **data-only** message (`{ threshold, score,
  spotId, bestWindowStart }`) and let the client render localized text from
  the existing i18n catalogs at receive time. Keeps it to 2 topics total,
  not 2×5.
- **Cost:** requires routing through Firebase, not Expo's push service
  directly — a Firebase project, `google-services.json`/
  `GoogleService-Info.plist`, and an EAS config plugin or bare-workflow
  piece for native FCM registration (the backend publish side, via the
  Firebase Admin SDK with an env-var service account like `ADMIN_TOKEN`, is
  small by comparison). Real, non-trivial setup cost next to Option A's
  "add a column."
- **Abuse resistance:** publishing requires the Firebase Admin service
  account, backend-only — a client can never spoof a push to another
  device, unlike a token-registration endpoint that must defend itself the
  way `events.ts` defends `/v1/events`.

### Option C — No-push fallback (client-scheduled local notifications)

Schedule a local notification client-side from the last fetched snapshot.
Zero server storage, works offline once scheduled.

- **Honest limitation:** cannot deliver the flagship promise — a
  same-evening trigger when conditions *newly* look good — without recent
  app opens or reliable background execution. `expo-background-fetch` on
  iOS is opportunistic (OS decides if/when it runs, based on usage and
  battery; hours-long gaps or zero runs in a day are normal); Android's
  Doze/App Standby is similarly unpredictable. As the *primary* mechanism
  this would silently under-deliver.
- **Where it helps:** as a backstop only — if the app is open in the
  evening and a good window is already forecast, schedule a local reminder
  regardless of push. Complementary to A/B, not a substitute.

### Recommendation

**Option B**, with C's local-notification backstop kept as a small addition
regardless of provider.

- *No person-identifying data in our storage:* only B is structurally true
  here, not just disciplined.
- *Same-evening delivery:* B is just as direct as A (topic publish vs.
  per-token send); only C has a real timing gap.
- *Implementation cost:* B's honest weak point (see steelman at the end) —
  it leaves pure-Expo-managed simplicity. Given alerts are the roadmap's
  named "flagship Phase-2 build," the one-time setup is judged worth it
  rather than taking on a standing guardrail exception for the feature's
  lifetime.

**New CODEOWNERS entries required if this ships:**
```
/backend/src/alerts*          @maxtwotouch   # trigger + publish logic
/backend/src/**/alerts*       @maxtwotouch
/src/notifications/           @maxtwotouch   # client subscribe/opt-in state
/docs/privacy-push-alerts.md  @maxtwotouch
```
**New privacy-doc sections required:** `docs/privacy-push-alerts.md`
mirroring `docs/privacy-usage-events.md` either way — even for B, document
what's sent, what topics exist, what the Firebase service account can/can't
do, and that zero per-device records exist on our side.

## 3. Backend trigger design

Hooks into the existing refresh cycle, no new cron/poller:

- `refreshSnapshot()` in `server.ts` rebuilds the `TonightSnapshot` every
  `REFRESH_MS` (default 5 min) via `buildTonightSnapshot()`. After
  `setLatestSnapshot(snapshot)` succeeds, run a new
  `checkAlertTriggers(snapshot)` step — pure-function-testable like
  `scoring.ts` (only the publish call at the edge is impure).
- **Threshold-crossing with hysteresis.** Track, per tier, the last
  armed/fired state across ticks (mirrored to disk the way `store.ts`
  mirrors the snapshot, so a restart mid-evening doesn't re-fire). A tier
  fires only when the score crosses upward through the threshold from a
  state last seen **below `threshold − 10`** — stops a score oscillating
  68→71→69→72 from firing repeatedly as clouds fluctuate tick to tick.
- **Quiet hours.** A crossing between 01:00–16:00 (reuse
  `getOsloParts`/`getOsloOffset` from `sources.ts`, don't reimplement
  timezone math) is not published, but remembered as "armed" — if still
  above threshold at 16:00, it fires then instead of being lost for the
  night.
- **Max 1/night cap**, keyed to the same 18:00→06:00 window from §1,
  tracked alongside armed/fired state — once fired tonight, that tier can't
  fire again until the next aurora night, even on a re-cross.
- **Staleness guard.** Never fire from fallback data: check
  `dataQuality.usingFallbackKp` and whether the best spot's id is in
  `dataQuality.fallbackWeatherSpotIds`; if either is true, skip the check
  for this tick. Mirrors `scoring.ts`'s cloud gate — prefer honest silence
  to a confident push built on estimated data.

## 4. Failure / abuse modes

- **Token churn** (Option A only). Tokens die on reinstall, permission
  revocation, device replacement. Expo's send API reports
  `DeviceNotRegistered`; prune immediately — a dead token retained serves
  no purpose. Not applicable to B: no tokens held.
- **Notification fatigue — the #1 product risk.** One bad night of spammy
  pushes burns the feature's goodwill. Mitigations only work as a set:
  opt-in + default-off, quiet hours, the 1/night cap, and hysteresis
  (stops threshold-edge oscillation reading as "the app keeps buzzing me").
  A climbing opt-out rate post-launch is the signal to revisit
  thresholds/cap before adding more tiers.
- **Abuse.** B's publish path requires the backend-only Firebase Admin
  service account — a client cannot forge a push to other subscribers. A
  would need the same defenses `events.ts` has for `/v1/events` (bounded
  batch size, dedupe-by-token) if ever built.
- **Upstream in fallback.** Handled by the staleness guard in §3 — correct
  behavior during a real outage on a genuinely great night is to say
  nothing, not guess.

## 5. Decisions for the owner

1. **Provider choice.** Recommend Option B. Confirm, or accept Option A's
   lower cost in exchange for an explicit, documented guardrail exception
   (a device-linked token store) — a bigger call than a routine
   privacy-sensitive PR, made explicitly rather than by default.
2. **Threshold defaults.** Confirm ≥70/≥45 (aligned to `chanceFromScore`)
   versus the brief's illustrative ≥70/≥40, and "Only great nights" as the
   first-time default.
3. **Consent styling.** Confirm a settings-row toggle (no dedicated modal)
   is acceptable, given the OS push-permission prompt is the second gate.
4. **GDPR note if Option A instead:** hosting region for the token table,
   retention window (proposed 90 days), whether `docs/privacy-push-alerts.md`
   needs review before any token is stored.
5. **Quiet hours / cap finality.** Confirm 01:00–16:00 and 1/night as
   shipped defaults, or flag a later user-configurable override.
6. **CODEOWNERS additions** in §2 — confirm before the first alerts PR
   opens.

## 6. Rough implementation plan

- **PR 1 (this doc).** No code.
- **PR 2 — Alerts settings UI, client-only.** Toggle + threshold picker,
  local state only, no push registration, no server calls. Not
  privacy-sensitive.
- **PR 3 — Trigger logic, unwired.** Pure functions for crossing +
  hysteresis + cap + staleness guard in a new `backend/src/alerts.ts`,
  unit-tested like `scoring.ts`; logs "would publish" instead of sending.
  Not privacy-sensitive yet, but add the `alerts*` CODEOWNERS entry
  proactively.
- **PR 4 — Wire the chosen provider. OWNER REVIEW REQUIRED.** Option B:
  Firebase project + config plugin, client topic subscribe, backend publish
  call. Option A instead: token endpoint, isolated store, prune-on-failure,
  `docs/privacy-push-alerts.md`. Whichever provider, this is the PR that
  actually moves device-linked data — the hard human-review gate.
- **PR 5 — Localized notification copy.** New `alerts.*` keys across all 5
  locales, plus the client-side render path from the data-only payload.
- **PR 6 — Fatigue observability. OWNER REVIEW REQUIRED.** Optional
  aggregate-only counters (`alert_sent`/`alert_opened`) following the exact
  `spot_view` pattern — hour-bucketed counts only, no per-device breakdown.
- **PR 7 — Docs.** Update `docs/prelaunch-checklist.md` and the roadmap
  decision log once shipped.
