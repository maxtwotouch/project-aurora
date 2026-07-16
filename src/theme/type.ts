import type { TextStyle } from 'react-native';

/**
 * Semantic typography scale. One restrained reading face (the platform
 * system font) carries every role; hierarchy comes from size, weight,
 * letter-spacing and color contrast rather than from mixing typefaces.
 *
 * Roles are named by *use*, not by pixel value -- e.g. `heading`, not
 * `size20` -- so components read intent when they reference `typography.heading`.
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
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800'
  },
  display: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800'
  },
  numeralMd: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800'
  },
  numeralLg: {
    fontSize: 56,
    lineHeight: 58,
    fontWeight: '800'
  }
};
