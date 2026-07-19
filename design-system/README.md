# Aurora design system

This folder is the portable design language behind the Tromsø aurora app,
distilled so a **new, unrelated app** can start from it. It is written for
whoever opens a blank repo next — a designer or developer starting, say, a
"places to eat in Tromsø" app — not for someone already fluent in this
codebase.

If you only read one section, read [Identity](#identity) and
[Starting a sibling app](#starting-a-sibling-app).

## Identity

**"Field instrument × Nordic travel editorial."**

Concretely, that means every screen is trying to do two things at once,
and neither one alone:

- **Field instrument**: this is a tool someone uses standing outside, in
  the cold, deciding something real ("should I go out right now"). It
  should read like an honest gauge, not a marketing surface — one clear
  number, one clear recommendation, minimal chrome. Borrow from analog
  instrumentation (a dial, a sweep, tabular numerals for a reading that
  might change) rather than from dashboard software.
- **Nordic travel editorial**: this is also a magazine, not a spreadsheet.
  Display type gets to be a serif with personality (Fraunces). Photography
  gets a scrim and a caption, not a thumbnail-in-a-card. Layouts get
  asymmetry and a real hierarchy, not a uniform grid.

Neither half survives alone: pure "field instrument" drifts into a cold
data-dump; pure "editorial" drifts into decoration that hides the one
number a cold, standing-outside user actually needs. Every design decision
in this system is a negotiation between the two.

### The anti-AI-generic rules that shaped it

These aren't abstract taste — they're specific things this app used to do,
or a first draft would obviously do, that were deliberately designed out:

- **No gradient soup.** One SVG gradient exists in the whole app (the photo
  hero's bottom scrim, `SpotHeroImage.tsx` — see
  `components/README.md`), used for a real legibility reason (text over an
  unpredictable photo), not for "impact" on a metric or heading. No
  gradient text, ever.
- **No emoji icons.** Every icon is a hand-drawn, 1.7px-stroke SVG that
  depicts this app's own subject (a fjord peak, a moon over an aurora
  band) — see [Iconography](#iconography). Ionicons/emoji-style glyphs were
  present in an earlier pass and were replaced one at a time; the
  `MidnightSunIcon` doc comment is explicit about this ("replaces the
  previous Ionicons 'partly-sunny' glyph... closer to text than to this
  app's own iconography").
- **No uniform card grids.** The Tonight screen has exactly one hero
  surface (`nightPanel` background, `elevation.lg`), and everything below
  it is progressively less contained — `DataBand`'s label/value rows have
  no card at all, just hairline dividers. Spot lists use condensed rows,
  not a repeated icon+heading+card tile.
- **Opinionated asymmetry.** The hero's score gauge and headline don't
  balance symmetrically; the dial itself is a 260° sweep with a 100° gap at
  the bottom, not a closed ring — an instrument reads as asymmetric by
  nature. Wide-web layouts go multi-column with unequal column purposes
  (`heroColumnsWide`), not a centered single column stretched wider.
  Text is left-aligned throughout; nothing is centered by default.
- **One signature moment per screen.** `ArcGauge` exists specifically so a
  screen has exactly one dominant metric visualization. Reaching for it
  twice on one screen (or building a second big-dial-shaped component for
  a secondary number) works against the rule it's there to enforce — use
  `DataBand` for everything supporting.
- **Honest copy, honest UI.** The preview-mode banner is mounted once at
  the app root — above the navigator, not per-screen — specifically so a
  screen showing sample data can never be caught missing its disclosure
  (see `components/README.md`). `PolarDayNotice` uses calm informational
  styling for "the sky won't get dark tonight" rather than a warning color,
  because it's a fact, not a problem. Decision copy says "worth the wait"
  rather than papering over a low score with a falsely upbeat tone. This
  extends to color semantics themselves — see the `accentWarm` rule below.

## Color

### The ground ramp

A deep blue-green ramp ("Fjord Line" hue family, hue ≈ 158–160°) instead of
flat dark navy or neutral gray — the neutrals are tinted toward the brand
hue, which is what makes the vivid aurora-green accent feel like it belongs
rather than being dropped onto an unrelated background.

| Token (`ground.*`) | Hex | Role |
|---|---|---|
| `base` | `#061617` | App background, the darkest step |
| `soft` | `#0d2023` | Slightly-raised background, used sparingly |
| `panel` | `#132d30` | The hero/panel surface — the one dominant moment on a screen |
| `surface` | `#14292d` | Default card/surface background |
| `surfaceElevated` | `#193639` | Raised-above-surface (gauge track, pressed chip) |
| `borderSubtle` | `#336163` | Hairline border on a surface |
| `borderStrong` | `#4d8887` | Stronger border for emphasis |

Depth in this ramp comes from **lightness only** — hue is constant across
all six steps. That's what let the whole ramp get hue-rotated once (from an
earlier blue H≈200–208 direction to this green H≈158–160 direction)
without touching a single contrast pair: every step moved together.

### Signal family (aurora green/mint)

The one vivid accent hue, used for the thing the app exists to tell you
(the score, the "go now" state, active nav).

| Token (`signal.*`) | Hex | Role |
|---|---|---|
| `primary` | `#67efc1` | Aurora green — the gauge fill, active states, "go" decisions |
| `soft` | `#b5ffd9` | Aurora mint — secondary emphasis, eyebrow labels, section kickers |
| `info` | `#89bfff` | Aurora blue — reserved for genuinely informational (not decision) contexts |
| `infoTint` | `#d5ecff` | Aurora ice — text on info-tinted surfaces |
| `deep` | `#1f8a71` | A darker step of the same hue, for depth without leaving the family |
| `glow` | `#7cf2c7` | A brighter step, used sparingly for glow/highlight accents |

### Copper (`accentWarm`) — and its semantic rule

Copper (`#d97b52`) is the one warm color in an otherwise cool palette. It
was added in a later pass specifically to give the app one accent that
isn't "green = data signal" — and it was given a strict, single job:

> **Warm means "worth the wait" / patience — never error, never a data
> problem.**

Concretely: `decisionStyle()` (`src/components/tonight/decision.ts`) uses
copper for the `bestLater` and `laterTonight` decision states ("clearer
skies later" / "come back after dark") — states that are *not bad news*,
just timing. It is deliberately **not** used for the existing
`warning`/`danger` tokens (cloud cover problems, stale data, low
score) — repainting those copper would blur an existing, load-bearing
meaning ("something is wrong with the data or the odds") into a purely
decorative brand accent. It is also not used as the aurora band color
itself (an explicit owner call, preserved in `tokens.ts`'s comments) — the
signature visual (the band, the gauge fill) stays green; copper is a
secondary accent, never the subject.

Where copper legitimately shows up: the app icon's one "town light" dot,
the design-preview honesty banner (a deliberately *different* color family
from the warning banner, so "you turned this on" never reads as "something
broke"), and the two "not now, but soon" decision states above.

**If you reuse this rule in a new app**: pick your own one warm accent, and
before wiring it into a single line of UI, write down the *one sentence*
its meaning is allowed to be. Don't let it become a second "highlight
color" that gets reached for opportunistically — that's how semantic
accents rot into decoration. See [Starting a sibling app](#starting-a-sibling-app)
for a worked example of re-deriving this rule for a different domain.

### Status colors

| Token (`status.*`) | Hex | Role |
|---|---|---|
| `warning` / `warningSurface` | `#f4c95d` / `#403518` | A live data/condition problem worth flagging, not fatal |
| `danger` / `dangerSurface` | `#ef7f8b` / `#41202a` | A hard negative (used sparingly — most "bad" states in this app are `warning`, not `danger`) |
| `infoSurface` | `#162c40` | Calm, neutral fact (paired with `signal.info`/`signal.infoTint` text) |
| `successSurface` | `#16352d` | Paired with `signal.primary`/`signal.soft` for the "go" decision state |

### The WCAG ≥4.5:1 discipline

Every body-text pairing in the app is checked against WCAG AA (4.5:1 for
body text, 3:1 for large/bold text and UI components). The measured
ratios below are the actual computed contrast for this palette (not
estimates) — useful both as a sanity check and as a map of **which pairs
are tight enough that you should not casually reuse them for smaller or
lighter text than the app already uses them for**.

| Pair | Ratio | Note |
|---|---|---|
| `text.primary` on `ground.base` | 16.96:1 | The safe default; use freely |
| `text.primary` on `ground.surface` | 13.90:1 | |
| `text.secondary` on `ground.base` | 11.53:1 | |
| `text.secondary` on `ground.surfaceElevated` | 8.04:1 | |
| `signal.primary` on `ground.base` | 12.95:1 | Aurora green as text (eyebrows, active nav) |
| `signal.soft` on `ground.panel` | 12.64:1 | Aurora mint as text |
| `text.onSignal` on `signal.primary` | 13.47:1 | Dark text on a green fill (gauge tip, filled buttons) |
| `accentWarm.onSurface` on `accentWarm.surface` | 9.75:1 | Copper surface pairing |
| `text.onWarningSurface` on `status.warningSurface` | 9.78:1 | |
| `text.onDangerSurface` on `status.dangerSurface` | 10.56:1 | |
| `text.onInfoSurface` on `status.infoSurface` | 11.76:1 | |
| **`text.muted` on `ground.base`** | **6.04:1** | Comfortable |
| **`text.muted` on `ground.surface`** | **4.95:1** | Passes AA, barely — treat as a floor, don't go darker/smaller from here |
| **`text.muted` on `ground.surfaceElevated`** | **4.21:1** | **Fails AA for body text.** This is the tightest pairing in the palette — `text.muted` on an elevated surface is only safe for large/bold text or non-critical decorative labels, never a small caption. If you need muted body text on an elevated card, use `text.secondary` instead. |
| **`accentWarm.base` on `ground.panel`** | **4.78:1** | Passes AA, barely — treat `accentWarm.base` as text-sized-up-or-bold only on `ground.panel`; it's more comfortable (6.08:1) on `ground.base`. |

**Rule of thumb for a new palette**: whenever you introduce a "muted" or
"tertiary" text tone, check it against your *most elevated* surface, not
just your base background — elevation narrows contrast, and that's where
a palette that "passes" on paper quietly fails on the actual busiest card
in the app.

## Typography

- **Fraunces** (serif, editorial) carries **display headlines, section
  titles, and numerals only** — `typography.display`, `.title`,
  `.numeralMd`, `.numeralLg`. Three static weights are used, each mapped to
  its own font-family string (no synthetic bold/italic):
  `Fraunces_600SemiBold` (medium), `Fraunces_700Bold` (bold),
  `Fraunces_900Black` (black, numerals only).
- **The system UI face** carries everything else — body copy, list items,
  chips, buttons, captions, and (importantly) the `heading`/`subheading`
  roles used for the many in-page section headers. **Do not reach for
  Fraunces there** — the rule is "editorial hierarchy", not "serif
  everywhere". Mixing typefaces broadly (serif headings AND serif section
  headers AND serif body) collapses the hierarchy Fraunces is there to
  create.
- **When NOT to use the serif**: anything that needs to read at a glance in
  a list (spot names, nav labels), anything tabular that isn't a hero
  numeral, and anything translated into a language/script where the serif
  face doesn't have full coverage — check before assuming Fraunces renders
  correctly for every locale you support.
- **Scale** (11 / 12 / 13 / 15 / 17 / 20 / 26 / 38 / 56, named by use, not
  by pixel value): `eyebrow` 11 · `caption` 12 · `bodySmall` 13 · `body` 15
  · `subheading` 17 · `heading` 20 · `title` 26 (Fraunces) · `display` 38
  (Fraunces) · `numeralLg` 56 (Fraunces). The gap in the 14–18px band is
  intentional — adjacent steps that close produce muddy hierarchy.
- **Font loading is app-side**, not part of this token file: install
  `@expo-google-fonts/fraunces` in the *consuming* app and call `useFonts`
  once at startup. Until it resolves, unrecognized `fontFamily` values
  silently fall back to the system font (no crash, no required loading
  screen) — this app deliberately does not gate rendering behind font
  loading.

## Space / radius / motion

- **Spacing**: a 4pt-base scale named by relationship
  (`xxs`4 · `xs`8 · `sm`12 · `md`16 · `lg`20 · `xl`28 · `xxl`40 · `xxxl`56),
  not by value — so intent survives if a step gets retuned.
- **Radius**: three working sizes plus a pill (`sm`12 · `md`16 · `lg`20 ·
  `xl`26 · `pill`999). Chips/pills always use `pill`; panels use
  `lg`/`xl`; small inline controls use `sm`. Not a different radius per
  component.
- **Elevation**: shadow, used sparingly — the hero surface and floating map
  sheets only (`sm` and `lg` tiers). If a shadow reads as a strong drop
  shadow, it's tuned wrong; these are meant to be nearly subliminal.
- **Motion**: transform/opacity only, exponential ease-out
  (`Easing.bezier(0.16, 1, 0.3, 1)`) for entrances, a matching ease-in-out
  for state changes. Durations: `fast`140ms · `base`260ms · `slow`420ms ·
  `enter`560ms.
- **The reduced-motion rule**: every animated entrance must check a
  reduced-motion signal (`./hooks/useReducedMotion.ts`) and, when it's set,
  **skip straight to the end state — do not just speed up the same
  animation.** There is deliberately no "reduced motion duration" token;
  the rule is "don't animate", not "animate faster".

## Iconography

Every hand-drawn icon in this app — the six tab icons plus the app mark —
shares one drawing discipline (full detail and worked examples in
[`assets/MARK.md`](./assets/MARK.md)):

- **1.7px stroke weight** (`LINE_ICON_STROKE_WIDTH`), round caps and round
  joins, no square caps or miter joins.
- **A literal, place-specific vocabulary** — a fjord peak, a moon over a
  band, a camera — never a generic stock-icon substitute (no gear-in-a-
  circle, no magic-sparkle, no emoji).
- **At most one filled accent per icon** (a dot, a crescent) — never a
  filled background chip behind the glyph.
- **A consistent 24×24 viewBox** even though rendered size varies.

Reference SVGs for the app mark itself live in [`assets/`](./assets)
(`icon.svg`, `icon-mark.svg`, `adaptive-icon-foreground.svg`) with the
construction/anatomy/safe-zone writeup in `assets/MARK.md`. The tab icon
*components* (`AuroraIcon`, `MapIcon`, `SpotsIcon`, `TonightIcon`,
`LiveIcon`, `MidnightSunIcon`) are not duplicated into this folder — they
live in the app's `src/components/icons/` because they're wired to a
`LineIconProps` shape tied to React Navigation's `tabBarIcon` render prop.
Copy the *pattern* (stroke width, cap style, one-subject-per-icon) from
those files when drawing a new set for a sibling app, not the files
themselves.

## Signature components and when to use them

- **`ArcGauge`** (`components/ArcGauge.tsx`) — the one big score/metric
  moment per screen. A 260° instrument dial (not a closed ring, not a
  progress bar), Fraunces numeral centered, animated sweep-in that respects
  reduced motion. Use it exactly once per screen, for the number the
  screen exists to answer. Generalized from the app's original
  `ScoreGauge` — `value`/`max` instead of a hardcoded 0–100 `score`, and
  every color is a prop defaulting to a `tokens.ts` value, so a sibling app
  can retint it without forking the file.
- **`DataBand`** (`components/DataBand.tsx`) — grouped facts with hairline
  dividers, not boxes. Use it for every "row of related numbers" moment —
  the opposite instinct from a card grid. Already app-agnostic; supports
  per-item tone colors and full style overrides so it can match a
  differently-styled surrounding surface without a fork.
- **Banner patterns** (documented, not extracted — see
  [`components/README.md`](./components/README.md)) — including the
  **honesty-banner concept**: when an app has any "this isn't real/live
  data" mode, mount its disclosure banner once at the tree's root, above
  all navigation, so no individual screen can ship without it. That
  placement decision matters more than the banner's visual styling.
- **Hero scrim & chip row** (documented, not extracted — see
  [`components/README.md`](./components/README.md)) — small or
  image-specific enough that the pattern, not a shared component, is the
  right unit to hand off.

## Starting a sibling app

Worked example throughout this section: **an "eats in Tromsø" app** —
same city, same tourist-deciding-something-real use case, different
domain (where/what to eat vs. where/when to see the aurora).

### What stays

- **The ground ramp.** Keep the same six-step, hue-constant, blue-green-
  or-whatever-your-hue neutral ramp *technique* — depth from lightness
  only, one hue for the whole neutral scale, tinted rather than pure gray.
  You don't have to keep hue ≈158–160° specifically (a food app might tint
  warmer, toward a bread/broth hue), but keep the *discipline*.
- **Type scale, roles, and the serif/system split.** Reuse the exact
  spacing/radius/motion tokens outright — they're not aurora-specific in
  any way. Keep an editorial display face for the one or two moments that
  deserve it, and keep everything else on the system face. You don't have
  to keep Fraunces specifically, but keep "one expressive face, used
  narrowly."
- **The 1.7px stroke discipline** for any hand-drawn icon set — cap style,
  join style, one-literal-subject-per-icon, at-most-one-filled-accent.
- **The honesty principles**: root-mounted disclosure banners for any
  demo/preview/sample-data mode; calm (not alarmist) styling for true facts
  that aren't problems; a written, one-sentence rule for what any warm/
  off-family accent color is allowed to mean, checked before every reuse.
- **The WCAG ≥4.5:1 discipline**, including checking your most elevated
  surface, not just your base background, for every "muted" text tone.

### What gets re-derived

- **Accent semantics.** This app's copper means "worth the wait". An eats
  app could give copper (or its own warm accent) a completely different,
  equally specific job — e.g. **"busy right now"**: a restaurant with a
  line out the door isn't broken or bad, it's popular, and "warm = come
  back later or expect a wait" maps naturally. The rule to copy isn't "use
  copper for X" — it's "write the one sentence first, then check every
  future use against it."
- **The signal hue.** Aurora green is load-bearing *for this app's
  subject* — it's what the app is showing you. An eats app's signature
  hue should come from its own subject: maybe a warm tomato/paprika red
  for "great match", or it could deliberately invert and make the *cool*
  end of its palette the signal color, with warm reserved for status. There
  is no reason the "go" color has to be green just because this app's was.
- **The icon vocabulary.** Fjord peaks and a bridge arc are this app's
  literal place. An eats app needs its own small set of literal-subject
  marks — a plate, a steam curl, a table-for-two — drawn at the same
  1.7px/round-cap/round-join discipline, not a re-skin of the aurora set's
  actual shapes.
- **The signature mark.** `ArcGauge` (the score dial) is a strong pattern
  to keep — but re-derive what number it shows. For an eats app: a
  **"worth-the-trip" score** for a restaurant (distance, current wait,
  price band, and rating folded into one 0–100 dial, exactly the same way
  this app folds cloud cover / Kp-index / darkness into an aurora score).
  Keep the component; change `value`, `max`, `label`, and the color props
  to match the new domain's own semantics — don't change the dial shape,
  the sweep angle, or the reduced-motion behavior, all of which are the
  actual "field instrument" identity working correctly regardless of
  subject.

### What NOT to do

Don't just retint this palette's hex values and ship — that produces an
app that *looks* like a reskin, not a sibling with its own identity. The
deliverable of adopting this system is the **discipline** (tinted neutral
ramp, narrow serif use, one signature dial, honest banners, a
one-sentence rule for every semantic accent) — not these specific colors.
