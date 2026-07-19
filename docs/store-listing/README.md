# App Store listing package

This directory is a complete draft of the App Store Connect listing for Aurora Tromsø
(current in-app/bundle name: "Tromsø Northern Lights", see `app.json`), so submission can
happen the same day the owner's outstanding items (below) are done. Nothing here has been
submitted; everything is a draft for the owner to review, correct, and paste in.

Source material used to write this package: `CLAUDE.md`, `docs/prelaunch-checklist.md`,
`docs/roadmap-2026-27.md`, `docs/marketing-channels.md`, `docs/privacy-policy.md`,
`docs/privacy-usage-events.md`, `docs/privacy-push-alerts.md`, the five `src/i18n/locales/*.json`
catalogs (for terminology/tone), `src/data/spots.json`, `app.json`/`eas.json`, and the actual
consent/analytics/preview-mode source (`src/analytics/`, `src/preview/`, `src/i18n/`).

## What's in this directory

```
docs/store-listing/
  README.md                 - this file
  app-privacy-answers.md     - Apple's App Privacy questionnaire, answered line by line
  en-US.md, de-DE.md, fr-FR.md, es-ES.md, zh-Hans.md
                              - per-locale App Store Connect copy (name, subtitle,
                                promotional text, description, keywords, What's New)
  screenshots/
    en/ de/ fr/ es/ zh/       - 1290x2796 screenshots, 4 per locale (see "Screenshots" below)
```

## Where each piece of copy goes in App Store Connect

App Store Connect > My Apps > [this app] > App Store tab > (select a version, then a
localization on the left):

| App Store Connect field | Source in this package | Char limit |
|---|---|---|
| App name | `<locale>.md` "App name" | 30 |
| Subtitle | `<locale>.md` "Subtitle" | 30 |
| Promotional text | `<locale>.md` "Promotional text" | 170 |
| Description | `<locale>.md` "Description" | ~4000 (Apple's real cap); ~2500 targeted here |
| Keywords | `<locale>.md` "Keywords" | 100, comma-separated |
| What's New (release notes) | `<locale>.md` "What's New template" | 4000, but keep it short |
| Screenshots (6.7" display, required) | `screenshots/<locale>/*.png` | see "Screenshots" |
| Support URL | owner-provided, see below | — |
| Marketing URL | optional, not drafted here (no marketing site beyond `public/go.html`, see `docs/marketing-channels.md`) | — |
| Privacy Policy URL | owner-provided, see below | — |
| App Privacy questionnaire (the "nutrition label") | `app-privacy-answers.md`, answer-by-answer | — |
| Copyright | owner (e.g. "2026 [operator/legal name]") | — |
| Age rating questionnaire | not drafted here — no user-generated content, no mature content; expect 4+ | — |

App name and subtitle are per-*localization* in App Store Connect (5 localizations here:
en-US, de-DE, fr-FR, es-ES, zh-Hans), each with its own 30-char limit — they are not shared
across locales.

## What the owner still needs to add (not in this repo/package)

1. **Support URL.** Per the task brief, `aurora.hovding.dev` is confirmed working — use
   `https://aurora.hovding.dev` (or a specific `/support` path if one gets built later; a
   bare working URL is sufficient for App Store Connect). Not yet present in-repo as a
   constant anywhere (only `PRIVACY_POLICY_URL` is, in `src/constants/legal.ts`) — the
   owner should confirm this exact URL when filling in App Store Connect.
2. **Privacy Policy URL.** `https://aurora.hovding.dev/privacy.html` — already the
   canonical URL in code (`src/constants/legal.ts`'s `PRIVACY_POLICY_URL`), sourced from
   `docs/privacy-policy.md` / `public/privacy.html`. Confirm `public/privacy.html` is
   actually deployed at that path before submitting (per `docs/roadmap-2026-27.md` Phase
   0.5, this was still an owner-approval item as of this writing).
3. **Operator/legal name and contact.** `docs/privacy-policy.md` has two
   `[Operator name and contact — to be completed by the owner]` placeholders. These need
   to be filled in `public/privacy.html` (and the repo doc, kept in sync per that file's
   own instruction) before the Privacy Policy URL is submitted — Apple reviewers do open
   the privacy policy link and check it says who operates the app.
4. **"Last updated" date** in `docs/privacy-policy.md` / `public/privacy.html` (currently
   a placeholder) — set at actual publication.
5. **App Privacy questionnaire answers** — drafted in full in `app-privacy-answers.md`;
   the owner (or whoever has App Store Connect access) still has to click through the
   actual questionnaire UI and enter them, since this is a UI flow, not a file upload.
6. **Copyright string** and **age rating questionnaire** (see table above) — not
   privacy-sensitive, just quick owner/App-Store-Connect-UI items not drafted here.
7. **App icon and splash** — per `docs/prelaunch-checklist.md`, these are still
   placeholders (`assets/icon.png` etc.) as of this writing. App Store Connect also wants
   a separate 1024x1024 App Store icon (no alpha channel) — not produced by this task.
8. **Final, real-data screenshots** — see "Screenshots — open item" below. This is the
   single most important open item in this package.
9. **Native-speaker review of the de/fr/es/zh copy** in this package (translations here
   are agent-drafted from the app's existing i18n catalogs and general knowledge, not
   professionally translated) — this is explicitly called out as a Phase 1 gate in
   `docs/roadmap-2026-27.md` ("Native-speaker review of consent copy + store copy
   (de/fr/es/zh) — legal and quality gate before paid traffic"). Do not submit the
   non-English locales as-is without that review.
10. **App name / in-app branding mismatch — explicit decision needed.** This package
    proposes "Aurora Tromsø" (and per-locale equivalents) as the *store listing* name,
    chosen for App Store search (leads with "Aurora", matches how people actually search)
    and to fit the 30-char field comfortably. The app's own bundle/display name
    (`app.json`'s `expo.name`) and in-app "About" text
    (`settings.aboutAppName` in every `src/i18n/locales/*.json`) are currently
    **"Tromsø Northern Lights"** — a different string. Apple does not require these to
    match, but a mismatch between what a user searched for/tapped in the store and what
    they see under the home-screen icon and in Settings > About can read as sloppy. Two
    options, both left to the owner: (a) keep the store name "Aurora Tromsø" and separately
    update `app.json`/the i18n catalogs' `aboutAppName` to match in a follow-up PR, or
    (b) use "Tromsø Northern Lights" as the store name too (it fits: 22 chars) and drop the
    "Aurora Tromsø" branding from this package. This package assumes (a) is likely
    preferred (shorter, keyword-led) but does **not** silently change `app.json` or the
    i18n catalogs — that's a product-branding decision, not a docs-only one, and out of
    this task's scope (docs/store-listing/ + screenshots only).

## App Privacy questionnaire — summary

Full line-by-line mapping (with file references) is in `app-privacy-answers.md`. Summary:

- **Data collected: only "Product Interaction" (analytics-style usage counts), and only
  if the user opts in.** Everything else in Apple's category list is answered "Not
  Collected."
- **Purpose:** App Functionality / Analytics (understanding which viewing spots are
  useful — including sharing aggregate counts with Tromsø kommune per
  `docs/privacy-usage-events.md`).
- **Linked to identity: No.** There is no account, login, device ID, or any identifier
  in the schema (`{ type, spotId }` only — see `src/analytics/events.ts` /
  `backend/src/events.ts`).
- **Used for tracking (Apple's ATT definition — linking data across apps/websites owned
  by other companies, or for third-party advertising): No.** No third-party SDKs, no ad
  network, no cross-app/cross-site linkage of any kind.
- **Location: Not Collected.** The app never requests device/GPS location (no
  `expo-location` dependency, no permission prompt anywhere in `src/`) — every displayed
  "distance" is computed from the fixed spot coordinates in `src/data/spots.json` against
  a fixed reference point, not from the user's device.
- **Identifiers, Contact Info, User Content, Browsing/Search History, Financial Info,
  Health/Fitness, Diagnostics, Purchases, Sensitive Info: Not Collected.**
- This maps precisely to what `docs/privacy-policy.md` and `docs/privacy-usage-events.md`
  already describe — the questionnaire answers are the same claims Apple's nutrition
  label expects, not a new set of promises.

**Overclaiming vs. underclaiming, both flagged as rejection risks (per the task brief):**
see `app-privacy-answers.md`'s "Why not X" notes on each answer — e.g. why this is *not*
"Data Not Linked to You" broadly (it IS collected, just not linked — Apple's category is
"Data Used to Track You: No" + "Data Linked to You: No" + the actual data type
"Usage Data" declared, not "no data collected at all", which would underclaim and
misrepresent the opt-in analytics that do exist).

## Screenshots

### How they were generated (backend-mode web build)

```bash
# 1. Backend, isolated port, CORS opened for the export's dev-serve origin
cd backend
PORT=4990 CORS_ORIGINS=http://127.0.0.1:4164 npm run dev &

# 2. Web export pointed at that backend
cd ..
EXPO_PUBLIC_USE_BACKEND=true EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4990 \
  npx expo export --platform web

# 3. Serve the export
npx serve dist -l 4164 &

# 4. Playwright (chromium), proxy bypassed for loopback per this environment's networking
#    (see the repo-root scratchpad script used to drive this — not checked into the repo)
NO_PROXY='<-loopback>,localhost,127.0.0.1' node capture-screenshots.mjs
```

Per screen, per language:

1. Set `localStorage['aurora.designPreviewMode.v1'] = 'on'` (see
   `src/preview/previewMode.ts`) so the open-season sample forecast renders instead of
   live/off-season data.
2. Set `localStorage['aurora.language.v1']` to the target language code (`en`/`de`/`fr`/
   `es`/`zh`, see `src/i18n/languages.ts` and the `STORAGE_KEY` in `src/i18n/index.ts`),
   then reload — `loadPersistedLanguage()` applies it on next app load.
3. Reload so the consent modal (`src/components/ConsentModal.tsx`) renders in that
   language, and click "No thanks" / the decline button (declining consent first, per the
   task brief — this also means these screenshots are captured in the same state a
   privacy-conscious reviewer or user would see).
4. Navigate: Tonight (hero + gauge) -> Spots ("All spots" tab) -> a spot detail (open the
   first ranked spot) -> Settings (gear icon in the header).
5. Screenshot each at a 430x932 CSS viewport with `deviceScaleFactor: 3`, which Chromium
   renders as a 1290x2796 pixel PNG — Apple's iPhone 6.7" display requirement.

### Open item — screenshots must be retaken before final submission

**The captured screenshots show the "Sample data — not a real forecast" banner**
(`preview.banner` in every `src/i18n/locales/*.json`), because design-preview mode is the
only way to render the open-season UI (full score gauge, ranked spots, best-window
highlight, etc.) outside of the actual aurora season (September-April) — and today's date
is mid-July, deep in the "aurora season is closed" polar-day period per
`src/components/` season-state handling. Capturing without design-preview mode right now
would produce screenshots of the polar-day "too bright for aurora" state instead, which is
accurate today but not representative of what the app looks like for the ~8 months a year
it matters, and isn't useful for App Store marketing either.

Per the task brief's explicit honesty rule: **do not** crop, hide, or otherwise edit out
the sample-data banner programmatically — that would make the screenshots misleadingly
look like a real forecast, which is exactly the kind of thing Apple's Guideline 2.3.1
("Accurate Metadata") and 2.3.3 ("initial download... representative of your app...
in-app screenshots") exist to catch, and would also just be dishonest.

**Action required before final submission (do not skip):** retake this entire screenshot
set — same 5 languages x 4 screens x 1290x2796 — either (a) once the aurora season reopens
(per the in-app copy, mid-August at the earliest; confirm against the live app's actual
polar-day cutoff) and the app is showing a real, live forecast, or (b) from a real device
running a release build, whichever comes first relative to the submission date. This is
called out again in `docs/prelaunch-checklist.md`'s "Ship a privacy policy, support
contact, screenshots, store copy" line — the checklist item is not satisfied by this
preview-mode set alone.

### Dimension verification

Every one of the 20 files under `screenshots/<locale>/*.png`
(`01-tonight.png`, `02-spots.png`, `03-spot-detail.png`, `04-settings.png`, x5 locales) was
measured programmatically after capture (Pillow `Image.open(...).size` on each file) and
confirmed to be exactly **1290 x 2796** pixels, with no exceptions. 1290x2796 is Apple's
required pixel size for the "6.7-inch" iPhone display screenshot set (App Store Connect's
largest/primary iPhone size bucket as of this writing); a 430x932 CSS viewport at
`deviceScaleFactor: 3` produces exactly that (430*3 = 1290, 932*3 = 2796), which is what the
capture script used.

## Definition of done for this package specifically

This is a docs-only change (`docs/store-listing/` + `docs/store-listing/screenshots/`).
It does not touch `backend/`, app code, or CI, so the repo-wide `npm run typecheck` /
`backend && npm run typecheck` / `npm run test:kp` / `backend && npm run build` checks from
`CLAUDE.md` are not applicable to this change; they were not touched and remain green. What
*was* verified for this package specifically:

- `git status` shows changes confined to `docs/store-listing/`.
- Every screenshot file is exactly 1290x2796 pixels (see above).
- All character counts stated per field in each `<locale>.md` were computed programmatically
  against the exact string committed (not hand-counted) — see the per-file "Character count"
  callouts.
