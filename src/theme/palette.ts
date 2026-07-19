/**
 * Thin re-export: the canonical palette now lives in
 * `design-system/tokens.ts` (see that file's `palette` export and its
 * grouped primitives -- `ground`, `text`, `signal`, `accentWarm`, `status`,
 * `surface`, `border`, `glow` -- plus `design-system/README.md` for the
 * *why* behind every value). This file exists only so every existing
 * `import { palette } from '../../theme/palette'` (or `'./theme/palette'`,
 * etc.) across the app keeps working unchanged -- same keys, same values,
 * same `as const` typing.
 *
 * New code anywhere in this app should still import from here (or
 * `./tokens` / `./type`) rather than reaching into `design-system/`
 * directly -- these files are the app's own stable import path; the
 * design-system folder is the source of truth they're re-exporting, not a
 * replacement for them.
 */
export { palette } from '../../design-system/tokens';
