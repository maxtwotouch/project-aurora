# Marketing channels: the landing page and link scheme

This is the "measure before spend" groundwork from `docs/roadmap-2026-27.md` Phase 2:
a single static landing page (`public/go.html`) that every QR code, ad, and outreach
link points at, with a per-channel `?src=` tag so we *could* measure conversion later
— before any marketing budget is actually spent.

`public/go.html` is served from the same GitHub Pages deploy as the app (Expo's web
export copies the repo's `public/` directory into `dist/` verbatim), so it needs no
separate hosting, build step, or deploy workflow change.

## Full landing URL pattern

```
https://<owner>.github.io/project-aurora/go.html?src=<channel>
```

Today that resolves to (owner/repo taken from the existing Pages deploy):

```
https://maxtwotouch.github.io/project-aurora/go.html?src=<channel>
```

The page reads `?src=` and appends it unchanged to the "Open the app" link
(`../?src=<channel>`), so the value is preserved end-to-end from
QR-code-or-ad -> landing page -> app URL. **No value is stored or transmitted by the
landing page itself in v1** — see the in-page HTML comment in `go.html` for exactly
where a future analytics snippet would go and what it would require.

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

When a new placement is added, pick a new slug following the same pattern
(`<context>-<medium>`, e.g. `airport-poster`, `hostel-front-desk`) and add it to this
table in the same PR that ships the placement, so the table never drifts out of sync
with what's actually printed/published.

## Generating a QR code per channel

No QR-generation tooling is checked into this repo (there's nothing to build — a QR
code is just an encoding of the URL string above). To produce one for a channel:

1. Build the URL: `https://maxtwotouch.github.io/project-aurora/go.html?src=hotel-qr`
   (substitute the channel's slug from the table above).
2. Generate the QR image with any standard QR tool, e.g.:
   - `qrencode -o hotel-qr.png "https://maxtwotouch.github.io/project-aurora/go.html?src=hotel-qr"`
     (the `qrencode` CLI, or any equivalent generator/website).
   - Prefer a generator that supports error-correction level M or higher and lets you
     export SVG/PNG at print resolution (physical QR placements, e.g. hotel table
     cards, need to scan reliably from arm's length in dim light).
3. Do not embed tracking beyond the `?src=` slug (no third-party shortener, no
   redirect chain) — the URL above is final and self-contained, consistent with the
   "no analytics in v1" design of `go.html`.

## Open owner decisions

These are explicitly left open per `CLAUDE.md`'s "state assumptions, don't guess
silently" guidance — flagging rather than deciding them:

- **Analytics/measurement provider.** `go.html` currently makes no network calls at
  all. Before any paid channel goes live, the owner needs to pick a cookieless,
  aggregate-only provider (e.g. something in the Plausible/Fathom mold — no
  cross-site identifiers, no PII) to attribute app opens by `src` channel. Adding
  *any* such snippet is privacy-sensitive per `CLAUDE.md`'s guardrails: it requires a
  `docs/privacy-usage-events.md`-style write-up of exactly what's collected and human
  review before merge — never an agentic merge.
- **Custom domain.** The URL pattern above uses the default
  `github.io/project-aurora/` path. A custom domain (e.g. something shorter for
  print/QR use) is a separate owner decision (registration, DNS, HTTPS, and whether
  GitHub Pages' custom-domain support is used or a redirect layer is added) and is out
  of scope here.

## Explicitly out of scope (this doc/PR)

Wiring the `src` channel value into the app's own analytics events
(`spot_view` / `navigate_pressed` / `spot_shared`, see `docs/privacy-usage-events.md`)
is **not** done here. That pipeline is consent-gated and privacy-sensitive by design;
attaching acquisition-channel data to it needs its own privacy review (does a channel
label become identifying when combined with other fields? does it need the same
opt-in gate?) rather than being bundled into a landing-page groundwork change. Flagged
as a follow-up for a human decision, not started.
