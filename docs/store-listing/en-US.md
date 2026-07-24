# App Store listing — en-US (English)

## App name
**Aurora Tromsø**

Character count: 13 / 30.

Proposed as the store-listing name (leads with "Aurora" for search, fits comfortably under 30 chars). This differs from the app's current in-app/bundle display name ("Tromsø Northern Lights", see `app.json`'s `expo.name` and `settings.aboutAppName` in every locale catalog) — see `README.md`'s "App name / in-app branding mismatch" open item for the tradeoff and the owner decision this needs.

## Subtitle
**28 spots, live forecast**

Character count: 23 / 30.

## Promotional text
Live aurora forecast score, tonight's best viewing window, and 28 named Tromsø spots with getting-there details. Five languages. No accounts, no tracking.

Character count: 154 / 170. (Promotional text can be updated any time without a new binary submission — App Store Connect > App Store tab > this field is not versioned with the build.)

## Keywords
`northern lights,aurora borealis,norway,arctic,kp index,polar night,live camera,viewing spots,tonight`

Character count: 100 / 100. Comma-separated, no spaces after commas (spaces cost characters and Apple's keyword matching does not need them).

**Reasoning per term** (why each word/phrase is here, and why words already in the app name/subtitle are deliberately *not* repeated — Apple indexes name + subtitle + keywords together for search, so duplicating a word already present elsewhere wastes budget that could cover new ground):

- App name/subtitle already index "aurora", "tromsø"/"tromso", "spots", "live", and "forecast" (Apple's search algorithm weighs name+subtitle+keywords together, so repeating those words here would waste the 100-char budget).
- "northern lights" / "aurora borealis" — the two dominant English search phrases for this topic; "aurora" alone (already in the name) undershoots users who search the full phrase.
- "norway", "arctic" — geographic disambiguators; many aurora searches are generic ("northern lights app") without a city, so broader geography terms catch that traffic.
- "kp index" — a term aurora-chasers specifically search for and a real feature of the app (see `tonight.band.kpNow`/`kpPeak` in the catalog) — honest, not keyword-stuffed.
- "polar night" — matches the app's own honest handling of season timing (the polar-day/season-closed state); also a real search term for people planning an Arctic trip.
- "live camera" — a real, shipped feature (`liveCameras` screen) and a distinct search intent ("tromso sky cam") from "forecast" searches.
- "viewing spots" — the core noun phrase for the spot-comparison feature, distinct wording from "spots" (already in the subtitle) to add search surface rather than duplicate it.
- "tonight" — the app's own framing (`tonight.heroTitle` etc.) and a common time-boxed search modifier ("northern lights tonight tromso") called out explicitly in `docs/roadmap-2026-27.md`'s search-ads channel plan.

## Description
Character count: 2951 (~2500 targeted per the task brief; Apple's actual field limit is ~4000, so this has headroom). Benefit-led, no superlatives ("best", "amazing", etc. deliberately avoided per Apple's Guideline 2.3.1 and this app's own factual/warm tone — see `src/i18n/locales/en.json` for the in-app voice this matches).

```
Tromsø, Norway, sits inside the aurora oval — one of the more reliable places on Earth to see the northern lights between roughly September and April. Aurora Tromsø helps you decide where and when to go tonight, using live weather and geomagnetic data instead of guesswork.

TONIGHT'S OUTLOOK, AT A GLANCE
Open the app and see a single aurora score out of 100 for tonight, built from cloud cover, darkness, and the planetary Kp index (geomagnetic activity). The app highlights the best three-hour window to head out, and refreshes automatically through the evening.

28 NAMED VIEWING SPOTS AROUND TROMSØ
Compare 28 fixed viewing spots — fjords, lakes, and dark-sky pull-offs outside the city's light pollution — each with its own live score, its distance from the city center, and a short description. Many spots include practical getting-there details such as the nearest bus stop and parking area; where marked "verified," these details have been checked against information from Tromsø kommune. Sort the list by strongest forecast or by shortest drive, and open turn-by-turn navigation with one tap.

A MAP, LIVE SKY CAMERAS, AND AN AURORA FEED
See every spot on a map in driving order, check a grid of live sky cameras before you leave the house, and browse recent aurora frames from a university imaging feed (UiT / NO-SPACE) to judge current conditions for yourself.

HONEST ABOUT DAYLIGHT, TOO
Tromsø sits north of the Arctic Circle, so from roughly mid-May to late July the midnight sun keeps the sky bright all night — there is no realistic chance of seeing the aurora, whatever the Kp index reads. Rather than show a misleading score during that stretch, the app tells you plainly that aurora season is closed for now and gives you the approximate date it reopens.

FIVE LANGUAGES
The app is fully available in English, German, French, Spanish, and Chinese (Simplified), switchable at any time from Settings — useful if you're traveling and want the interface in your own language, or handing the phone to a friend.

PRIVACY BY DEFAULT
The app works fully without any account, login, or setup, and never asks for your GPS location — every "distance" shown is calculated from a spot's fixed coordinates, not from tracking you. If you choose to, you can opt in to sharing anonymous, aggregated counts (which spots people view or navigate to, bucketed by hour) so we and Tromsø kommune can see which spots are actually useful. Declining changes nothing about how the app works, and you can turn sharing on or off at any time in Settings. There are no third-party trackers or advertising SDKs in this app.

DATA SOURCES
Weather from MET Norway (the Norwegian Meteorological Institute) and geomagnetic activity from NOAA's Space Weather Prediction Center, refreshed regularly through the night.

Aurora Tromsø is built for one place and one purpose: a clear-eyed, honest answer to "should I go out and look tonight?" — nothing more, nothing less.
```

## What's New template
Use for every release's App Store Connect "What's New in This Version" field. Fill in the
bracketed part per release; keep the rest as a stable, low-effort template so release notes
don't become a chore that gets skipped.

```
This update refreshes tonight's forecast pipeline and viewing-spot details. See Settings > About for the data sources this build uses. Questions or spot corrections: use the support link on this page.
```
