/**
 * Thin re-export: `DataBand` now lives in
 * `design-system/components/DataBand.tsx` (already app-agnostic before
 * this move -- see `design-system/README.md` and
 * `design-system/components/README.md`). This file exists only so every
 * existing `import { DataBand } from './DataBand'` /
 * `from '../../components/tonight/DataBand'` across the app (including
 * both `SpotDetailScreen` variants) keeps working unchanged.
 */
export { DataBand, type DataBandItem, type DataBandProps } from '../../../design-system/components/DataBand';
