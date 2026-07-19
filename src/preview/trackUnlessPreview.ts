import { track } from '../analytics/events';
import type { UsageEventType } from '../analytics/events';
import { isPreviewModeOn } from './previewMode';

/**
 * Drop-in replacement for `track()` at call sites (MapScreen.native/web,
 * SpotDetailScreen.native/web) that suppresses the event while design-preview
 * mode is on.
 *
 * Rationale: navigation/spot-view interest recorded while the app is showing
 * hand-crafted sample data (see src/data/sampleForecast.ts) isn't real user
 * interest in a spot -- sending it would pollute the municipality-facing
 * usage dataset with fictional signal. src/analytics/* is CODEOWNERS/PR-
 * protected and out of scope for this change, so the gate lives here, one
 * layer above it, rather than inside track() itself -- this module owns
 * nothing about consent or queuing, it only decides whether to forward the
 * call at all.
 */
export function trackUnlessPreview(type: UsageEventType, spotId: string): void {
  if (isPreviewModeOn()) return;
  track(type, spotId);
}
