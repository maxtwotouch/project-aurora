# Concept: sibling eats app for Tromsø

> Status: idea, owner-endorsed for documentation (2026-07-19). Not scheduled.
> Prerequisite artifact: `design-system/` (extracted from this app) makes the
> build cheap; this doc records the business thinking so it's versioned.

## Why a sibling, why eats

- Same tourist, same trip, same phone — acquisition spend, QR placements, and
  the kommune/Visit Tromsø relationships amortize across both apps.
- Restaurants are year-round paying customers; this fixes the aurora app's
  structural seasonality (users churn in a week, season is 7 months).
- The aurora app's "cloudy tonight" moment is literally the moment a tourist
  decides to go to dinner instead — a tasteful cross-handoff converts existing
  users twice.

## Revenue stack (in order of realism)

1. **Restaurant subscriptions (core).** Free basic listing for full coverage;
   paid tier (~500–1500 NOK/mo) for enhanced profile: menus, photos, booking
   link, self-service hours. The sales deck is the aggregate analytics — "412
   tourists viewed your profile, 89 tapped directions" — counts, never people,
   on the exact privacy architecture this repo already ships.
2. **Labeled featured placement.** One or two "featured this week" slots,
   visually distinct, honestly marked. The organic ranking stays incorruptible
   — same trust rule as the aurora app's scoring vs. tour referrals.
3. **Food-experience referrals.** Arctic-food tours, tastings, Sámi dining —
   commission per booking, same model as aurora-tour referrals, same
   high-intent tourist.
4. **Cross-promotion flywheel.** Aurora app ↔ eats app handoffs at the natural
   moments (bad-sky night → dinner; post-dinner → "sky is clearing").

## Explicitly avoided

- Consumer subscriptions (Google Maps is free; nobody pays for discovery).
- Ad networks (destroys the no-tracker posture — which is itself a selling
  point to European users and to restaurants tired of ad-tech).
- Delivery economics (capital-intensive, incumbent-owned, brutal margins).

## The hard part (differentiation)

Google/TripAdvisor exist. The wedge is the same one that works for aurora:
opinionated local curation, five languages, hand-made design — plus
tourist-specific dimensions the giants do badly:

- "Open late after aurora chasing"
- Reindeer / Sámi cuisine explained respectfully, in your language
- "Walkable from the cruise port" / no-car friendly
- Dietary needs navigable in de/fr/es/zh

Curation is labor and is the real ongoing cost — more than code.

## What carries over from this repo

- `design-system/` — identity, tokens, ArcGauge ("worth-the-trip" dial),
  DataBand, icon vocabulary, honesty-banner pattern.
- Privacy-first analytics architecture (consent-gated counters, suppression,
  retention) — becomes the B2B sales engine.
- i18n infrastructure and the five-language discipline.
- Backend patterns: resilient sources, snapshot store, deploy pipeline, CI.
- Marketing plumbing: landing/channel scheme, QR playbook.

## What gets re-derived per product

- The signature mark and accent semantics (e.g. copper could mean "busy right
  now"); icon vocabulary for food; the one signature screen moment.
- Data sources: manual curation + opening hours (no MET/NOAA equivalent —
  the curation pipeline IS the data source).

## Sequence & realism

Year 1: ship free with ~50 genuinely well-curated venues; collect a season of
aggregate foot-traffic data. Year 2: charge restaurants with numbers in hand.
Scale honestly assessed: solid side-business at Tromsø scale (low six figures
NOK/yr), venture-scale only if replicated across Arctic destination towns —
which the design system exists to make cheap.

## Decision log

- 2026-07-19: documented at owner request; no build commitment.
