/**
 * Thin re-export: the `fraunces` family-name constants and the
 * `typography` scale now live in `design-system/tokens.ts` (see
 * `design-system/README.md` § "Typography" for the rationale, and that
 * file's own doc comments for the font-loading tradeoff). This file exists
 * only so every existing `import { typography } from '../../theme/type'`
 * (or `fraunces`) across the app keeps working unchanged -- same roles,
 * same `fontFamily` values.
 *
 * The design-system's `typography` scale already embeds the Fraunces
 * `fontFamily` specifics (`fraunces.medium/bold/black`) directly into the
 * `display`/`title`/`numeralMd`/`numeralLg` roles -- there is no separate
 * app-side merge step. Actually LOADING those fonts (`useFonts` from
 * `@expo-google-fonts/fraunces`) stays app-side, in App.tsx / App.web.tsx,
 * same as before this file became a re-export.
 */
export { fraunces, typography } from '../../design-system/tokens';
