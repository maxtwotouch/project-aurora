# Privacy Policy — Tromsø Northern Lights

_Last updated: [DATE — set at publication]_

This is the repo-canonical source for the privacy policy shown in the app and published at
`public/privacy.html` (served at `https://aurora.hovding.dev/privacy.html`
once merged). The two files must be kept in sync; if you edit one, edit the other.

## What this app is

Tromsø Northern Lights is a mobile app that helps visitors and residents of Tromsø, Norway
decide where and when conditions are best for seeing the northern lights tonight. It shows a
weather- and geomagnetic-activity-based forecast for a fixed set of named viewing spots.

## Who operates this app

[Operator name and contact — to be completed by the owner]

## What we collect

By default, this app collects **nothing** about you or your device. The only data collection
in the app is a small, optional, anonymous usage counter, and it only ever runs if you
explicitly opt in (see "Consent" below).

If you opt in, the app may send an anonymous event each time you view a spot or tap
"navigate" for a spot. Each event contains only:

- an event type (spot viewed, or navigate tapped), and
- the id of the spot involved (one of the app's fixed, named viewing spots).

These events are aggregated immediately into counts grouped by spot and by hour — for
example, "spot X was viewed N times between 20:00 and 21:00 UTC." No individual event is
ever stored or retained; only the running counts exist.

Specifically, and always, regardless of whether you opt in:

- **No accounts.** The app does not require sign-up or login, and has no concept of a user
  account.
- **No names or other identifying profile information** are ever collected.
- **No IP addresses** are stored or logged in connection with app usage.
- **No device identifiers** (advertising IDs, device IDs, push tokens used for tracking,
  etc.) are collected.
- **No precise location is ever collected.** The app does not request or read your GPS
  coordinates. The only "location" concept in the anonymous counters is which named,
  fixed viewing spot you interacted with — never coordinates, and never your own position.
- **No cookies are used by the app itself.**
- **No third-party trackers or advertising SDKs** are embedded in the app.

## Consent

The first time you open the app, you are asked whether you want to share anonymous usage
counts as described above. Both choices are equally easy to make.

- If you decline, or simply close the prompt, **zero usage data is collected or sent** —
  nothing changes about how the app works.
- If you accept, only the anonymous, aggregated counts described above are ever sent.
- You can change your mind at any time using the "Anonymous usage sharing" toggle on the
  All Spots screen. Turning it off immediately stops any further collection.
- Your consent choice itself is stored only on your own device (not on any server), purely
  so the app remembers your preference between visits.

## How we use this data

Aggregated, anonymous counts (never individual records — there is nothing row-level to
share) may be used to:

- improve which spots and information the app highlights, and
- be shared as summary statistics with the Tromsø municipality (Tromsø kommune), for
  example to understand which viewing spots see the most interest and when. Any such
  sharing is limited to counts and never includes anything that could identify an
  individual, because no individual-level data exists in the first place.

## Third-party services this app talks to

To show a forecast, the app needs weather and space-weather data from two external,
publicly operated services:

- **MET Norway** (the Norwegian Meteorological Institute) — for weather forecasts.
- **NOAA** (the U.S. National Oceanic and Atmospheric Administration) — for planetary
  K-index (geomagnetic activity) data.

Depending on how the app is configured, these requests are made either:

- directly from your device to MET Norway and NOAA (in which case their own privacy
  policies govern that request), or
- from our own backend server on your behalf, which fetches the same public forecast data
  and passes it to the app (in which case your device does not contact MET Norway or NOAA
  directly for this purpose).

The app itself (this website/web build) is served to you by GitHub Pages (or another
static hosting provider), which, like any web host, processes requests to serve files; we
do not control or add any tracking on top of that hosting.

## Retention

The anonymous usage counters described above are aggregated to hour-level granularity
(never finer) and are retained for a maximum of 180 days (configurable via
`USAGE_RETENTION_DAYS`), after which older counts are pruned automatically.

## Your rights (GDPR)

Where the anonymous usage counters are collected, the legal basis is your consent (GDPR
Art. 6(1)(a)) — freely given, and revocable at any time as described above.

Because the counters are anonymous and contain no identifying information, we have no way
to link any stored count back to you individually. As a result, we cannot honor
individual access, correction, or erasure requests for this data, since there is nothing in
the data that identifies a specific person to look up or remove. If you have questions
about this policy or how the app handles data, contact:
[Operator name and contact — to be completed by the owner].

## Children

Because the app collects no data at all unless you explicitly opt in to anonymous, unlinkable
usage counts, no separate age-verification or parental-consent mechanism is in place.

## Changes to this policy

We may update this policy as the app changes. Material changes will be reflected here with
an updated "Last updated" date above.

## Language

This policy is currently published in English only. Translations will follow (the app's
own user interface is already available in multiple languages).
