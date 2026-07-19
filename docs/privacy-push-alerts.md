# Privacy: "tonight looks good" aurora push alerts

This document describes the alerts feature added in `backend/src/alerts.ts`
and `backend/src/fcm.ts` (server-side trigger engine + FCM topic publisher),
per `docs/design-aurora-alerts.md` (Option B: topic-based FCM). It mirrors
the structure of `docs/privacy-usage-events.md`. Client-side subscription
UI/opt-in (PR β, `src/notifications/`) is referenced but not yet built —
see "Opt-in mechanics" below.

This feature is privacy-sensitive per `CLAUDE.md` and requires human review
before merge. See `docs/design-aurora-alerts.md` §5 for the open owner
decisions this doc doesn't resolve on its own (notably: provider choice is
reported-but-not-independently-confirmed as of this writing — see that
doc's status header).

## What is stored server-side

Exactly one thing: `backend/data/alerts-state.json`, a tiny JSON file with
three fields —

```jsonc
{
  "nightKey": "2026-07-19",       // which Oslo-local aurora night this state is for
  "firedTiers": { "ge70": true }, // which score tiers have already pushed tonight
  "totalFired": 1                 // hard cap counter (max 1/night, enforced in-process)
}
```

That's the entire schema (`PersistedAlertState` in `backend/src/alerts.ts`).
There is **no user data of any kind** in this file or anywhere else this
feature touches server-side:

- No device or push-registration tokens.
- No subscription records — i.e. no list of "who is subscribed to what."
- No IP addresses, user agents, or other request metadata (this file isn't
  written in response to any incoming request at all — it's updated purely
  from the backend's own periodic snapshot-refresh cycle, see
  `refreshSnapshot()` in `backend/src/server.ts`).
- No per-user anything. `nightKey`/`firedTiers`/`totalFired` describe the
  state of *the feature*, not of any person — they'd be identical no matter
  how many (or how few) people are subscribed to a topic.

## What Google/Firebase processes (and why that's not this backend's data)

Option B's entire privacy argument rests on one structural fact: **devices
talk to Google directly, not through this backend.** Concretely:

- The client app (once PR β ships) subscribes a device to an FCM *topic*
  (`alerts-ge70` or `alerts-ge45` — see below) using Google's client SDK.
  That subscribe call goes straight from the device to Google's servers.
  This backend is never in that path, never receives the device's FCM
  registration token, and has no way to learn it even if it wanted to.
- This backend's only interaction with FCM is the reverse direction:
  `backend/src/fcm.ts` authenticates as a backend-only service account (a
  secret only the owner holds — see `docs/setup-firebase-alerts.md`) and
  asks Google to deliver a small message to everyone currently subscribed
  to a *topic*. It addresses the topic by name only.
- **Google is a data processor here, holding data this backend never had in
  the first place** — the device↔topic subscription mapping lives entirely
  on Google's infrastructure, governed by Firebase's own terms/privacy
  policy (out of scope for this doc, but should be named explicitly in the
  app's user-facing privacy policy — see "Open items" below). This is
  different from, and more structurally private than, an architecture where
  this backend stores tokens and merely *promises* to handle them carefully
  — there is no token-table here to audit, breach, or mishandle.

## What we can never do

By construction, this backend **cannot target an individual device**. The
FCM HTTP v1 payload this backend sends (see `backend/src/fcm.ts`) is
addressed by `topic` only — never `token` (a specific device) or
`condition` (a boolean expression that can still resolve to specific
tokens). There are exactly two topics, `alerts-ge70` and `alerts-ge45`
(not per-user, not per-device, not per-language — see
`docs/design-aurora-alerts.md` §2's reasoning against topic-per-language),
and every message sent to one is a broadcast to everyone currently
subscribed to it. This isn't a policy this backend chooses to follow; it's
that no code path here ever has a device identifier to target with in the
first place. `backend/test/alerts.test.ts` includes a test asserting no
device/registration-token-shaped field ever appears in a published message
(the "PRIVACY INVARIANT" test).

## What is sent in a push

A data-only `data` block (no title/body composed server-side — the
foreground/Android client renders localized text from its own i18n
catalogs on receipt, per `docs/design-aurora-alerts.md` §2 and PR #52's
`src/notifications/alertsClient.ts`), **plus** two delivery-only blocks
added after PR β review found a gap (see "iOS background/killed delivery"
below) — none of the three blocks ever carries anything beyond what's
already public at `GET /v1/tonight`:

```jsonc
{
  "data": {
    "threshold": "70",                          // which tier crossed (70 or 45)
    "score": "82",                              // the best spot's score that triggered it
    "spotId": "ersfjordbotn",                   // which spot, from the existing public spot catalog
    "spotName": "Ersfjordbotn",
    "bestWindowStart": "2026-07-19T20:00:00.000Z",
    "bestWindowEnd": "2026-07-19T23:00:00.000Z"
  },
  "android": { "priority": "high" },            // timely (not battery-deferred) delivery; no new data
  "apns": {
    "payload": {
      "aps": {
        "alert": {
          "title-loc-key": "ALERT_TITLE_GE70",  // ALERT_TITLE_<TIER> / ALERT_BODY_<TIER>
          "loc-key": "ALERT_BODY_GE70",         // per crossed tier -- never literal text
          "loc-args": ["Ersfjordbotn", "20:00–23:00"] // [spotName, Oslo-local best-window range]
        },
        "sound": "default"
      }
    }
  }
}
```

Every field here is already public information this backend serves at
`GET /v1/tonight` to anyone, unauthenticated — nothing in this payload is
derived from or identifies a subscriber.

### iOS background/killed delivery (`apns` block)

Found during PR β (client) review: a data-only FCM message does not wake a
backgrounded or killed iOS app — only a native APNs `alert` does. Android
and any foreground app on either OS were already fine (they compose their
own notification from `data`, per PR #52). `backend/src/fcm.ts` now adds an
`apns.payload.aps.alert` block using Apple's `title-loc-key`/`loc-key`/
`loc-args` fields — this instructs iOS to render the notification **from
strings baked into the app bundle itself** (`ALERT_TITLE_GE70`/
`ALERT_BODY_GE70`/`ALERT_TITLE_GE45`/`ALERT_BODY_GE45`, written into
`Localizable.strings` for five languages at prebuild time by
`plugins/withAlertLocalizableStrings.js`), substituting `loc-args`
positionally.

This is still identifier-free and still device-language-localized, just by
a different mechanism than the client's own data-driven render:

- **No new data leaves this backend.** `loc-args` is built only from the
  same `spotName`/`bestWindowStart`/`bestWindowEnd` fields already in
  `data` above (see `fcm.ts`'s `buildApnsAlert`) — nothing about the
  message's *content* changes, only how iOS is told to display it while the
  app isn't running.
- **Localization moves on-device, not further from it.** The backend never
  chooses or sends a language or any composed text — iOS resolves
  `title-loc-key`/`loc-key` against whichever `.lproj/Localizable.strings`
  matches the *device's own* language setting, exactly as reliably as the
  client's existing i18n-catalog render, just reachable even when the app
  isn't running to do that rendering itself.
- **`android: { priority: 'high' }`** is unrelated to localization or
  identity — it only asks FCM to attempt timely (not battery-deferred)
  delivery of the same `data` block Android already had.

`test/alerts.test.ts`'s privacy-invariant scan (`doesNotMatch(...,
/device|registration|expo[-_]?push|token/i)`) now covers the **entire**
serialized message body, including these two new blocks, not just `data`.

## Opt-in mechanics

**Not yet built — this section describes the plan, not shipped behavior.**
Per `docs/design-aurora-alerts.md` §1: opt-in only, default off, no OS push
permission requested and no topic subscription happens until the user
explicitly turns the feature on from a settings-row toggle (PR β,
`src/notifications/`), following the same "unset behaves like declined"
philosophy as `src/analytics/consent.ts`. This backend has no opt-in state
of its own to manage — there is nothing to record consent *about*, since
this backend never learns who is or isn't subscribed (see above). Opting
out client-side (unsubscribing from the topic) is entirely a client
operation and requires no server-side change or deletion, because there
was never a server-side record tied to that device to delete.

## Retention

`backend/data/alerts-state.json` holds exactly one aurora night's worth of
flags (see schema above) and is overwritten in place on every successful
snapshot refresh. On a new Oslo-local night (`getNightKey()` in
`backend/src/alerts.ts`), the prior night's `firedTiers`/`totalFired` are
discarded outright — there is no history, log, or accumulation of past
nights anywhere. A missing or corrupt file is treated as "start of a clean
night" (no crash, no data loss that matters, since there was never
anything but the current night's bookkeeping to lose). Google/Firebase's
own retention of topic-subscription data is governed by Firebase's terms,
not this repo — see "Open items" below.

## Access control

There is no read or write API for this data — `alerts-state.json` is
process-internal bookkeeping, never exposed via any HTTP route (unlike
`GET /v1/stats/usage`, which does expose aggregate usage data). The
alerts-engine's only external effect is the outbound FCM publish call
itself, authenticated with an owner-held service-account secret
(`FCM_PROJECT_ID`/`FCM_SERVICE_ACCOUNT`) that only the backend process
holds — see `docs/setup-firebase-alerts.md`.

## Open items for human / GDPR review

- **CODEOWNERS additions.** `docs/design-aurora-alerts.md` §2 proposes
  `/backend/src/alerts*`, `/backend/src/**/alerts*`, `/src/notifications/`,
  and this document itself as CODEOWNERS-protected paths. None of these are
  in `.github/CODEOWNERS` yet — `.github/` is itself CODEOWNERS-protected,
  so only the owner can add them. Should happen before (or as part of)
  merging the alerts-backend PR.
- **Provider-choice confirmation.** See `docs/design-aurora-alerts.md`'s
  status header and §5 item 1 — recorded here as a coordinator-relayed
  report of an owner decision, not yet independently confirmed in-repo by
  the owner directly.
- **Privacy-policy section.** The app's user-facing privacy policy
  (`docs/privacy-policy.md`) does not yet mention push alerts, FCM, or
  Google/Firebase as a data processor for this feature. Needs a new section
  once the client (PR β) actually ships and real users can opt in — no
  rush before that, since nothing user-facing exists yet, but it should
  land in the same PR (or immediately before) client opt-in ships, not
  after.
- **Firebase/Google's own data handling.** This doc describes what this
  backend does and does not do; it does not audit or restate Firebase's own
  privacy practices for topic subscriptions (retention, region, etc. on
  Google's side). That's Google's documentation to reference, not this
  repo's to restate — link it from `docs/privacy-policy.md` when that
  section is added, rather than duplicating it here.
- **Fatigue/abuse observability (PR 6 in the design doc).** Any future
  aggregate-only `alert_sent`/`alert_opened` counters must follow the exact
  `spot_view` pattern (hour-bucketed counts only, no per-device breakdown)
  and get the same "requires human review" treatment as `usageStore.ts` —
  flagged here so it isn't added casually alongside an unrelated change
  later.
