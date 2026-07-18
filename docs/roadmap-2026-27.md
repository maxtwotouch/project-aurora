# Roadmap: Aurora season 2026–27

> Owner-approved direction (2026-07-16): **Tromsø aurora only** — no multi-city, no
> year-round pivot this cycle. **Success metric: user traction by April 2027** —
> thousands of real seasonal users and strong ratings. Marketing budget goes to
> acquisition. Expansion decided in the April retro, with data.

## Where we are (July 2026)

Codebase is launch-ready: 28 kommune-verified spots, refreshed design, five
languages (en/de/fr/es/zh), consent-gated anonymous analytics, resilient tested
backend (89 backend + 60 frontend tests), CI on every PR, Docker image, armed
deploy workflows (Fly backend + GitHub Pages web). What's missing is entirely
operational: hosting activation, device testing, store presence, and the
marketing machine.

## Phase 0 — Go live (now → early August)

Goal: the full stack is running in production and installable by us.

| # | Item | Who |
|---|------|-----|
| 0.1 | Enable GitHub Pages (Settings → Pages → GitHub Actions) → public web app | Owner (1 click) |
| 0.2 | Fly.io account + `FLY_API_TOKEN` secret → backend live; set `ADMIN_TOKEN` | Owner (~15 min) |
| 0.3 | Point a web build at the live backend (backend-mode Pages build or second env) | Agent |
| 0.4 | Uptime monitoring on `/v1/health` (free tier checker) + alert to owner email | Owner acct, agent config |
| 0.5 | Privacy policy page (drafted from docs/privacy-usage-events.md) — required by app stores | Agent drafts, owner approves |
| 0.6 | First `eas build` (iOS beta profile) on a real iPhone; fix what device testing surfaces | Owner device, agent fixes |

## Phase 1 — Store-ready (August → mid-September)

Goal: approved on TestFlight/App Store (and Play if decided) before the season.

- **App icon + splash** (placeholders today). Needs a real design pass — owner
  decision: designer vs. iterating with the agent.
- Store listing: screenshots (from the live app, all 5 languages), store copy,
  keywords (ASO for "northern lights Tromsø" family).
- **Native-speaker review** of consent copy + store copy (de/fr/es/zh) — legal
  and quality gate before paid traffic.
- TestFlight beta with a small cohort (locals, early tourists, friends).
- Android go/no-go decision (prelaunch checklist item) — recommend yes if
  budget allows; large share of European tourists carry Android.

## Phase 2 — Season launch & acquisition (mid-September → December)

Goal: turn on the funnel as darkness returns.

**Product levers for traction (agent-buildable, in priority order):**
1. **Aurora alerts (push notifications)** — the single biggest retention/traction
   feature: opt-in "tonight looks good" push when the score crosses a threshold.
   Privacy-first design required (anonymous topic subscription, no tokens tied to
   identity in our storage). Backend trigger exists conceptually (score pipeline);
   needs expo-notifications + a send path. **This is the flagship Phase-2 build.**
2. **Share feature** — share tonight's forecast/spot card (image + link). Wires the
   already-reserved `spot_shared` event. Organic growth loop.
3. Offline/low-connectivity hardening (tourists on roaming): cache last snapshot,
   degrade gracefully (partially exists via backend staleness — extend to client).
4. Ratings prompt at the "moment of delight" (after a high-score night).

**Marketing levers (budget deployment, from the agreed channel strategy):**
- Landing page + per-channel QR/UTM links + cookieless aggregate analytics
  (Plausible-style) — build BEFORE spending; no attribution, no spend.
- Geo-fenced search ads ("northern lights tromsø tonight" family) → web app.
- Hotel/hostel/tourist-info print+QR placements (highest trust, lowest cost).
- Listicle/blogger outreach ("best aurora apps") for planning-phase reach.
- Meta/TikTok geo+interest campaigns from late September.
- **Visit Tromsø / kommune pitch** with early aggregate stats as the door-opener
  (decide `STATS_MIN_CELL` + complementary suppression before sharing data).

## Phase 3 — Optimize (January → April)

- Weekly KPI review; kill underperforming channels, double down on winners.
- Iterate on data: which spots get viewed vs. navigated, drop-off points,
  language mix (informs where marketing spend goes).
- App Store rating push; respond to reviews.
- Prepare the April decision memo: expansion (multi-city vs. year-round) with
  real numbers.

## KPIs (all privacy-compatible)

- Weekly active users during season (store analytics + web aggregate)
- Consented `spot_view` / `navigate_pressed` volumes and per-spot distribution
- Web → install conversion per channel (UTM-tagged landing links)
- Store rating ≥ 4.5; crash-free rate
- Uptime of `/v1/tonight` ≥ 99.5% during season

## Standing guardrails

Everything ships through the existing pipeline (worktree → review → CI → PR;
privacy-sensitive paths always owner-reviewed, never agent-merged). No PII, ever.
Alerts and sharing must go through the same privacy review as the events work.

## Decision log

- 2026-07-16: Scope = Tromsø aurora only; season goal = user traction. (Owner)
- Open: Android launch; icon/splash design route; STATS_MIN_CELL threshold;
  hosting region redundancy; push-alert privacy design sign-off.
