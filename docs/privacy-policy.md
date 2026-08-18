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

By default, this app collects **nothing** about you or your device. There are two, entirely
separate, optional data-collection features, each off unless you explicitly turn it on: a
small anonymous usage counter (see "Consent" below), and Trip mode (see "Trip mode" below).
Turning one on never turns the other on.

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
- **No precise location is ever collected — including by Trip mode.** Unless you opt into
  Trip mode, the app does not request or read your GPS coordinates at all. If you do opt
  into Trip mode, your device's precise location is used, but only to compare it locally
  against fixed spot coordinates already stored in the app — it is processed entirely on
  your device and is never sent anywhere; see "Trip mode" below for exactly what does leave
  your device in that case. Outside of Trip mode, the only "location" concept in the app's
  anonymous counters is which named, fixed viewing spot you interacted with — never
  coordinates, and never your own position.
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

## Trip mode (separate, optional, off by default)

Trip mode is a **second, independent** opt-in from the anonymous usage counter described
above. It is designed for the moment you are actually heading out to look for the northern
lights, and is switched on with its own separate toggle in Settings — never bundled with,
inferred from, or turned on by your usage-sharing choice, and never shown as a first-open
prompt.

**Note:** Trip mode is not yet available in this version of the app. This section describes
it in advance, before any of its collection code exists, so this policy is accurate the
moment it does ship.

**What it is.** While Trip mode is switched on, and only while the app is open and in the
foreground (never in the background), your phone compares your device's precise location —
processed entirely **on your device** — against the fixed coordinates of the app's named
viewing spots, so it can show you an "arrived at this spot" card with tonight's score and
best viewing window for that spot.

**What leaves your device.** Only two kinds of small presence events, and only while Trip
mode is on:

- that your device is currently near one of the app's named viewing spots ("presence"), and
- that your device stayed continuously near that same spot for 20 minutes or more ("long
  presence").

Each event contains only a spot identifier and the current UTC hour — nothing else. These
are aggregated immediately into hourly counts per spot, the same way the anonymous usage
counters above are, and no individual event is ever stored.

**What never leaves your device, under any circumstances:**

- your precise GPS coordinates — only the fact that you're near a named spot is ever sent,
  never a latitude/longitude;
- any route, path, or sequence of spots you visited — each event stands alone; the app does
  not send anything that could be reassembled into where you went before or after;
- any device or account identifier that could link two events together;
- anything at all while Trip mode is off, or while the app is backgrounded or closed — Trip
  mode never runs, and never collects anything, outside the app being open in the
  foreground.
- Before Trip mode launches, the path your device's request travels to reach our server is
  designed and audited so that no IP address or other request-identifying information
  (request IDs, session IDs, device metadata) capable of linking events together is
  retained at any point along it — specifically so individual presence events cannot be
  reassembled into a sequence after the fact.

**On anonymity.** We take a deliberately conservative position here, because a single event
like "near Grøtfjord at 22:00" is not automatically anonymous on its own — in combination
with other information it could, in principle, be identifying. So: individual presence
events are treated as personal data while they are being sent and processed. Only once they
have been aggregated into counts, with sufficiently small counts suppressed, are the
resulting statistics treated as anonymous — and only for aggregates that actually meet that
bar.

**Consent and withdrawal.** Trip mode is off by default. Turning its Settings toggle off
stops all further collection immediately. Because the aggregated counts contain no
identifier of any kind, there is no individual record to look up or delete on your behalf
when you withdraw — put plainly, once your presence event has been folded into an hourly
count, we have no way to find "yours" within it to remove it, because there was never
anything in it that pointed back to you.

**Retention.** Trip mode's aggregated counts share the exact same retention rules as the
anonymous usage counters above (see "Retention" below) — there is no separate, longer, or
shorter retention period for Trip mode data.

**Sharing.** Whether, and in what form, Trip mode's aggregated counts might ever be shared
with Tromsø kommune — the way the usage counters described above may be — has not been
decided. If and when that decision is made, this policy will be updated before any sharing
begins.

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
`USAGE_RETENTION_DAYS`), after which older counts are pruned automatically. Trip mode's
aggregated counts (see "Trip mode" above) are retained under this exact same policy — there
is no separate retention period for Trip mode.

## Your rights (GDPR)

Where the anonymous usage counters, or Trip mode's presence counters, are collected, the
legal basis for each is your consent (GDPR Art. 6(1)(a)) — freely given independently for
each feature, and revocable at any time as described above and in "Trip mode" above.

Because the counters are aggregated and contain no identifying information, we have no way
to link any stored count back to you individually. As a result, we cannot honor
individual access, correction, or erasure requests for this data, since there is nothing in
the data that identifies a specific person to look up or remove. If you have questions
about this policy or how the app handles data, contact:
[Operator name and contact — to be completed by the owner].

## Children

Because the app collects no data at all unless you explicitly opt in — either to the
anonymous, aggregated usage counters, or separately to Trip mode — no separate
age-verification or parental-consent mechanism is in place.

## Changes to this policy

We may update this policy as the app changes. Material changes will be reflected here with
an updated "Last updated" date above.

## Language

This policy is currently published in English only. Translations will follow (the app's
own user interface is already available in multiple languages).
