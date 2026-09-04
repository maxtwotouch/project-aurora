# Privacy Policy — Tromsø Northern Lights

_Last updated: 2026-09-04_

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

By default, this app collects **nothing** about you or your device. There are three,
entirely separate, optional data-collection choices, each off unless you say yes to it:
tourism insights (see "Tourism insights" below), a small anonymous usage counter (see
"Consent" below), and person-level product analytics (see "Person-level product analytics"
below). Saying yes to one never turns another on, and none of them are ever joined
together. There is also one optional feature, Trip Mode (see "Trip Mode" below), that uses
your location on your phone only — it is a feature, not a data-collection choice, and
nothing is sent because of it.

If you opt in to the anonymous usage counter, the app may send an anonymous event each time
you view a spot, tap "navigate" for a spot, or share a spot. Each event contains only:

- an event type (spot viewed, navigate tapped, or spot shared), and
- the id of the spot involved (one of the app's fixed, named viewing spots).

These events are aggregated immediately into counts grouped by spot and by hour — for
example, "spot X was viewed N times between 20:00 and 21:00 UTC." No individual event is
ever stored or retained; only the running counts exist. The same counters also hold the
tourism-insights events (presence, long presence, visit summary, recommendation outcome,
and coarse area) described under "Tourism insights" below — those are sent only if you
have separately said yes to tourism insights.

Specifically, and always, regardless of whether you opt in:

- **No accounts.** The app does not require sign-up or login, and has no concept of a user
  account.
- **No names or other identifying profile information** are ever collected.
- **No IP addresses** are stored or logged in connection with app usage.
- **No advertising identifiers (IDFA/GAID), device IDs, or push tokens used for tracking**
  are ever collected. The one exception to "no identifier of any kind" is the pseudonymous
  per-install identifier used by person-level product analytics, and only if you separately
  opt into that specific feature — see "Person-level product analytics" below for exactly
  what it is and is not.
- **No precise location ever leaves your device.** The app reads your position only in two
  situations: (a) while Trip Mode is running, to show you nearby spots on your phone, and
  (b) while the app is open, if you have said yes to tourism insights — and never in the
  background or while the app is closed. In both cases your precise location is processed
  entirely on your device: compared locally against fixed spot coordinates already stored in
  the app and — only outside those spots, away from the Tromsø town area, and only after
  dark — used to work out which coarse, roughly 5 km² map cell you're currently in. Your
  coordinates are never sent anywhere; see "Tourism insights" below for exactly what does
  leave your device if you have said yes to it, and "Trip Mode" below for why nothing leaves
  because of Trip Mode. Otherwise, the only "location" concept in the app's anonymous
  counters is which named, fixed viewing spot you interacted with — never coordinates, and
  never your own position.
- **No cookies are used by the app itself.**
- **No third-party trackers or advertising SDKs** are embedded in the app, other than the
  person-level analytics processor named in "Person-level product analytics" below, and
  only once you have separately opted into that specific feature.

## Product analytics: two separate pipelines

This app can collect usage information about you in two different ways. They are entirely
separate: turning one on never turns the other on, each is asked about separately, and they
are never joined together — an event sent to one pipeline is never combined, matched, or
cross-referenced with anything sent to the other.

1. **Aggregate usage counters** (this has been part of the app since launch — see "Consent"
   immediately below). Anonymous, immediately folded into hour-level counts, with no
   identifier of any kind attached, ever.
2. **Person-level product analytics** (new — see "Person-level product analytics" further
   below). A pseudonymous identifier generated for your specific app install, used to
   understand individual usage patterns like whether people come back to the app and where
   they tend to stop partway through common flows — something the aggregate counters above
   structurally cannot show, because they never distinguish one person's activity from
   another's.

Tourism insights (see "Tourism insights" below) feeds the first, identity-free pipeline
under its own separate opt-in, and is never joined with the second. Trip Mode (see "Trip
Mode" below) is a feature, not a pipeline: it sends nothing to either.

## Consent (aggregate usage counters)

The first time you open the app, you are asked whether you want to share anonymous usage
counts as described above (on a phone, this comes right after the tourism-insights question
— each is its own question with its own answer). Both choices are equally easy to make.

- If you decline, or simply close the prompt, **zero usage data is collected or sent** —
  nothing changes about how the app works.
- If you accept, only the anonymous, aggregated counts described above are ever sent.
- You can change your mind at any time using the "Anonymous usage sharing" toggle in
  Settings. Turning it off immediately stops any further collection.
- Your consent choice itself is stored only on your own device (not on any server), purely
  so the app remembers your preference between visits.

This consent choice covers the aggregate usage counters only. Person-level product
analytics is a separate opt-in, asked about separately, and answering this question one way
or the other has no effect on it — see the next section. The same is true of tourism
insights: it has its own question and its own toggle, and neither answer affects the other.

## Person-level product analytics (separate, optional, off by default)

**What this is.** With your separate, explicit consent — asked as its own question, never
bundled with the aggregate usage-counter question above — the app can send a small,
predefined set of named usage events to a third-party analytics processor, tagged with a
pseudonymous identifier generated for your specific app install. This is not your name,
email address, or any account identifier — the app has no accounts or login of any kind.
This lets us see things the aggregate counters above structurally cannot, such as how many
people who open the app for the first time come back again, or where in a common sequence
of screens people tend to stop.

**What exactly is collected — the full list, and nothing beyond it:**

- `app_open`
- `screen_view` (the name of the screen only — e.g. "Tonight" or "All Spots" — never what is
  displayed on it)
- `spot_view`
- `navigate_pressed`
- `spot_shared`
- `alerts_opt_in`
- `language_set`
- `trip_mode_toggled` (only that you started or ended a Trip Mode session — never your
  position, and never any of tourism insights' presence, visit, recommendation-outcome, or
  area-discovery events; those stay entirely within the identity-free pipeline described in
  "Tourism insights" below and are never sent here, under any circumstances)

Each event is tagged with the pseudonymous per-install identifier described above and a
timestamp. The app never sends any event type, screen name, or field beyond what is listed
here.

**Who processes it.** These events are sent to and processed by **PostHog**, specifically
PostHog's **EU Cloud service, hosted in Frankfurt, Germany**, under a data processing
agreement (DPA) signed between us and PostHog. Under that agreement PostHog acts as our data
processor (GDPR Art. 28): it processes this data only on our instructions, for the purpose
described below, and does not use it for its own separate purposes.

**Why we collect it.** To improve the app as a product — understanding retention (whether
people come back), funnels (where in a common flow people tend to drop off), and which
features actually get used — in ways the aggregate, identity-free counters above cannot
show. It is not used for advertising, and never will be without a fresh, separate consent
question and an update to this policy.

**What this never includes, under any circumstances:**

- your precise GPS coordinates, or any location data at all — this pipeline never receives
  location information of any kind; the only location-derived data the app ever sends is the
  coarse tourism-insights events described below, and those go to our own server only;
- advertising identifiers (IDFA/GAID) or anything capable of linking your activity in this
  app to your activity in a different company's app or website — this is product analytics,
  not ad tracking. Because none of that cross-app linking happens, Apple's App Tracking
  Transparency prompt is correctly not triggered by this feature;
- session replay or screen recording of any kind;
- autocapture. When this feature is switched on, it only ever sends the exact named events
  listed above — it does not automatically record every tap, scroll, or on-screen element
  the way some analytics tools do by default.

**Retention.** This data is retained by PostHog for **24 months**, after which it is
deleted. (The owner may adjust this retention window in the future; if that happens, this
section will be updated to match before the change takes effect.)

**Consent and withdrawal.** This question is asked separately from, and in addition to, the
aggregate usage-counter question above — your answer to one has no bearing on the other, in
either direction. You can change your mind at any time using the "Personal analytics"
toggle in Settings. Turning it off stops any further collection immediately, and also
triggers a request to PostHog to delete the data already associated with your pseudonymous
identifier. One honest caveat: deletion requests take some time to propagate through
PostHog's own systems — this is not instantaneous — so expect a short delay between
switching the toggle off and the underlying data actually being removed. We are not able to
promise an exact number of hours or days, only that the deletion request is made the moment
you turn the toggle off.

**Your rights over this data specifically.** Unlike the aggregate usage counters and
tourism insights' presence counters (see "Your rights (GDPR)" further below), this pipeline is linked
to a persistent identifier, so individual data-subject rights under GDPR genuinely apply and
can be honored here. You can request access to, or deletion of, the data tied to your
pseudonymous identifier via PostHog's person-level data APIs. To exercise this, contact us
using the details below and we will action the request through PostHog on your behalf. You
can also simply turn the Settings toggle off yourself at any time, which triggers deletion
as described above without needing to contact us at all.

**Contact for this section:** [Operator name and contact — to be completed by the owner].

## Tourism insights (optional, asked when you first open the app)

**What it is.** Tourism insights is an optional way to help us — and, as anonymous
statistics, Tromsø kommune — understand which northern-lights viewing spots and areas people
actually go to, and when. If you say yes, then while the app is open on your phone, your
device compares its own precise position — processed entirely **on your device** — against
the fixed coordinates of the app's named viewing spots, and, only when you are outside every
named spot and away from the Tromsø town area after dark, works out which coarse, roughly
5 km² map cell you are in. Only the small, spot- or area-level results described below ever
leave your phone.

**How you are asked.** The first time you open the app on an iPhone or Android phone, before
anything else, you see a short question — "Help improve tourism in Tromsø?" — with two
equally easy buttons: **Allow** and **Not now**. Not now is a genuine no: nothing is measured,
nothing is sent, and the app works exactly the same. If you tap Allow, your phone then shows
its own location-permission prompt; if you decline that, nothing is measured either. Your
answer is stored only on your own device (never on a server), so the app remembers it between
visits, and you can change it at any time with the "Tourism insights" toggle under "Privacy &
data" in Settings. This question is not asked in the web version of the app, and the web
version never collects any of this.

**When it runs.** Only while the app is open and on screen. It never runs in the background:
the moment you switch to another app or lock your phone, measurement stops. It never runs
while the app is closed. It does not depend on Trip Mode (see the next section) — it works
the same way whether or not Trip Mode is running.

**What leaves your device.** Four kinds of small, spot- or area-level events, and only while
tourism insights is on and the app is open:

- that your device is currently near one of the app's named viewing spots ("presence"), and
  that it stayed continuously near that same spot for 20 minutes or more ("long presence") —
  a spot identifier and the current UTC hour, nothing else;
- **a visit summary**, sent once a visit to a spot ends (you leave, you move straight to a
  different spot, or you switch away from the app while you're still there — in that last
  case it is sent only if tourism insights is still on): the spot identifier, the UTC hour
  you arrived, and which coarse duration bucket you stayed for — under 5 minutes, 5–15,
  15–30, 30–60, or 60-plus minutes — never the exact number of minutes;
- **which recommendation you acted on, if any**: when the app has shown you a recommended
  spot and you later arrive there, your device compares "shown" and "arrived" entirely on
  its own and sends only the outcome — the spot identifier, which recommendation it was, and
  the UTC hour. We never reconstruct your journey on our servers; this outcome event stands
  entirely on its own;
- **a coarse area event, only to help us find new viewing areas we don't already know
  about**: if your device dwells 15 minutes or more somewhere outside every named spot and
  away from the Tromsø town area, during dark hours only, it sends a single coarse map-cell
  identifier — roughly 5 km² in size, deliberately too large to pinpoint an address or a
  cabin — plus the UTC hour and a coarse duration bucket, and at most once per area per
  night no matter how long you stay.

Across all four: **no coordinates ever leave your phone** — only the derived spot or cell
identifier, the UTC hour, and (where noted) a coarse duration bucket described above. **None
of it is linked to you or to any identifier**, including linking these events to one
another — a visit event, a recommendation-outcome event, and an area event from the same
device are not connected on our server. And **all of it feeds only anonymous, aggregated
counters**, the same identity-free pipeline as the anonymous usage counters described
earlier in this policy: events are aggregated immediately into hourly counts per spot or per
area, and no individual event is ever stored.

**What never leaves your device, under any circumstances:**

- your precise GPS coordinates — only the derived spot identifier, area-cell identifier, UTC
  hour, and coarse duration bucket described above are ever sent, never a latitude/longitude;
- any route, path, or sequence of spots or areas you visited — each event stands alone; the
  app does not send anything that could be reassembled into where you went before or after,
  and the recommendation "shown vs. arrived" comparison described above happens entirely on
  your device, never on our servers;
- any device or account identifier that could link two events together, or that could link
  a visit, recommendation-outcome, or area event to each other or to anything else this app
  sends;
- whether Trip Mode was running — our server has no way of knowing, and no event says;
- anything at all while tourism insights is off, or while the app is in the background or
  closed — measurement runs only while the app is open on screen, never otherwise;
- a coarse area event for anywhere inside a named spot's radius, inside the Tromsø town
  area, or outside dark hours — those conditions are all checked on your device before
  anything is sent, never filtered out afterwards.
- The path your device's request travels to reach our server is designed and audited so
  that no IP address or other request-identifying information (request IDs, session IDs,
  device metadata) capable of linking events together is retained at any point along it —
  specifically so individual presence, visit, recommendation-outcome, or area events cannot
  be reassembled into a sequence after the fact.

**On anonymity.** We take a deliberately conservative position here, because a single event
like "near Grøtfjord at 22:00" is not automatically anonymous on its own — and the same is
true of a visit summary, a recommendation-outcome event, or a coarse area event — in
combination with other information it could, in principle, be identifying. So: individual
presence, visit, recommendation-outcome, and area events are all treated as personal data
while they are being sent and processed. Only once they have been aggregated into counts,
with sufficiently small counts suppressed, are the resulting statistics treated as anonymous
— and only for aggregates that actually meet that bar.

**Consent and withdrawal.** Tourism insights is off unless you tap Allow. Turning the
"Tourism insights" toggle off in Settings stops all further collection immediately, and any
events waiting on your phone to be sent are discarded rather than sent. Because the
aggregated counts contain no identifier of any kind, there is no individual record to look
up or delete on your behalf when you withdraw — put plainly, once your presence event has
been folded into an hourly count, we have no way to find "yours" within it to remove it,
because there was never anything in it that pointed back to you.

**If you answered an earlier "Trip mode" question.** An earlier version of this app asked,
in Settings, for a "Trip mode" consent covering this same kind of measurement — but only
while a Trip mode switch was on. This version measures whenever the app is open, which is a
wider window than you were asked about before. We do not carry your earlier answer over,
in either direction: the old answer is never read again, and everyone — including people who
said yes before — is asked the tourism-insights question once, the next time they open the
app.

**Retention.** Tourism insights' aggregated counts share the exact same retention rules as
the anonymous usage counters above (see "Retention" below) — there is no separate, longer,
or shorter retention period for this data.

**Sharing.** Whether, and in what form, tourism insights' aggregated counts might ever be
shared with Tromsø kommune — the way the usage counters described above may be — has not
been decided. If and when that decision is made, this policy will be updated before any
sharing begins.

## Trip Mode (a feature, not data collection)

Trip Mode is something you use, not something we collect. It is for the moment you are
actually heading out to look for the northern lights. You start it from a card on the
Tonight screen and end it when you are done.

**What it does.** While Trip Mode is running, the app uses your position **on your phone** to
show your area on a map with the viewing spots around you, the best spot near you right now
with its score and distance and a Navigate button, the other spots nearby, tonight's best
viewing window and conditions, and the spots you have stopped at during this trip. Starting
Trip Mode asks for your phone's location permission if the app doesn't already have it; if
you decline, Trip Mode can't show you nearby spots, and nothing else changes.

**Nothing is sent because of Trip Mode itself.** Your position is used on your device to
draw the map and work out distances, and is discarded. The list of spots visited during a
trip is kept only in your phone's memory while Trip Mode is running and is gone when you end
it or close the app. Our server is never told that Trip Mode is on, and no event says so.
(If you have separately opted into person-level product analytics, starting or ending Trip
Mode is recorded there as the `trip_mode_toggled` on/off event listed in that section —
that is the only trace, and it contains no location.)

**Trip Mode and tourism insights are independent.** If tourism insights is off, Trip Mode
still works fully and transmits nothing. If tourism insights is on, it continues to work
exactly the same way whether or not Trip Mode is running — Trip Mode neither starts, stops,
nor changes what it sends. In the web version, Trip Mode lists spots by distance without a
map.

## How we use this data

This section covers the aggregate, identity-free pipelines only (the anonymous usage
counters and tourism insights' presence counters). Aggregated, anonymous counts (never individual
records — there is nothing row-level to share) may be used to:

- improve which spots and information the app highlights, and
- be shared as summary statistics with the Tromsø municipality (Tromsø kommune), for
  example to understand which viewing spots see the most interest and when. Any such
  sharing is limited to counts and never includes anything that could identify an
  individual, because no individual-level data exists in the first place.

Person-level product analytics (see that section above) is used differently — to understand
individual usage patterns like retention and feature funnels, as described there — and is
never included in the aggregate sharing described here; see "Person-level product
analytics" above for how it is used, and note that person-level data is never sold or
shared with third parties, including Tromsø kommune.

## Third-party services this app talks to

To show a forecast, the app needs weather and space-weather data from two external,
publicly operated services:

- **MET Norway** (the Norwegian Meteorological Institute) — for weather forecasts.
- **NOAA** (the U.S. National Oceanic and Atmospheric Administration) — for planetary
  K-index (geomagnetic activity) data.
- **PostHog** — only if you have separately opted into person-level product analytics (see
  "Person-level product analytics" above for what is sent, and where it is processed).

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
`USAGE_RETENTION_DAYS`), after which older counts are pruned automatically. Tourism
insights' aggregated counts (see "Tourism insights" above) are retained under this exact
same policy — there is no separate retention period for them. Person-level product analytics has its own,
separate retention period — see "Retention" within "Person-level product analytics" above
(24 months) — because it is a different kind of data (linked to a persistent identifier)
processed by a different party (PostHog) under its own agreement.

## Your rights (GDPR)

Where the anonymous usage counters, or tourism insights' presence counters, are collected,
the legal basis for each is your consent (GDPR Art. 6(1)(a)) — freely given independently
for each, and revocable at any time as described above and in "Tourism insights" above.

Because the counters are aggregated and contain no identifying information, we have no way
to link any stored count back to you individually. As a result, we cannot honor
individual access, correction, or erasure requests for this data, since there is nothing in
the data that identifies a specific person to look up or remove. If you have questions
about this policy or how the app handles data, contact:
[Operator name and contact — to be completed by the owner].

This limitation does not apply to person-level product analytics: because that pipeline is
linked to a persistent identifier, individual access and erasure requests genuinely can be
honored for it — see "Your rights over this data specifically" within "Person-level product
analytics" above.

## Children

Because the app collects no data at all unless you explicitly opt in — to tourism
insights, separately to the anonymous, aggregated usage counters, or separately to
person-level product analytics — no separate age-verification or parental-consent mechanism
is in place.

## Changes to this policy

We may update this policy as the app changes. Material changes will be reflected here with
an updated "Last updated" date above.

## Language

This policy is currently published in English only. Translations will follow (the app's
own user interface is already available in multiple languages).
