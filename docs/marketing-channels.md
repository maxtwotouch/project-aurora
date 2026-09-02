# Marketing channels: the landing page and link scheme

This is the "measure before spend" groundwork from `docs/roadmap-2026-27.md` Phase 2:
a single static landing page that every QR code, ad, and outreach link points at,
with a per-channel `?src=` tag so we *could* measure conversion later — before any
marketing budget is actually spent.

**The canonical landing page moved to the site root.** `public/landing.html` (built
to `/` -- see "Root is the canonical landing" below) is now the single destination
every QR code, ad, and outreach link should point at. `public/go.html` still exists
and still works (see "The `/go` alias" below) purely so already-printed QR codes keep
resolving, but it is no longer where new links should point.

The whole static site (root landing + `/go` alias + `/privacy.html` + the `/app` web
preview) is served by the app's live deploy — **Cloudflare Pages, built from `main`**
(owner-managed hosting; earlier drafts of this doc assumed GitHub Pages, which is not
what's actually live — see "Custom domain" below), assembled by `npm run build:pages`
(see `docs/deploying.md`'s "Frontend: Cloudflare Pages" section for the exact
Cloudflare dashboard settings). No separate hosting, build step, or deploy workflow
beyond that one build command is required.

## Root is the canonical landing

```
https://aurora.hovding.dev/
```

is now the app's marketing landing page (built from `public/landing.html`): app name,
one-line pitch, a TestFlight/App Store button (placeholder link -- see the
`TESTFLIGHT_URL` comment in `public/landing.html`; owner must fill in the real public
beta/store link before this page is promoted in paid/printed channels), a secondary
"Open the web preview" link to `/app` (the Expo web export -- a browser preview, not
the primary distribution channel), and a privacy-policy link.

## Full landing URL pattern

Use this exact pattern for every new channel:

```
https://aurora.hovding.dev/?src=<channel>
```

The page reads `?src=` and appends it unchanged to the "Open the web preview" link
(`/app?src=<channel>`), so the value is preserved end-to-end from
QR-code-or-ad -> landing page -> web preview URL. **No value is stored or transmitted
by the landing page itself in v1** — see the in-page HTML comment in
`public/landing.html` for exactly where a future analytics snippet would go and what
it would require. This is the exact same mechanism `go.html` used before this page
existed — only the forwarding target changed (`/app` instead of the old relative
`../`).

## The `/go` alias (legacy QR codes only)

```
https://aurora.hovding.dev/go?src=<channel>
```

`public/go.html` is kept working, at this exact path, because QR codes already
printed against this pattern (hotel table cards, tourist-info materials, etc.) cannot
be reprinted on demand. It no longer duplicates the landing content: it is now a thin
redirect to `/` that preserves the full query string (`?src=<channel>` survives the
hop unchanged), via both a `<meta http-equiv="refresh">` (works without JavaScript,
though it can't preserve the query string on its own -- see the in-page comment) and
an immediate JS redirect (the one that actually preserves `?src=`, and takes priority
whenever JavaScript is available).

**Do not use `/go` for any new channel or printed material going forward** — use the
root URL pattern above instead. `/go` exists solely for backward compatibility with
what's already in circulation.

One consequence worth knowing when printing/embedding a URL: Cloudflare Pages serves
**pretty URLs**, so `go.html` is reachable at the extensionless path `/go`. Requesting
`/go.html` directly still works too (both resolve to the same static file).

## Channel tags (`?src=` values)

Use short, stable, lowercase, hyphenated slugs — one per physical/digital placement so
each can be judged independently later. Suggested starting set (extend as new channels
are added; keep this list as the source of truth for which slugs exist):

| `src=` value | Channel |
|---|---|
| `hotel-qr` | QR codes placed in partner hotels/hostels |
| `tourist-info` | Tromsø tourist information office materials |
| `search` | Geo-fenced search ads ("northern lights tromsø tonight" family) |
| `social` | Meta/TikTok geo+interest campaigns |
| `listicle` | Blogger/listicle outreach ("best aurora apps") |
| `share` | In-app "send tonight to a friend" share action (ShareButton, `src/share/shareMessage.ts`) |

When a new placement is added, pick a new slug following the same pattern
(`<context>-<medium>`, e.g. `airport-poster`, `hostel-front-desk`) and add it to this
table in the same PR that ships the placement, so the table never drifts out of sync
with what's actually printed/published.

## Generating a QR code per channel

No QR-generation tooling is checked into this repo (there's nothing to build — a QR
code is just an encoding of the URL string above). To produce one for a channel:

1. Build the URL: `https://aurora.hovding.dev/?src=hotel-qr`
   (substitute the channel's slug from the table above; use the root `/` pattern, not
   `/go`, for anything newly printed/published — see "The `/go` alias" above).
2. Generate the QR image with any standard QR tool, e.g.:
   - `qrencode -o hotel-qr.png "https://aurora.hovding.dev/?src=hotel-qr"`
     (the `qrencode` CLI, or any equivalent generator/website).
   - Prefer a generator that supports error-correction level M or higher and lets you
     export SVG/PNG at print resolution (physical QR placements, e.g. hotel table
     cards, need to scan reliably from arm's length in dim light).
3. Do not embed tracking beyond the `?src=` slug (no third-party shortener, no
   redirect chain) — the URL above is final and self-contained, consistent with the
   "no analytics in v1" design of `public/landing.html`.

## Open owner decisions

These are explicitly left open per `CLAUDE.md`'s "state assumptions, don't guess
silently" guidance — flagging rather than deciding them:

- **Analytics/measurement provider.** The landing page (`public/landing.html`,
  `public/go.html`) currently makes no network calls at all. Before any paid channel
  goes live, the owner needs to pick a cookieless, aggregate-only provider (e.g.
  something in the Plausible/Fathom mold — no cross-site identifiers, no PII) to
  attribute app opens by `src` channel. Adding *any* such snippet is privacy-sensitive
  per `CLAUDE.md`'s guardrails: it requires a `docs/privacy-usage-events.md`-style
  write-up of exactly what's collected and human review before merge — never an
  agentic merge.
- **Custom domain.** Already resolved, correcting an earlier assumption in this doc:
  the app is live on Cloudflare Pages under the custom domain `aurora.hovding.dev`
  (built from `main`, owner-managed), not GitHub Pages under a `github.io` path. No
  further decision needed here — the "Full landing URL pattern" above reflects the
  real, live-verified URL.
- **Public TestFlight/App Store link.** The landing page's primary CTA
  (`public/landing.html`, `TESTFLIGHT_URL`) is currently a placeholder — this app has
  no public beta/store listing yet (see `README.md`'s "Ship To TestFlight Beta",
  which documents building a beta, not a public invite link). The owner needs to
  either publish a public TestFlight invite link or wait for an App Store listing,
  then fill in the real URL before this page is promoted in paid/printed channels.

## Explicitly out of scope (this doc/PR)

Wiring the `src` channel value into the app's own analytics events
(`spot_view` / `navigate_pressed` / `spot_shared`, see `docs/privacy-usage-events.md`)
is **not** done here. That pipeline is consent-gated and privacy-sensitive by design;
attaching acquisition-channel data to it needs its own privacy review (does a channel
label become identifying when combined with other fields? does it need the same
opt-in gate?) rather than being bundled into a landing-page groundwork change. Flagged
as a follow-up for a human decision, not started.
