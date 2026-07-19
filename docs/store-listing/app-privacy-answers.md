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
- **What exactly:** Two event types, `spot_view` and `navigate_pressed` (a third,
  `spot_shared`, is defined in the type union but never emitted by any call site today —
  see `src/analytics/events.ts`'s own comment: "'spot_shared' is intentionally never
  emitted by any call site in this codebase today... wire it up if/when a real share
  action is added, not before"). Each event is exactly `{ type, spotId }` — no timestamp
  finer than the server-assigned UTC hour bucket, no session ID, nothing else
  (`backend/src/events.ts` `parseEvents()` rejects anything with extra/different fields).
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

### Location — Not Collected

- No `expo-location` (or any geolocation) dependency exists in `package.json`; grepping
  `src/` for `Geolocation`, `getCurrentPosition`, `expo-location`,
  `requestForegroundPermissions`, or any `NSLocation*` Info.plist key returns nothing.
  `app.json`'s `ios.infoPlist` has no location usage-description key at all (only
  `ITSAppUsesNonExemptEncryption`).
- Every "distance" or "km" value shown in the UI (`common.distanceTromsoCenter`,
  `tonight.distanceCityCenter`, etc. in every `src/i18n/locales/*.json`) is computed from
  the **spot's own fixed coordinates** in `src/data/spots.json` (`lat`/`lon` per spot,
  plus each spot's static `distanceKm`) against a fixed reference point (Tromsø city
  center) — never from the device's own position. There is no code path that reads or
  could read the user's real location.
- **App Store Connect selection:** "Location" — Not Collected.

### Identifiers (Device ID, User ID, etc.) — Not Collected

- No advertising ID, no push-notification registration token (see "Push notifications /
  alerts" below — not wired up client-side at all in the current app), no analytics SDK
  that would generate a client ID, no login/account system of any kind. `grep -r
  "getToken"` across `src/` returns nothing — there is no push-token retrieval code in the
  shipped client, so no device/push identifier is ever generated or stored client-side,
  let alone sent anywhere.
- The only client-persisted values at all are three preference strings in
  `AsyncStorage`/`localStorage` (`src/lib/storage.ts`), none of which identify the device
  or the person, and none of which ever leave the device:
  - `aurora.language.v1` — the chosen UI language (`src/i18n/index.ts`)
  - `aurora.analyticsConsent.v1` — `'accepted' | 'declined'` (`src/analytics/consent.ts`)
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
  `package.json`.
- **Conclusion:** the only data this app's own code ever transmits off-device is (a) the
  opt-in usage events described above, to our own backend, and (b) ordinary weather/
  space-weather API requests to MET Norway / NOAA (or to our own backend proxying them),
  which carry no user data — they're plain `GET` requests for public forecast data, not
  requests parameterized by anything about the user (see `src/api/yr.ts` / `src/api/kp.ts`
  / `backend/src/sources.ts`).

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
- **Why declare "Location: Not Collected" instead of "Coarse Location"?** Because no
  location of any kind — coarse or precise — is ever read from the device. It would be a
  category error to declare *any* location collection when the "distance" figures shown
  are pre-computed static data about the spots themselves, not derived from the user in
  any way, at any precision.

## Cross-check against the public privacy policy

Every answer above is consistent with `docs/privacy-policy.md` (the text that will be
published at `https://aurora.hovding.dev/privacy.html`, per `src/constants/legal.ts`'s
`PRIVACY_POLICY_URL`) — the questionnaire should never claim more or less than what that
policy already tells users. If the policy text changes before submission, re-check this
doc against it before finalizing the App Store Connect answers.
