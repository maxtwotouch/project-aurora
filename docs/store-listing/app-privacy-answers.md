# App Privacy questionnaire — answers, mapped to the implementation

This maps Apple's App Store Connect "App Privacy" questionnaire (the data that produces the
public "nutrition label") to what this codebase actually does, with file references, so
whoever fills in the App Store Connect UI can do it from source rather than from memory.

**Principle used throughout:** state exactly what the code does, no more and no less.
Overclaiming (declaring collection that doesn't happen) triggers "inaccurate metadata"
rejections just as much as underclaiming (hiding real collection) does — Apple's review
guidelines (2.3.1) and the Developer Program License Agreement both treat the nutrition
label as a binding representation, and Apple has rejected/pulled apps for both directions.
Every "Not Collected" answer below is backed by a negative-evidence check (grep/dependency
check), not just an assumption.

## How to read this doc against App Store Connect's actual flow

App Store Connect's questionnaire asks, per data type: (1) is it collected, (2) is it linked
to the user's identity, (3) is it used for tracking (Apple's ATT definition), (4) what
purpose(s). The table below gives all four for every data type Apple lists.

## Data types collected

### Usage Data (Apple's category; specifically "Product Interaction")

- **Collected: Yes — but only if the user opts in.**
- **What exactly:** Eight event types are allowlisted by `backend/src/events.ts`. Three
  are usage events under this consent — `spot_view`, `navigate_pressed`, `spot_shared`
  (the last is emitted by `src/components/ShareButton.tsx`) — each exactly `{ type,
  spotId }`, no timestamp finer than the server-assigned UTC hour bucket, no session ID,
  nothing else (`parseEvents()` rejects anything with extra/different fields). The other
  five — `spot_presence`, `spot_presence_long`, `spot_visit`, `recommended_spot_visit`,
  `zone_dwell` — are the location-derived tourism-insights events, gated on a separate
  consent and declared under **Location** below, not here.
- **Linked to identity: No.** There is no user identifier anywhere in the schema, request,
  or response. `POST /v1/events` is unauthenticated and stateless; the response is `204 No
  Content` (`backend/src/events.ts`). Nothing is keyed by device, session, or any
  client-generated ID — see "No device/session identifiers, cookies, or any client-generated
  ID. The API accepts no such field and returns none" in `docs/privacy-usage-events.md`.
- **Used to track you (Apple's ATT sense — linking with data from other companies' apps/
  sites, or for third-party ads): No.** There is no SDK capable of that in this app (see
  "Third-party SDKs" below); events go to our own backend only, over `fetch()` to
  `${EXPO_PUBLIC_API_BASE_URL}/v1/events` (`src/analytics/events.ts`), never to a
  third-party endpoint.
- **Purpose:** App Functionality and Analytics — used to see which viewing spots are
  actually useful to visitors, and (per `docs/privacy-usage-events.md` "How we use this
  data") potentially shared as aggregate counts with Tromsø kommune. Not used for
  advertising, not used for a personalized product experience (there is nothing to
  personalize toward — no profile exists to read back from).
- **Consent gate (why "collected: yes" is still honest with "opt-in"):**
  `src/analytics/consent.ts` — the only states are `'unset' | 'accepted' | 'declined'`,
  and `'unset'` is treated identically to `'declined'` everywhere a flush is gated
  (`mayFlush()` in `src/analytics/core.ts` requires `consent === 'accepted'` exactly). The
  consent prompt is `src/components/ConsentModal.tsx`, shown on first launch via
  `ConsentGate`; declining sends nothing, permanently, until the user actively re-opts-in
  via the Settings toggle (`src/components/UsageConsentToggle.tsx` /
  `settings.privacySection`).
- **App Store Connect selection:** declare "Usage Data" (or "Product Interaction" under
  Apple's current taxonomy) as collected; "Linked to You" = No; "Used for Tracking" = No.

### Location — Coarse Location: Collected (this build)

The build that ships `docs/decision-tourism-baseline.md` (owner decision 2026-09-04) wires
the on-device presence engine (`src/trip/*`, `src/hooks/useTripPresence.ts`) to
`POST /v1/events`. The distinction that drives the answer, and that the owner drew during
design review, is **accesses vs. collects**:

- The app **accesses precise location** on the device — `expo-location`, when-in-use
  permission only, Balanced accuracy (~100 m), 50 m / 60 s throttles, **foreground only**
  (the watcher is torn down on backgrounding; nothing runs when the app is backgrounded or
  terminated; no `UIBackgroundModes`, no always-permission, no TaskManager task). It is
  used for two things, both on-device: (1) Trip Mode, a product feature (your area on a
  map, nearest spots and distances, Navigate), and (2) if the user has said yes to
  tourism insights, comparing the position locally against the fixed spot geofences in
  `src/data/spots.json` and, outside them, an H3 resolution-7 zone cell. The precise
  coordinate is discarded on-device and never transmitted, stored, or logged (see the
  `never`-typed key assertions and runtime payload scan in `test/`).
- The developer/backend **collects only the coarse derived event** —
  `{type, spotId | h3Cell, utcHour, dwellBucket?, recommendationId?}` — and only when
  tourism insights is on. Five event types: `spot_presence`, `spot_presence_long`,
  `spot_visit`, `recommended_spot_visit`, `zone_dwell`. No coordinates, no accuracy, no
  device/person identifier, nothing finer than the hour; folded immediately into the same
  `type|spotId|hourBucket` counters as the usage events (`backend/src/usageStore.ts`),
  same retention and suppression. Never sent to PostHog.
- **Opt-in at first launch.** On iOS/Android the tourism-insights question ("Help improve
  tourism in Tromsø?" — Allow / Not now) is the first of three sequential consent steps
  (`ConsentGate` → `ConsentModal`, `src/analytics/tourismConsent.ts`, key
  `aurora.tourismConsent.v1`, default `'unset'`, treated as declined). Declined = nothing
  measured, nothing sent. The OS location prompt is requested on Allow (or on Start Trip
  Mode). Changeable in Settings › Privacy & data › Tourism insights; off = collection stops
  immediately and the unsent queue is dropped. Not asked on web; web collects nothing.
- **Trip Mode alone collects nothing.** With tourism insights off, Trip Mode samples
  locally for the feature and transmits nothing (`mayEmitTripEvents` in
  `src/trip/tripEventGate.ts` is gated on the tourism consent only). The backend has no
  notion of whether Trip Mode was active.

**App Store Connect selection:** **Location → Coarse Location — Collected: Yes; Linked to
you: No; Used for tracking: No; Purpose: Analytics.** Precise Location — Not Collected
(accessed on-device only; nothing derived at coordinate precision leaves the device).
Apple's questionnaire asks about collection, not device access, so the coarse derived
event is what is declared; verify the live form wording at submission time, as the exact
category labels change between App Store Connect releases.

- *Why Analytics and not also App Functionality:* the coarse events serve aggregate
  tourism statistics only. Trip Mode (the app-functionality use) consumes the precise
  position on-device and collects nothing — it is covered by the "accessed, not collected"
  distinction above, not by a declared purpose.
- *Why not "Linked to you":* no identifier of any kind accompanies a tourism event (same
  reasoning as Usage Data above); the server cannot tell two events from the same device
  apart from two devices.
- *Why not "Used for tracking":* the only recipient is our own backend; no cross-app or
  ad linkage.

### Google Play Data Safety

Play's form asks per data type whether it is collected and/or shared, whether it is
optional, whether it is encrypted in transit, whether users can request deletion, and the
purpose(s). For this build:

- **Location → Approximate location: Collected — Yes. Shared — No. Optional — Yes** (the
  user can use the app without it; the tourism-insights question is default-off and Trip
  Mode is opt-in per session). **Purposes: App functionality** (Trip Mode — position used
  on-device to show nearby spots) **and Analytics** (tourism insights — the coarse derived
  events above). Note Play's "collected" definition includes data transmitted off the
  device; the coarse event is the only thing transmitted.
- **Location → Precise location: Not collected.** Accessed on-device for the two uses
  above; never transmitted. Play's definition of "collected" excludes on-device-only
  processing, so this is honest as "not collected", but do not claim the ephemeral-only
  exemption for approximate location — the coarse event is stored server-side in
  aggregate for `USAGE_RETENTION_DAYS`.
- **Data encrypted in transit: Yes** — `POST /v1/events` goes over HTTPS to
  `EXPO_PUBLIC_API_BASE_URL`.
- **Users can request deletion:** answer honestly — collection stops immediately via the
  Settings toggle and any unsent queue is dropped, but there is no per-user record to
  delete: events are folded into identity-free aggregate counters on arrival, so deletion
  of "your" data is not applicable (the policy says this plainly under "Tourism insights →
  Consent and withdrawal"). Select the deletion answer that matches this — do not claim a
  deletion mechanism that does not exist, and do not claim an ephemeral-processing
  exemption.
- **Usage/App activity (App interactions): Collected — Yes, optional, not shared,
  purpose Analytics** — the three usage-counter types under the anonymous-usage consent
  (see "Usage Data" above).
- Person-level product analytics (PostHog) has its own Data Safety answers (Device or other
  IDs + App interactions, linked, not shared, purpose Analytics) — see the Identifiers /
  Product Interaction section below; the tourism pipeline never feeds it.
- **Permissions declaration:** the build requests `ACCESS_FINE_LOCATION` /
  `ACCESS_COARSE_LOCATION` (when-in-use) only. **No** `ACCESS_BACKGROUND_LOCATION`, no
  foreground service — so Play's "location permissions" declaration form for background
  location is not triggered. If that ever changes it needs a new owner decision first
  (`docs/decision-tourism-baseline.md` section 7).

### Identifiers / Product Interaction — forward-looking note for person-level analytics (PostHog) (not in this build; NOT a final answer for the current or next build)

`docs/analytics-pivot.md` (PR 2 of that doc's section 4 sequencing) is the PR this section
was written for. **This PR ships the privacy policy, the two-question consent UI, and this
store-answers doc only — it does not ship the PostHog SDK, and it does not emit a single
analytics event.** The SDK integration itself, and the App Store Connect label change that
must accompany it, are a later, separately reviewed PR (PR 3). Until that PR ships and its
own live-questionnaire check is done, **the current build's and the next planned build's App
Store Connect answers are unchanged by this PR** — see the existing "Usage Data" section
above, which still applies as written.

- The one thing this PR does add client-side is a third, independent consent CHOICE
  (`aurora.personalAnalyticsConsent.v1`, `'unset' | 'accepted' | 'declined'`, default
  `'unset'` for every install — see `src/analytics/personalAnalyticsConsent.ts`) and the UI
  to set it (a second, separately-actioned question in the first-open consent flow, plus a
  `PersonalAnalyticsToggle` in Settings). No SDK reads this value yet; nothing is
  transmitted as a result of it being `'accepted'` in this build.
- Expected shape once PR 3 ships the SDK, subject to a live re-check at that time (mirrors
  the Trip mode forward-looking note below): **Identifiers (User ID) — Collected: Yes**
  (a pseudonymous per-install identifier generated and managed by PostHog); **Linked to
  user: Yes** (unlike the existing aggregate "Usage Data" answer above, this pipeline does
  attach a persistent identifier to events); **Used for tracking: No** (no cross-app or
  advertising linkage — Apple's ATT "tracking" definition — see
  `docs/analytics-pivot.md` section 3: no IDFA/GAID, no data sharing with other companies'
  apps/sites); **Purpose(s): Analytics.**
- **Product Interaction — Collected: Yes** (the explicit event allowlist in
  `docs/analytics-pivot.md` section 3: `app_open`, `screen_view`, `spot_view`,
  `navigate_pressed`, `spot_shared`, `alerts_opt_in`, `language_set`,
  `trip_mode_toggled` — the toggle state only, never Trip mode's own presence events);
  **Linked to user: Yes** (same pseudonymous identifier as above); **Used for tracking:
  No**; **Purpose(s): Analytics.**
- **Hard ship gate (mirrors the Trip mode note below):** this answer must be verified
  against the live App Store Connect questionnaire, and reconciled with the actual shipped
  implementation, **before any build containing the PostHog SDK or any event-emission code
  is submitted.** It does **not** apply to this PR's build or the current/next planned
  build — neither ships the SDK, per `docs/analytics-pivot.md` section 4's sequencing (PR 2
  is policy/consent/store-answers only; PR 3 is the SDK). Per that same doc, App Store
  Connect's live privacy label must reflect this new answer before the first build shipping
  the SDK is submitted.

### Identifiers (Device ID, User ID, etc.) — Not Collected

- No advertising ID, no push-notification registration token (see "Push notifications /
  alerts" below — not wired up client-side at all in the current app), no analytics SDK
  that would generate a client ID, no login/account system of any kind. `grep -r
  "getToken"` across `src/` returns nothing — there is no push-token retrieval code in the
  shipped client, so no device/push identifier is ever generated or stored client-side,
  let alone sent anywhere.
- The only client-persisted values at all are five preference strings in
  `AsyncStorage`/`localStorage` (`src/lib/storage.ts`), none of which identify the device
  or the person, and none of which ever leave the device:
  - `aurora.language.v1` — the chosen UI language (`src/i18n/index.ts`)
  - `aurora.analyticsConsent.v1` — `'accepted' | 'declined'` (`src/analytics/consent.ts`)
  - `aurora.tourismConsent.v1` — `'accepted' | 'declined'`, a completely independent
    consent choice from the one above (`src/analytics/tourismConsent.ts`): the
    tourism-insights consent that gates the location-derived events declared under
    "Location" above. (The earlier `aurora.tripModeConsent.v1` key is no longer read —
    everyone is re-asked, per `docs/decision-tourism-baseline.md`.)
  - `aurora.personalAnalyticsConsent.v1` — `'accepted' | 'declined'`, a third, completely
    independent consent choice from both of the above
    (`src/analytics/personalAnalyticsConsent.ts`; see the forward-looking Identifiers /
    Product Interaction note above); person-level analytics itself has no SDK or
    collection code yet in this build, this key currently only records the two-question
    consent flow's answer
  - `aurora.designPreviewMode.v1` — `'on' | 'off'` (`src/preview/previewMode.ts`, a
    developer/marketing preview toggle — see `docs/store-listing/README.md`'s screenshot
    section for what it's used for)
- **App Store Connect selection:** "Identifiers" (Device ID / User ID) — Not Collected.

### Contact Info, User Content, Search/Browsing History, Financial Info, Health & Fitness,
Purchases, Sensitive Info — all Not Collected

- No account/sign-up flow exists anywhere in the app (confirmed above), so there is no
  name, email, phone number, or address ever requested.
- No user-generated content feature exists (no reviews, comments, photo uploads, or
  free-text fields anywhere in `src/` — `docs/design-spot-reviews.md` is a *design
  proposal*, not a shipped feature; nothing in `src/screens/` or `backend/src/` implements
  it).
- No in-app purchases, subscriptions, or payment code exists in `package.json` or `src/`.
- No health, fitness, or biometric data of any kind is relevant to or collected by this
  app.
- **App Store Connect selection:** all of the above — Not Collected.

### Diagnostics (Crash Data, Performance Data, Other Diagnostic Data) — Not Collected

- No crash-reporting or performance-monitoring SDK (e.g. Sentry, Firebase Crashlytics,
  Bugsnag) appears in `package.json` (root or `backend/`). The only third-party services
  the app talks to are MET Norway and NOAA (public weather/space-weather data, not
  analytics — see `src/api/yr.ts`, `src/api/kp.ts`, `src/api/auroraOval.ts`) and, in
  backend mode, this project's own backend (`src/api/backend.ts`).
- **App Store Connect selection:** Diagnostics — Not Collected. (If the owner later adds
  crash reporting before submission, this section and the corresponding App Store Connect
  answer both need to be revisited — flagging so it isn't silently missed.)

## Push notifications / "aurora alerts" — explicitly NOT part of this app's current
App Privacy answers

`docs/design-aurora-alerts.md` and `docs/privacy-push-alerts.md` describe a **designed but
not fully shipped** feature: `backend/src/alerts.ts` / `backend/src/fcm.ts` exist
server-side (a trigger engine that decides *whether* to publish to an FCM topic — see
`docs/privacy-push-alerts.md`: "Client-side subscription UI/opt-in (PR β,
`src/notifications/`) is referenced but not yet built"). There is no `src/notifications/`
directory, no `expo-notifications` dependency, and no push-token registration
(`getToken`-style call) anywhere in `src/` today — grepping confirms this. **Because the
shipped client app requests no notification permission and registers no token, "Push
notifications" should not be listed as a collected data type today.** This must be
revisited (both this doc and the live App Store Connect answers) if/when the client-side
alerts opt-in ships — per `docs/privacy-push-alerts.md`, that itself requires the same
privacy-sensitive human-review gate as this feature already carries, and per
`docs/roadmap-2026-27.md`, alerts are the flagship Phase 2 (post-launch) build, not part of
this submission.

## Third-party SDKs actually present (what could theoretically collect data)

Checked `package.json` (root) and `backend/package.json` for anything beyond direct
first-party code:

- `@react-native-async-storage/async-storage` — local device storage only (see above); no
  network calls, no telemetry of its own.
- `react-native-maps` — renders the on-device map UI (`src/screens/MapScreen.native.tsx`);
  does not phone home to any analytics endpoint from this app's usage of it.
- `expo-localization` — reads the device's locale setting locally to pick a default
  language (`src/i18n/index.ts`'s `detectDeviceLanguage()`); no network call.
- `expo-updates`, `expo-font`, `expo-status-bar`, `@expo/metro-runtime`,
  `@react-navigation/*` — standard Expo/React Navigation infrastructure, no analytics/ad
  functionality.
- No advertising SDK, no analytics SDK (Firebase Analytics, Mixpanel, Amplitude, etc.), no
  social SDK, no attribution SDK (AppsFlyer, Adjust, etc.) anywhere in either
  `package.json`. **This includes PostHog:** `docs/analytics-pivot.md` (this PR, PR 2 of
  its sequencing) adds the consent UI and this doc's forward-looking note above, but does
  not add the `posthog-react-native` (or any PostHog) package dependency, and no code in
  `src/` imports or initializes it. The SDK dependency itself, and its consent-gated
  initialization, are PR 3.
- **Conclusion:** the only data this app's own code ever transmits off-device is (a) the
  opt-in usage events and, under their own separate opt-in, the coarse tourism-insights
  events described above, both to our own backend, and (b) ordinary weather/
  space-weather API requests to MET Norway / NOAA (or to our own backend proxying them),
  which carry no user data — they're plain `GET` requests for public forecast data, not
  requests parameterized by anything about the user (see `src/api/yr.ts` / `src/api/kp.ts`
  / `backend/src/sources.ts`). Nothing is ever sent to PostHog in this build, regardless of
  the personal-analytics consent choice, because no code capable of sending it exists yet.

## "Why not X" — overclaiming/underclaiming notes

- **Why not answer "Data Not Collected" across the board?** Would underclaim: the opt-in
  usage events are real, do get transmitted (when accepted), and do get retained
  server-side in aggregate form (`backend/src/usageStore.ts`, up to
  `USAGE_RETENTION_DAYS`, default 180 days). Declaring "no data collected" while shipping
  a working (if opt-in, if aggregate-only) telemetry pipeline is exactly the kind of
  mismatch Apple's review checks for by installing the app and inspecting its actual
  network traffic.
- **Why not answer "Linked to You: Yes"?** Would overclaim: there is no user identifier of
  any kind attached to an event, before or after transmission — the server can't
  distinguish "500 different people each viewed a spot once" from "one person viewed 500
  spots," because it never stores anything finer than an
  `(eventType, spotId, hourBucket) -> count` tuple (`backend/src/usageStore.ts`). "Linked"
  requires a persistent identifier tying multiple data points to one user; none exists.
- **Why not answer "Used for Tracking: Yes"?** Would overclaim in the specific ATT sense
  Apple defines "tracking" as (linking user/device data with data from other companies'
  apps or websites for ads/measurement, or sharing with a data broker). None of that
  happens — the only recipient of any event is this project's own backend, for its own
  aggregate product/planning use (and, per policy, aggregate sharing with Tromsø kommune,
  which is still aggregate-only, never linked to an individual — see
  `docs/privacy-usage-events.md`'s "Access control" section).
- **Why declare "Coarse Location: Collected" rather than "Precise Location" or "Not
  Collected"?** "Not Collected" would underclaim: with tourism insights on, coarse
  location-derived events (spot / ~5 km² zone cell + UTC hour) really are transmitted and
  retained in aggregate. "Precise Location" would overclaim: the coordinate is read and
  discarded on-device and never leaves it — Apple's questionnaire is about what the
  developer collects, not what the app accesses. See the "Location" section above.

## Cross-check against the public privacy policy

Every answer above is consistent with `docs/privacy-policy.md` (the text that will be
published at `https://aurora.hovding.dev/privacy.html`, per `src/constants/legal.ts`'s
`PRIVACY_POLICY_URL`) — the questionnaire should never claim more or less than what that
policy already tells users. If the policy text changes before submission, re-check this
doc against it before finalizing the App Store Connect answers.
