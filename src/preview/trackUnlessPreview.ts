import { captureAllowed } from '../analytics/personalAnalytics';
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
 * usage dataset with fictional signal (and, since the same preview gate
 * applies here, the pseudonymous PostHog pipeline too). src/analytics/* is
 * CODEOWNERS/PR-protected and out of scope for this change, so the gate
 * lives here, one layer above it, rather than inside track() or
 * captureAllowed() themselves -- this module owns nothing about consent or
 * queuing for either pipeline, it only decides whether to forward the call
 * at all.
 *
 * `UsageEventType` ('spot_view' | 'navigate_pressed' | 'spot_shared') is
 * exactly a subset of the personal-analytics allowlist in
 * src/analytics/personalAnalytics.ts, and every one of those three events
 * takes the same `{ spot_id }` shape in both pipelines, so a single
 * `type`/`spotId` pair fans out to both `track()` (aggregate, identity-free)
 * and `captureAllowed()` (person-level, consent-gated) unchanged.
 */
export function trackUnlessPreview(type: UsageEventType, spotId: string): void {
  if (isPreviewModeOn()) return;
  track(type, spotId);
  captureAllowed(type, { spot_id: spotId });
}
