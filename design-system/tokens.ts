/**
 * Aurora design system — canonical token source.
 *
 * This file is the single source of truth for color, spacing, radius,
 * elevation, motion and typography. `src/theme/{palette,tokens,type}.ts` in
 * the app are thin re-exports of what's here (see those files' header
 * comments) — edit values HERE, not there.
 *
 * Plain TypeScript, no build step: Metro (via `babel-preset-expo`) bundles
 * this folder like any other in-repo module. The only external types this
 * file reaches for are `react-native`'s `Easing`/`TextStyle`, since the
 * design system targets Expo/React Native apps specifically — a sibling
 * app adopting this folder is assumed to already depend on `react-native`.
 *
 * See ./README.md for the *why* behind these values (identity, contrast
 * discipline, "starting a sibling app" guidance). This file is deliberately
 * comment-light on rationale and heavy on the values themselves; ./README.md
 * is the narrative, this is the reference.
 */
import { Easing, type TextStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Color primitives — brand-neutral names, grouped by role. `palette` below
// re-exposes every one of these under the app's original (aurora-specific)
// key names as plain aliases, so existing app code keeps working untouched.
// A sibling app should reach for these primitive groups directly and give
// its own semantic layer new names (see README § "Starting a sibling app").
// ---------------------------------------------------------------------------

/**
 * The ground ramp: deep blue-green ("Fjord Line" hue, H~158-160) instead of
 * flat dark navy or neutral gray. Six steps from near-black to a hairline
 * border tone — depth comes from lightness only, hue stays constant.
 */
export const ground = {
  /** App background. The darkest step. */
  base: '#061617',
  /** Slightly-raised background (used sparingly, e.g. under a sunken panel). */
  soft: '#0d2023',
  /** The hero/panel surface — where the one dominant moment on a screen sits. */
  panel: '#132d30',
  /** Default card/surface background. */
  surface: '#14292d',
  /** Raised-above-surface (e.g. the gauge's track, a pressed chip). */
  surfaceElevated: '#193639',
  /** Hairline border on a surface. */
  borderSubtle: '#336163',
  /** Stronger border for emphasis (focus-adjacent, active chip). */
  borderStrong: '#4d8887'
} as const;

/** Body/UI text on the ground ramp. See README's contrast table for pairing ratios. */
export const text = {
  primary: '#eef7f4',
  secondary: '#bdd0cf',
  muted: '#7f9899',
  /** Dark text for use ON a signal-colored surface (e.g. inside the gauge tip). */
  onSignal: '#04110d',
  onInfoSurface: '#d5ecff',
  onWarningSurface: '#fae7a3',
  onDangerSurface: '#ffd2d8',
  onAccentWarmSurface: '#f6cbb0'
} as const;

/**
 * The signal family: aurora green/mint, the app's one vivid accent hue.
 * This is the ONE thing that should almost always survive a rebrand
 * unchanged in hue if a sibling app wants to stay visually related — but
 * a sibling app is equally free to pick its own signal hue entirely (see
 * README).
 */
export const signal = {
  primary: '#67efc1',
  soft: '#b5ffd9',
  info: '#89bfff',
  infoTint: '#d5ecff',
  deep: '#1f8a71',
  glow: '#7cf2c7'
} as const;

/**
 * Copper — the warm accent family. SEMANTIC RULE (do not violate when
 * reusing this token): warm/copper means "worth the wait, timing, patience"
 * — a state that will resolve favorably if you wait — never "error" or
 * "data problem". Those meanings stay on `status.warning`/`status.danger`.
 * See README § Color for the full rationale and the sibling-app worked
 * example (copper as an eats-app's "busy right now" signal).
 */
export const accentWarm = {
  base: '#d97b52',
  surface: '#3a2418',
  onSurface: '#f6cbb0'
} as const;

/** Status colors — data-quality / severity only. Never repainted for brand decoration. */
export const status = {
  warning: '#f4c95d',
  danger: '#ef7f8b',
  successSurface: '#16352d',
  infoSurface: '#162c40',
  warningSurface: '#403518',
  dangerSurface: '#41202a'
} as const;

/** Sunken/overlay surfaces and chip backgrounds — consolidated near-duplicate one-offs. */
export const surface = {
  sunken: '#102527',
  sunkenAlt: '#153335',
  overlay: '#0f2426',
  chip: '#173c3c',
  chipActive: '#1d484a'
} as const;

/** Hairline dividers/borders not tied to a card (e.g. DataBand's item dividers). */
export const border = {
  hairline: '#285657',
  hairlineStrong: '#356568'
} as const;

/** Soft radial/linear glow tints — used sparingly behind hero moments, never as a background fill. */
export const glow = {
  mint: '#82f3c41f',
  blue: '#91beff14'
} as const;

export const shadow = '#000000';

/**
 * Combined palette, byte-compatible with the app's historical
 * `src/theme/palette.ts` key names (every key below is an alias of one of
 * the primitive groups above — same values, just the aurora-specific name
 * the rest of the app already imports). New code — in this app or a
 * sibling one — should prefer the grouped primitives above; this object
 * exists so `src/theme/palette.ts` can re-export it unchanged.
 */
export const palette = {
  night: ground.base,
  nightSoft: ground.soft,
  nightPanel: ground.panel,
  card: ground.surface,
  cardElevated: ground.surfaceElevated,
  cardBorder: ground.borderSubtle,
  cardBorderStrong: ground.borderStrong,

  textPrimary: text.primary,
  textSecondary: text.secondary,
  textMuted: text.muted,
  textOnAurora: text.onSignal,

  auroraGreen: signal.primary,
  auroraMint: signal.soft,
  auroraBlue: signal.info,
  auroraIce: signal.infoTint,
  auroraDeep: signal.deep,
  auroraGlow: signal.glow,

  warning: status.warning,
  danger: status.danger,
  successSurface: status.successSurface,
  infoSurface: status.infoSurface,
  warningSurface: status.warningSurface,
  dangerSurface: status.dangerSurface,
  shadow,

  surfaceSunken: surface.sunken,
  surfaceSunkenAlt: surface.sunkenAlt,
  surfaceOverlay: surface.overlay,
  chipSurface: surface.chip,
  chipSurfaceActive: surface.chipActive,
  borderHairline: border.hairline,
  borderHairlineStrong: border.hairlineStrong,
  glowMint: glow.mint,
  glowBlue: glow.blue,

  textOnWarningSurface: text.onWarningSurface,
  textOnDangerSurface: text.onDangerSurface,
  textOnInfoSurface: text.onInfoSurface,

  accentWarm: accentWarm.base,
  accentWarmSurface: accentWarm.surface,
  textOnAccentWarmSurface: accentWarm.onSurface
} as const;

export type Palette = typeof palette;

// ---------------------------------------------------------------------------
// Space / radius / elevation
// ---------------------------------------------------------------------------

/**
 * Spacing scale, 4pt base. Named by relationship (xs/sm/md...), not by
 * value, so intent survives if a step is retuned later.
 */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
  xxxl: 56
} as const;

/** Alias kept for app byte-compatibility (`src/theme/tokens.ts` exports `space`). */
export const space = spacing;

/**
 * Radius tiers. Three working sizes plus a pill — not a different radius
 * per component. Chips/pills always use `pill`; panels use `lg`/`xl`;
 * small inline controls use `sm`.
 */
export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  pill: 999
} as const;

/**
 * Elevation via shadow, used sparingly (the hero recommendation surface
 * and floating map sheets). Subtle by design — if it reads as a strong
 * drop shadow it is tuned wrong.
 */
export const elevation = {
  sm: {
    shadowColor: shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4
  },
  lg: {
    shadowColor: shadow,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.26,
    shadowRadius: 26,
    elevation: 8
  }
} as const;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * Motion tokens: transform/opacity only, exponential ease-out for entrances.
 * Every consumer must check a reduced-motion signal and skip straight to
 * the end state when it's set (see ./hooks/useReducedMotion.ts) — there is
 * no token here for "the reduced-motion duration" because the rule isn't
 * "make it faster", it's "don't animate transform/opacity-driven entrances
 * at all".
 */
export const motion = {
  duration: {
    fast: 140,
    base: 260,
    slow: 420,
    enter: 560
  },
  easing: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.65, 0, 0.35, 1)
  }
} as const;

/**
 * react-native-web's Pressable augments the official `{ pressed }` state
 * callback with `hovered`/`focused` at runtime (used for web hover/focus
 * styling). React Native's own type definitions only know about `pressed`,
 * so every Pressable `style` callback types its state parameter with this
 * shared shape instead of an inline `: any` cast.
 */
export type WebPressableState = {
  pressed: boolean;
  hovered?: boolean;
  focused?: boolean;
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * Fraunces family names as registered by `useFonts` from
 * `@expo-google-fonts/fraunces`. Each name maps to one static weight file —
 * there is no synthetic bold/italic, so consumers should not also set a
 * conflicting numeric `fontWeight`.
 *
 * Font LOADING is app-side, not part of this design system: the app calls
 * `useFonts({ Fraunces_600SemiBold, Fraunces_700Bold, Fraunces_900Black })`
 * once at startup (see App.tsx / App.web.tsx) and installs the
 * `@expo-google-fonts/fraunces` package as its own dependency. This file
 * only holds the resulting family-name STRINGS so `typography` below can
 * reference them — until loading finishes, React Native silently falls
 * back to the system font for any unrecognized `fontFamily` (no crash, no
 * required loading screen).
 */
export const fraunces = {
  medium: 'Fraunces_600SemiBold',
  bold: 'Fraunces_700Bold',
  black: 'Fraunces_900Black'
} as const;

/**
 * Semantic typography scale. Fraunces (serif, editorial) carries display
 * headlines, titles and numerals; the platform system font carries
 * everything else — hierarchy still comes primarily from size, weight,
 * letter-spacing and color contrast, not from mixing typefaces broadly.
 *
 * Roles are named by *use*, not by pixel value — e.g. `heading`, not
 * `size20` — so components read intent when they reference `typography.heading`.
 *
 * Scale steps (11 / 12 / 13 / 15 / 17 / 20 / 26 / 38 / 56) intentionally
 * skip adjacent values in the 14-18px band that produce muddy hierarchy.
 */
export const typography: Record<string, TextStyle> = {
  eyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  bodySmall: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500'
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400'
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700'
  },
  subheading: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700'
  },
  heading: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800'
  },
  title: {
    fontFamily: fraunces.bold,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '700'
  },
  display: {
    fontFamily: fraunces.medium,
    fontSize: 38,
    lineHeight: 43,
    fontWeight: '600'
  },
  numeralMd: {
    fontFamily: fraunces.bold,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums']
  },
  numeralLg: {
    fontFamily: fraunces.black,
    fontSize: 56,
    lineHeight: 58,
    fontWeight: '900',
    fontVariant: ['tabular-nums']
  }
};
