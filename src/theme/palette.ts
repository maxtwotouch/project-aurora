// Defined outside the object so it can be reused by textOnInfoSurface below
// without duplicating the hex value.
const auroraIce = '#d5ecff';

export const palette = {
  night: '#061017',
  nightSoft: '#0d1923',
  nightPanel: '#132330',
  card: '#14212d',
  cardElevated: '#192b39',
  cardBorder: '#335163',
  cardBorderStrong: '#4d7588',
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
  surfaceSunken: '#101d27',
  surfaceSunkenAlt: '#152835',
  surfaceOverlay: '#0f1c26',
  chipSurface: '#17303c',
  chipSurfaceActive: '#1d394a',
  borderHairline: '#284657',
  borderHairlineStrong: '#355468',
  glowMint: '#82f3c41f',
  glowBlue: '#91beff14',

  // Text-on-tinted-surface pairs (kept close to warning/danger hues so
  // contrast holds on their matching *Surface backgrounds).
  textOnWarningSurface: '#fae7a3',
  textOnDangerSurface: '#ffd2d8',
  textOnInfoSurface: auroraIce
} as const;
