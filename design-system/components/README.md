# Components

Two portable components live here today:

- **`ArcGauge.tsx`** — the one signature "big score/metric moment" per
  screen. Generalized from the app's `ScoreGauge` (`value`/`max` instead of
  a hardcoded 0-100 `score`, color props defaulting to `../tokens`). The
  app's `src/components/tonight/ScoreGauge.tsx` is now a thin wrapper over
  this with the app's own score-specific props/copy.
- **`DataBand.tsx`** — grouped label/value facts separated by hairline
  dividers, not boxes. Already app-agnostic before the move; only the token
  import path changed.

Both are plain `.tsx`, no `index.ts` barrel yet (two files don't need one —
add one if a third component joins this folder).

## Patterns documented here, not extracted

Some of the app's strongest visual moments are still specific enough to
their screen's data shape, or small enough, that copy-pasting the *pattern*
into a sibling app is more honest than pretending to hand over a reusable
component. Extracting them prematurely would produce an API with more
props than call sites justify. Documented here instead:

### Hero scrim (editorial photo hero)

A full-bleed photo with a bottom gradient scrim so overlaid title/status
text stays legible regardless of the photo underneath — the "editorial,
not placeholder-driven" image treatment from the redesign proposal.

Reference: `src/components/SpotHeroImage.tsx` (`react-native-svg`'s
`LinearGradient`/`Rect`/`Stop`, id'd `heroScrim`). The scrim gradient stops
are tuned to this app's specific photos/aspect ratio; a sibling app should
re-derive the stop positions/opacity against its own imagery rather than
copy the exact values — the *technique* (SVG gradient overlay, not a PNG
mask or a CSS-only `box-shadow` fake) is what's worth keeping.

### Chip row (pill-shaped quick links)

A horizontal row of pill buttons (`radius.pill`, `borderHairlineStrong`
border, no fill until pressed/focused) used for secondary navigation that
doesn't deserve a full section — e.g. Tonight's "jump to map / cameras /
spot list" row.

Reference: `src/components/tonight/QuickNavChips.tsx`. Small enough (one
`Pressable` per chip, no shared logic beyond the token-driven styling) that
a shared component would just be prop-forwarding; copy the ~15 lines of
style and swap the labels/`onPress` handlers.

### Banner patterns (three variants, one shape)

Three single-line, full-width banners share the same shape (icon + text,
horizontal padding, one border color, safe-area-aware top padding when
mounted above the navigator) but are deliberately NOT unified into one
`<Banner variant="..." />` component, because their *meanings* are
different enough that a shared prop surface would blur the honesty rule
each one exists to enforce:

- **`src/components/DataQualityBanner.tsx`** — a live data source is stale
  or missing right now. Warning palette (`status.warningSurface` /
  `status.warning`).
- **`src/components/PreviewModeBanner.tsx`** — "the honesty-guard banner":
  mounted once at the app root, above the navigator (not per-screen), so it
  is structurally impossible for a screen showing sample/demo data to be
  missing it. Copper palette (`accentWarm`) — deliberately a different
  color family from the warning banner above, so "you turned this on
  yourself" never reads as "something is broken". If a sibling app adds a
  design-preview/demo-data mode, replicate the root-mount placement, not
  just the visual style — that's the part doing the actual honesty work.
- **`src/components/tonight/PolarDayNotice.tsx`** — informational, not a
  problem: a true seasonal fact ("the sky won't get dark tonight") in the
  calm `status.infoSurface` family, with the one warm accent confined to a
  small icon detail rather than recoloring the whole banner.

The lesson for a sibling app: pick a banner's color and copy from *what
kind of true thing it's saying* (a live-data problem vs. "you did this" vs.
neutral fact), not from a generic severity scale. Don't build a
`type="warning" | "info" | "success"` banner API — write the copy first,
then let the meaning pick the palette.
