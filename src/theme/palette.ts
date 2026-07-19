// Defined outside the object so it can be reused by textOnInfoSurface below
// without duplicating the hex value.
const auroraIce = '#d5ecff';

// "Fjord Line" brand direction (see design-directions board, Direction A):
// the ground ramp moved off blue-black onto the same hue family as the
// aurora greens (H~158-160, matching auroraGreen/auroraMint's own hue)
// instead of the old H~200-208 blue. Every entry below is the *same*
// saturation/lightness as before -- only the hue rotated -- so relative
// depth ordering (night < nightSoft < nightPanel < card < cardElevated,
// etc.) is unchanged and every previously-passing contrast pair still
// passes (re-verified; see PR notes for the ratio table). Text tokens were
// NOT touched: they were already tinted toward this same green/teal hue
// (H~160-182), which is what made this hue pick cohere with the existing
// UI rather than reading as a new palette.
export const palette = {
  night: '#061617',
  nightSoft: '#0d2023',
  nightPanel: '#132d30',
  card: '#14292d',
  cardElevated: '#193639',
  cardBorder: '#336163',
  cardBorderStrong: '#4d8887',
  textPrimary: '#eef7f4',
  textSecondary: '#bdd0cf',
  textMuted: '#7f9899',
  textOnAurora: '#04110d',
  auroraGreen: '#67efc1',
  auroraMint: '#b5ffd9',
  auroraBlue: '#89bfff',
  auroraIce,
  auroraDeep: '#1f8a71',
  auroraGlow: '#7cf2c7',
  warning: '#f4c95d',
  danger: '#ef7f8b',
  successSurface: '#16352d',
  infoSurface: '#162c40',
  warningSurface: '#403518',
  dangerSurface: '#41202a',
  shadow: '#000000',

  // Semantic surface/border tokens. These consolidate the many near-duplicate
  // one-off hex values that had accumulated across screens (e.g. '#101d27',
  // '#152835', '#274253', '#284657', '#29475f' were all the same "sunken
  // panel + hairline border" pairing used with slightly different values).
  // Same hue family as the tokens above -- this is not a new palette.
  surfaceSunken: '#102527',
  surfaceSunkenAlt: '#153335',
  surfaceOverlay: '#0f2426',
  chipSurface: '#173c3c',
  chipSurfaceActive: '#1d484a',
  borderHairline: '#285657',
  borderHairlineStrong: '#356568',
  glowMint: '#82f3c41f',
  glowBlue: '#91beff14',

  // Text-on-tinted-surface pairs (kept close to warning/danger hues so
  // contrast holds on their matching *Surface backgrounds).
  textOnWarningSurface: '#fae7a3',
  textOnDangerSurface: '#ffd2d8',
  textOnInfoSurface: auroraIce,

  // Copper -- Direction A's "warm Nordic-dusk signal" accent. Deliberately
  // NOT used as the aurora band color (owner asked for that to stay green;
  // see board rationale) and NOT substituted into the existing semantic
  // warning/danger tokens above -- those already mean something ("data is
  // stale", "cloud cover") and repainting them copper would blur that
  // meaning for a purely decorative brand accent. Originally used in
  // exactly one place: the "town light" dot on the app icon/splash mark
  // (assets/icon.svg). The photo-editorial pass (brand PR 2/2) picked up
  // the flag left here and reached for it in three places where "warm"
  // reads as timing/patience rather than status -- see that PR's notes for
  // the shortlist. Still deliberately NOT used for the `wait`/`goNow`
  // decision states (those keep the existing green/amber semantics) or for
  // anything that could be mistaken for a data-quality warning.
  accentWarm: '#d97b52',
  // Text-on-copper pair, same pattern as the warning/danger *Surface +
  // textOn*Surface pairs above: a dark copper-tinted surface with a light
  // copper-tinted text color, both derived from accentWarm's own hue so a
  // "warm" surface reads as a family with the accent dot/stroke rather than
  // a one-off. Contrast-checked at ~9.7:1 (WCAG AA/AAA for body text).
  accentWarmSurface: '#3a2418',
  textOnAccentWarmSurface: '#f6cbb0'
} as const;
