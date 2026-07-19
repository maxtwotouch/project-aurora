# The mark: construction & anatomy

Source files in this folder (copied as-is from the app's `assets/`, not
regenerated — keep them in sync by hand if the app's mark changes):

- `icon.svg` — full app icon, 100×100 viewBox, opaque background. Source
  for `favicon.png`.
- `icon-mark.svg` — same mark, transparent background. Splash-screen
  source, composited over `app.json`'s `splash.backgroundColor`.
- `adaptive-icon-foreground.svg` — the mark scaled/translated (0.6875×)
  into Android's ~66dp safe zone on a 108×108 canvas, for the adaptive
  icon foreground layer.

## Anatomy

The mark is "the place itself as the icon" — three fjord peaks, a bridge
arc, one thick aurora stroke — reduced to this few shapes deliberately, so
it stays legible at 64px. No fine pylon ticks, no dense star field, no
literal aurora photo-realism.

Reading `icon-mark.svg` top to bottom (SVG paint order = visual back to
front):

1. **Peaks** — `<path d="M2,82 L22,48 L34,66 L50,28 L66,66 L84,42 L98,82 Z" fill="ground.panel">`.
   A single filled silhouette, three asymmetric peaks (heights 48/28/42 —
   deliberately uneven, not a repeated zigzag) sitting on the canvas floor.
   This is the "place, not a generic pin" language reused by
   `src/components/icons/MapIcon.tsx`.
2. **Bridge arc** — one quadratic-curve stroke (`Q50,74 86,90`),
   `stroke-width 3.4`, rounded caps, no pylon detail. Represents the Tromsø
   bridge without literal architecture — a single confident line, the same
   restraint the rest of the icon set (`src/components/icons/*.tsx`) uses.
3. **Aurora band** — the signature stroke: a wide (`stroke-width 6.4`)
   organic cubic-bezier ribbon in `signal.primary` (aurora green — see
   `../tokens.ts`), never copper. This is the one element that should
   survive untouched if a sibling app reuses the *technique* but not the
   place: keep it as a bold, single, undulating stroke, own color.
4. **Town light** — one small filled circle (`r="2.1"`) in `accentWarm.base`
   on the bridge crest. The mark's only warm accent, and deliberately a
   *dot*, not a wash — copper survives here as a small secondary detail,
   never the band itself (see `../tokens.ts`'s `accentWarm` doc comment for
   why: warm means "patience/worth the wait", and recoloring the band
   copper would blur that into "the whole sky is warm/urgent").
5. **Star dust** — two tiny (`r ≤ 1`) low-opacity dots, aurora-green. Only
   reads at larger renders; omit entirely below ~120px rather than let it
   become visual noise.

## Safe zones

- **Favicon / app icon (`icon.svg`, 100×100)**: no safe-zone padding needed
  — background is opaque and the shape already sits inset from every edge
  (peaks reach `y=28` to `y=90`, well within the canvas).
- **Adaptive icon (`adaptive-icon-foreground.svg`, 108×108)**: the mark is
  scaled to 0.6875× and translated to `(19.625, 18.25)` so every stroke
  clears Android's ~66dp-diameter circular/squircle/rounded-square launcher
  masks. If you resize or redraw the mark, keep the *scaled* bounding box
  inside a centered ~66/108 ≈ 61% diameter circle — don't just eyeball it
  against the raw peaks path, which was authored for the 100×100 canvas.
- **Splash (`icon-mark.svg`)**: transparent background, no additional
  inset — composited by the OS over `app.json`'s `splash.backgroundColor`,
  which should be `ground.base` (or close to it) so the transparent edges
  don't produce a visible seam.

## Drawing new marks/icons that fit this vocabulary

This mark and the tab-icon set (`src/components/icons/*.tsx`, not
duplicated in this folder — they're wired to a `LineIconProps` shape tied
to React Navigation's `tabBarIcon` render prop, so copy the *pattern* from
the app, not files, if a sibling app needs its own set) share one drawing
discipline:

- **1.7px stroke weight** (`LINE_ICON_STROKE_WIDTH` in
  `src/components/icons/types.ts`) for every hand-drawn line icon. Not 1px
  (too thin to read at 20-24px), not 2px+ (reads heavy/cartoonish next to
  Fraunces). The one exception is the app mark's own aurora band and bridge
  arc, which run thicker (6.4 / 3.4 in the mark's own 100-unit viewBox —
  proportionally similar once you account for the larger canvas) because
  they're the *subject*, not a supporting line.
- **`strokeLinecap="round"` and `strokeLinejoin="round"`** everywhere —
  no square caps, no miter joins. This is what makes the aurora ribbons in
  particular read as fluid rather than mechanical.
- **One filled accent per icon, at most** — a small dot or crescent
  (`TonightIcon`'s moon, `MidnightSunIcon`'s optional town-light dot), never
  a filled background chip behind the glyph itself (the pill behind the
  active tab icon is drawn by the navigator chrome, not the icon).
  Reference `src/components/icons/AuroraIcon.tsx` for the two-line
  "foreground ribbon at full opacity + background ribbon at 0.5 opacity"
  depth trick used to suggest more than one band without adding real depth
  cues (shadows, gradients).
- **A consistent 24×24 viewBox** for every tab icon, even though the
  rendered `size` prop varies — keeps hand-plotted coordinates comparable
  across the set when drawing a new one next to the existing files.
- **A place-specific vocabulary, not generic glyphs** — every mark in this
  set draws *this app's actual subject* (a fjord peak, a moon over a band,
  a camera for the live feeds) rather than reaching for a generic
  stock-icon substitute. A sibling app should invent its own small set of
  literal subject marks in the same stroke discipline, not reskin these
  ones with new colors — see `../README.md` § "Starting a sibling app".
