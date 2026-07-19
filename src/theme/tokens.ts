/**
 * Thin re-export: `space`, `radius`, `elevation`, `motion` and the
 * `WebPressableState` type now live in `design-system/tokens.ts` (the
 * canonical source -- see `design-system/README.md` § "Space / radius /
 * motion" for the rationale behind each scale). This file exists only so
 * every existing `import { space, radius, ... } from '../../theme/tokens'`
 * across the app keeps working unchanged.
 */
export { space, radius, elevation, motion, type WebPressableState } from '../../design-system/tokens';
