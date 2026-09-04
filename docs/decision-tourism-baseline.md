# Decision: baseline tourism insights at first launch; Trip Mode becomes a product feature

Status: **Owner decision 2026-09-04 (recorded from owner instruction; merging
this PR set is the ratification).** This document amends
`docs/design-trip-tracking.md` and `docs/analytics-pivot.md` where they
conflict with it (section 8 lists exactly what is superseded). Everything
not named there stands.

## 1. What changes

Until now the identity-free presence pipeline (`src/trip/*`) was gated on a
"Trip mode" consent switch in Settings, and "Trip mode" was nothing more than
that switch — there was no product feature behind it. This decision splits the
one concept into two:

- **Tourism insights** — the measurement. An optional, explicit, default-off
  consent asked at first launch, gating the identity-free spot-presence
  pipeline. Runs only while the app is open in the foreground.
- **Trip Mode** — a product feature. Started and ended by the user, it shows
  a location-aware aurora experience (your area on a map, nearest spots and
  scores, navigation, tonight's conditions, spots visited on this trip). It
  is not a consent and does not gate collection.

PostHog product analytics remains the third, separate thing it already was.

```
TOURISM ANALYTICS                 TRIP MODE                          POSTHOG
Optional, asked at first launch   Optional product feature           Separate product analytics
        ↓                                 ↓                                  ↓
OS location permission            explicitly started by user         separate consent
        ↓                                 ↓                                  ↓
device observes location          location-aware Aurora experience   pseudonymous product events
        ↓                         (nearby spots / scores / map /              ↓
local classification               navigation / conditions)           PostHog EU
        ↓
raw coordinates discarded                                             NO tourism location events
        ↓
identity-free coarse event
        ↓
Aurora backend → aggregate tourism statistics
```

Rationale (owner, 2026-09-04): a measurement that only runs while a rarely
used switch is on produces a sample too thin to say anything about where
aurora tourists actually go. Asking once, plainly, at first launch — and
keeping the collection foreground-only and identity-free — gives a usable
baseline without touching the 2026-08-18 "no passive background tracking"
line. Trip Mode, freed from being a consent, can become the feature Apple's
location guidance expects a location permission to serve.

## 2. The four independent states

Four things are true or false on any given phone, and none implies another:

| State | Where it lives | Who sets it |
|---|---|---|
| OS when-in-use location permission | The OS | The user, via the OS prompt (requested lazily: on Allow in the tourism question, or on Start Trip Mode) |
| Tourism-insights consent | `aurora.tourismConsent.v1` on the device (`src/analytics/tourismConsent.ts`) | The user, at first launch on iOS/Android (first of three sequential questions), or later in Settings › Privacy & data |
| Product-analytics (PostHog) consent | `aurora.personalAnalyticsConsent.v1` | The user, its own question, its own Settings toggle |
| Trip Mode session | In memory only (`src/trip/tripSession.ts`) — never persisted, never transmitted | The user, Start/End on the Tonight screen card |

Truth table for the presence engine (`src/hooks/useTripPresence.ts`).
"Samples" means the device reads its own position and classifies it locally;
"transmits" means coarse events go to `/v1/events`. Both additionally require
OS permission and the app being in the foreground.

| Tourism insights | Trip Mode | Samples locally | Transmits coarse events |
|---|---|---|---|
| OFF | OFF | no | no |
| OFF | ON | yes — for the feature only | **no** (gate closed; nothing queued) |
| ON | OFF | yes | yes |
| ON | ON | yes | yes — identical events; the backend cannot tell Trip Mode was on |

Consequences the code enforces:

- Transmission is gated on the tourism consent alone (`mayEmitTripEvents` in
  `src/trip/tripEventGate.ts`). Neither the PostHog consent nor the usage-
  counter consent nor an active Trip Mode session can open that gate.
- Trip Mode ON with tourism OFF samples for the feature and sends nothing —
  the closing visit summary on backgrounding is flushed only when the tourism
  consent is accepted (`shouldFlushStopIntents`).
- PostHog keeps its existing, state-only `trip_mode_toggled` event; it now
  means "the user started/ended a Trip Mode session". No tourism location
  event ever reaches PostHog.
- The two pipelines (tourism → our backend; product analytics → PostHog)
  stay unjoined. Unchanged from `docs/analytics-pivot.md`.

## 3. The privacy boundary

```
RAW GPS (precise, on device)
   │  expo-location, when-in-use, Balanced (~100 m), 50 m / 60 s throttles,
   │  foreground only
   ▼
DEVICE-ONLY LOCAL CLASSIFICATION
   │  classifySpot() against the 28 spot geofences; H3 res-7 zone cell
   │  outside them; dwell timers; recommendation attribution (12 h window)
   │  → raw coordinates are discarded here
   ▼
COARSE EVENT   { type, spotId | h3Cell, utcHour, dwellBucket?, recommendationId? }
   │  no lat/lon, no accuracy, no timestamp finer than the hour, no id of any kind
   ▼
NETWORK  →  POST /v1/events (our backend only; never PostHog)
   │  no auth, no cookies, no client id; request metadata not logged (no IP)
   ▼
BACKEND  →  folded immediately into aggregate counters  type|spotId|hourBucket
            retention USAGE_RETENTION_DAYS (180 default), suppression STATS_MIN_CELL
```

Event types (unchanged): `spot_presence`, `spot_presence_long`,
`spot_visit`, `recommended_spot_visit`, `zone_dwell`.

What never crosses the boundary: precise coordinates (in any form — not
hashed, not rounded, not "for debugging"); accuracy or speed; any device,
install, session, or person identifier; anything that orders two events from
the same device; whether Trip Mode was active; anything at all while the app
is backgrounded or terminated. `TripEventWirePayload` is type-asserted and
runtime-scanned in tests to have none of those keys.

## 4. Consent

- **When:** the first time the app is opened on iOS or Android, as the first
  of three sequential questions (tourism insights → anonymous usage counts →
  personal product analytics). Not asked on web; the web build collects no
  location-derived data at all.
- **Copy:** "Help improve tourism in Tromsø?" — plain language: what is
  measured, that precise location stays on the phone, that only anonymous
  spot- and area-level notes leave it, only while the app is open, and that
  no changes nothing. Buttons **Allow** / **Not now**, equal weight; footnote
  "You can change this any time in Settings." Five locales.
- **Decline is genuine:** "Not now" (or dismissing) = declined; nothing is
  measured, nothing is sent, no nagging re-prompt. Accepting then denying the
  OS permission prompt also yields nothing measured.
- **Persisted on device only** (`aurora.tourismConsent.v1`); the choice never
  reaches a server.
- **Changeable in Settings › Privacy & data › Tourism insights.** Off =
  collection stops immediately and the unsent queue is dropped.
- **Re-consent rationale:** the old `aurora.tripModeConsent.v1` key is never
  read again. The earlier consent covered measurement "while Trip mode is
  on"; this decision widens the window to "whenever the app is open in the
  foreground". That is a scope expansion, so per the hard floor in
  `CLAUDE.md` (re-consent when scope expands) everyone is asked the tourism
  question once at next launch. This supersedes the 2026-08-22 position in
  `docs/analytics-pivot.md` that existing Trip-mode consents stayed valid.

## 5. Recommendation attribution stays on-device

Unchanged: the device remembers the last recommendation it showed, compares
on arrival within a 12-hour window, and emits only the outcome
(`recommended_spot_visit {spotId, recommendationId, utcHour}`). No "shown"
event is ever sent; the server never joins anything. Trip Mode's "best nearby
now" recommendation feeds the same on-device store.

## 6. Platform behaviour matrix and permissions

| | iOS | Android | Web |
|---|---|---|---|
| Foreground, permission granted | samples, classifies, transmits (if tourism ON) | same as iOS | no consent question, no sampling; Trip Mode lists spots by distance without a map |
| Background | watcher stopped on the app-state change; closing visit summary flushed only if tourism ON | same | n/a |
| Terminated | nothing runs | nothing runs | n/a |

Platform differences worth knowing:

- Android honours the 60 s `timeInterval`; iOS honours only the 50 m
  `distanceInterval` (so a stationary iPhone yields fewer samples — dwell is
  still measured from the enter time, so this does not lose visits).
- Android's "only this time" grants are re-checked on every foreground; a
  lapsed grant means no sampling and a Settings helper saying so.

Permissions declared: when-in-use location only
(`locationWhenInUsePermission` in `app.json`, usage string covering both the
map/Trip Mode feature and optional tourism measurement). **Not** declared: any
always/background location permission, `UIBackgroundModes`, TaskManager
tasks, foreground services.

## 7. What background measurement would require — NOT approved here

Reliable measurement while the app is not on screen is explicitly outside
this decision. It contradicts the 2026-08-18 "no passive background
tracking, ever" decision and would need a fresh owner decision plus:

- `locationAlwaysAndWhenInUsePermission` /
  `NSLocationAlwaysAndWhenInUseUsageDescription` (iOS)
- `UIBackgroundModes: location` (iOS)
- Android `ACCESS_BACKGROUND_LOCATION` plus a foreground service with a
  persistent notification (Android 10+)
- an `expo-task-manager` background location task
- App Store review justification and the Google Play "location permissions"
  declaration form
- a privacy-policy rewrite and re-consent
- a battery and data-quality review (background samples re-introduce the
  resident/commuter pollution the 2026-08-18 decision was avoiding)

None of the above is in this PR set.

## 8. Prior decisions: superseded and preserved

Superseded:

- `docs/design-trip-tracking.md` ship gate 6.2, "NOT in the first-open
  modal — Settings, at point of relevance". The tourism question is now the
  first-open modal's first step.
- `docs/analytics-pivot.md` §3 amendment, "existing Trip-mode consents
  remain valid (no re-consent reset)". Everyone is re-asked (section 4).
- The design doc's framing of Trip mode as "a persistent opt-in (consent once
  in Settings)". Trip Mode is a session the user starts and ends.

Preserved, unchanged:

- "No PASSIVE background tracking, ever" (2026-08-18). The baseline is
  foreground-only; the design doc's active-trip-session background
  continuation remains unimplemented and would fall under section 7.
- Every identity-free / unlinked constraint: no coordinates, no identifiers,
  no trajectories, no linkable ingestion (gate 6.5), aggregate-only
  publication with suppression (gate 6.6), municipality delivery as a
  fixed-dimension export, never `/v1/stats`.
- Tourism events never go to PostHog; the two pipelines are never joined.

## 9. Needs privacy / legal / store review before this build ships

Merging ratifies the decision; these items still need a human pass against
the live forms before submission:

1. **App Store privacy label** — Location → Coarse Location: Collected, Not
   linked to you, Not used for tracking, purpose Analytics (the app accesses
   precise location on-device; only the coarse derived event is collected).
   See `docs/store-listing/app-privacy-answers.md`.
2. **Google Play Data Safety** — Location → Approximate location: collected,
   optional, not shared, purposes App functionality (Trip Mode) + Analytics
   (tourism insights); Precise location: not collected.
3. **iOS when-in-use usage string** (`app.json`) — reviewer-facing; confirm
   it reads honestly in App Store Connect.
4. **Policy text** — `docs/privacy-policy.md` / `public/privacy.html`
   "Tourism insights" and "Trip Mode" sections, published before the build.
5. **The fact that everyone is re-asked** — confirm this is acceptable
   product-wise and that the re-consent rationale (section 4) is what we
   want on record.
