/**
 * `tsc` (via `npm run typecheck`) has no platform awareness and this
 * project's tsconfig does not set `moduleSuffixes`, so a bare `import ...
 * from './TripAreaMap'` (as TripModeScreen.tsx uses, mirroring Metro's own
 * `.native.tsx` / `.web.tsx` platform resolution) needs an actual
 * extensionless module to resolve against for type-checking purposes.
 * Metro itself never reaches this file: for every extension it tries the
 * platform variant first, so `TripAreaMap.native.tsx` / `TripAreaMap.web.tsx`
 * always win over this bare `TripAreaMap.tsx`. (It MUST stay a `.tsx`, not
 * `.ts` -- Metro walks extensions in `sourceExts` order, so a bare `.ts`
 * would beat the platform `.web.tsx` and drag react-native-maps into the
 * web bundle.) Purely a `tsc`-satisfying shim, not a third implementation.
 */
export { TripAreaMap } from './TripAreaMap.native';
