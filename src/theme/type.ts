import type { TextStyle } from 'react-native';

/**
 * Fraunces family names as registered by `useFonts` from
 * `@expo-google-fonts/fraunces` (see App.tsx / App.web.tsx). Each name maps
 * to one static weight file -- there is no synthetic bold/italic, so
 * consumers should not also set a conflicting numeric `fontWeight`.
 *
 * Editorial hierarchy, not "serif everywhere": only the hero headline +
 * score numeral, screen/section titles, and numerals reach for Fraunces
 * (`typography.display/title/numeralMd/numeralLg` below). Body text, list
 * copy, chips, buttons, captions, and the broader `heading`/`subheading`
 * roles (used for the many in-page section headers) deliberately stay on
 * the system face -- see the roles below that do NOT set `fontFamily`.
 */
export const fraunces = {
  medium: 'Fraunces_600SemiBold',
  bold: 'Fraunces_700Bold',
  black: 'Fraunces_900Black'
} as const;

/**
 * Semantic typography scale. Fraunces (serif, editorial) carries display
 * headlines, titles and numerals; the platform system font carries
 * everything else -- hierarchy still comes primarily from size, weight,
 * letter-spacing and color contrast, not from mixing typefaces broadly.
 *
 * Roles are named by *use*, not by pixel value -- e.g. `heading`, not
 * `size20` -- so components read intent when they reference `typography.heading`.
 *
 * Scale steps (11 / 12 / 13 / 15 / 17 / 20 / 26 / 38 / 56) intentionally
 * skip adjacent values in the 14-18px band that produce muddy hierarchy.
 *
 * Font loading note: `fontFamily` below points straight at the Fraunces
 * family names. Until `useFonts` finishes registering them, React Native
 * silently falls back to the system font for any unrecognized
 * `fontFamily` (no crash, no blocked render) -- the visual effect is a
 * brief swap once loading completes, deliberately not gated behind a
 * loading screen. See App.tsx / App.web.tsx for the loading call and the
 * fuller tradeoff note.
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
