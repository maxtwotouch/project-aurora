/**
 * Pure, framework-free decision logic for analytics consent + the usage
 * event queue. Deliberately has NO react-native / AsyncStorage / fetch
 * imports so it can be loaded and unit-tested directly under plain Node
 * (see test/analytics-core.test.ts at the repo root).
 *
 * consent.ts and events.ts are thin wrappers around this module: they own
 * the RN-bound bits (AsyncStorage/localStorage via ../lib/storage, AppState,
 * fetch, timers) and call into these pure functions for every decision.
 * This is a behavior-preserving extraction -- nothing here changes what the
 * app does, only where the decision logic lives.
 *
 * PRIVACY: this module never touches PII. It only ever moves around
 * `{ type, spotId }` event shapes and a three-state consent enum -- see the
 * invariants documented in consent.ts and events.ts.
 */

/**
 * Opt-in consent for anonymous usage instrumentation.
 *
 * PRIVACY INVARIANT: 'unset' is the only default, and it is treated the
 * same as 'declined' everywhere events are gated -- nothing is ever sent
 * unless this is exactly 'accepted'. Decline is a first-class, permanent
 * choice: it persists the same way accept does, and is never re-prompted
 * automatically.
 */
export type ConsentState = 'unset' | 'accepted' | 'declined';

/** Narrows a raw value read back from storage to a real persisted choice. */
export function isPersistedConsentState(value: string | null): value is 'accepted' | 'declined' {
  return value === 'accepted' || value === 'declined';
}

/**
 * Resolves what the in-memory consent state should become once the
 * persisted value has been read back from storage (or the read failed, in
 * which case the caller passes `null`). 'unset' is the only fallback --
 * anything that isn't a recognized persisted choice resolves to 'unset',
 * never to 'declined' or 'accepted' by accident.
 */
export function resolveLoadedConsentState(stored: string | null): ConsentState {
  return isPersistedConsentState(stored) ? stored : 'unset';
}

/**
 * Single "may we ever send data right now?" predicate, shared by every call
 * site that gates a flush. Fail-closed: only true when the persisted choice
 * has loaded AND is exactly 'accepted' AND the backend is configured (both
 * the feature flag and a base URL). Any one of those being false means no
 * flush happens.
 */
export type FlushGateInput = {
  loaded: boolean;
  consent: ConsentState;
  configured: boolean;
};

export function mayFlush(input: FlushGateInput): boolean {
  return input.loaded && input.consent === 'accepted' && input.configured;
}

// Small cap on events held while we don't yet know the persisted consent
// choice -- this only ever covers the first render or two right at app
// start, never a sustained backlog.
export const MAX_PENDING_BEFORE_LOAD = 10;
// Queue length that triggers an eager flush attempt (in addition to the
// periodic timer / app-backgrounding triggers).
export const MAX_QUEUE_SIZE_BEFORE_FLUSH = 10;
// Backend enforces a hard cap of 20 events per batch; staying at 10 keeps
// every flush comfortably under that regardless of how the queue built up.
export const MAX_BATCH_SIZE = 10;

export type BufferPendingResult<T> = {
  /** Whether the event was appended (false when the buffer was already full). */
  buffered: boolean;
  pendingBeforeLoad: T[];
};

/**
 * Decides whether an event that arrived before consent has loaded should be
 * buffered or dropped. The buffer is capped at MAX_PENDING_BEFORE_LOAD; once
 * full, further pre-load events are silently discarded rather than growing
 * the buffer unbounded.
 */
export function bufferPendingEvent<T>(pendingBeforeLoad: T[], event: T): BufferPendingResult<T> {
  if (pendingBeforeLoad.length >= MAX_PENDING_BEFORE_LOAD) {
    return { buffered: false, pendingBeforeLoad };
  }
  return { buffered: true, pendingBeforeLoad: [...pendingBeforeLoad, event] };
}

export type ResolvePendingResult<T> = {
  /** Always empty -- the pre-load buffer is cleared either way. */
  pendingBeforeLoad: T[];
  /** Events to append to the live send queue (empty unless resolved to 'accepted'). */
  promoted: T[];
};

/**
 * Resolves the pre-load buffer once the persisted consent choice is known.
 * Buffered events are promoted into the live queue only when consent
 * resolved to 'accepted'; for anything else (declined, or the
 * never-actually-persisted 'unset') they are dropped. The buffer itself is
 * always cleared regardless of outcome -- it must never be resolved twice.
 */
export function resolvePendingBeforeLoad<T>(
  pendingBeforeLoad: readonly T[],
  resolvedState: ConsentState
): ResolvePendingResult<T> {
  const promoted = resolvedState === 'accepted' ? [...pendingBeforeLoad] : [];
  return { pendingBeforeLoad: [], promoted };
}

export type QueuePushResult<T> = {
  queue: T[];
  /** True once the push crossed MAX_QUEUE_SIZE_BEFORE_FLUSH -- caller should flush. */
  shouldFlush: boolean;
};

/** Appends an event to the live send queue and reports whether the queue is now due for a flush. */
export function pushToQueue<T>(queue: readonly T[], event: T): QueuePushResult<T> {
  const next = [...queue, event];
  return { queue: next, shouldFlush: next.length >= MAX_QUEUE_SIZE_BEFORE_FLUSH };
}

export type BatchSplit<T> = {
  batch: T[];
  remaining: T[];
};

/**
 * Splits off the next outbound batch (capped at MAX_BATCH_SIZE), leaving
 * anything beyond that cap in the queue for a subsequent flush.
 */
export function takeNextBatch<T>(queue: readonly T[]): BatchSplit<T> {
  return { batch: queue.slice(0, MAX_BATCH_SIZE), remaining: queue.slice(MAX_BATCH_SIZE) };
}

/**
 * Consent was revoked (or reverted to 'unset', in principle) after events
 * were already queued: everything queued must be dropped, never sent.
 */
export function dropQueueOnRevoke<T>(): T[] {
  return [];
}

/**
 * Trip mode consent -- a SECOND, INDEPENDENT consent dimension (see
 * docs/design-trip-tracking.md section 6.2 / 8 decision #4). This is
 * distinct from ConsentState/isPersistedConsentState/
 * resolveLoadedConsentState above:
 *
 * - different storage key (aurora.tripModeConsent.v1, owned by
 *   ./tripModeConsent.ts -- never aurora.analyticsConsent.v1),
 * - different UI surface (a Settings-only toggle -- never the first-open
 *   ConsentModal),
 * - never inferred from, defaulted from, or written alongside the usage
 *   consent above.
 *
 * The underlying tri-state shape ('unset' | 'accepted' | 'declined') and
 * fail-closed defaulting rule are intentionally identical to usage
 * consent's (an unrecognized/missing persisted value always resolves to
 * 'unset', never 'accepted'), so the two dimensions behave predictably the
 * same way in isolation -- but they are two separate pieces of state, not
 * one. Toggling one must never read, write, or otherwise touch the other.
 *
 * No event emission or geofencing logic exists yet -- this only models the
 * consent choice itself (docs/design-trip-tracking.md ship gate 6.2, which
 * must ship before any collection code).
 */
export type TripModeConsentState = 'unset' | 'accepted' | 'declined';

/** Narrows a raw value read back from storage to a real persisted trip-mode choice. */
export function isPersistedTripModeConsentState(value: string | null): value is 'accepted' | 'declined' {
  return value === 'accepted' || value === 'declined';
}

/**
 * Resolves what the in-memory trip-mode consent state should become once
 * the persisted value has been read back from storage (or the read failed,
 * in which case the caller passes `null`). 'unset' is the only fallback.
 */
export function resolveLoadedTripModeConsentState(stored: string | null): TripModeConsentState {
  return isPersistedTripModeConsentState(stored) ? stored : 'unset';
}

/**
 * Person-level product analytics consent -- a THIRD, INDEPENDENT consent
 * dimension (see docs/analytics-pivot.md sections 2 and 4, PR 2 of the
 * analytics pivot). Distinct from both ConsentState (aggregate usage
 * counters, above) and TripModeConsentState (above):
 *
 * - different storage key (aurora.personalAnalyticsConsent.v1, owned by
 *   ./personalAnalyticsConsent.ts -- never aurora.analyticsConsent.v1 or
 *   aurora.tripModeConsent.v1),
 * - different UI surface: a SECOND, separately-actioned question in the
 *   first-open consent flow (see ConsentGate/ConsentModal) in addition to a
 *   Settings-only toggle (PersonalAnalyticsToggle) for changing the choice
 *   later,
 * - never inferred from, defaulted from, or written alongside either of the
 *   other two dimensions.
 *
 * Re-consent: this dimension is entirely new and defaults to 'unset' for
 * every install -- including people who already answered the aggregate
 * usage-counter question above. That default is what implements "everyone
 * re-consents" for the new scope (docs/analytics-pivot.md section 2.2):
 * nobody's prior acceptance of the aggregate pipeline carries over to this
 * one, because this dimension has no prior persisted value to read for
 * anyone.
 *
 * The underlying tri-state shape ('unset' | 'accepted' | 'declined') and
 * fail-closed defaulting rule are intentionally identical to the other two
 * dimensions' (an unrecognized/missing persisted value always resolves to
 * 'unset', never 'accepted'), so all three behave predictably the same way
 * in isolation -- but they are three separate pieces of state, not one.
 * Toggling any one must never read, write, or otherwise touch the other two.
 *
 * No SDK, no network calls, and no event emission exist yet -- this only
 * models the consent choice itself. Per docs/analytics-pivot.md section 4,
 * the PostHog SDK integration is a later, separately reviewed PR (PR 3);
 * until it ships, this consent state has no observable effect beyond what
 * is stored on-device.
 */
export type PersonalAnalyticsConsentState = 'unset' | 'accepted' | 'declined';

/** Narrows a raw value read back from storage to a real persisted personal-analytics choice. */
export function isPersistedPersonalAnalyticsConsentState(
  value: string | null
): value is 'accepted' | 'declined' {
  return value === 'accepted' || value === 'declined';
}

/**
 * Resolves what the in-memory personal-analytics consent state should
 * become once the persisted value has been read back from storage (or the
 * read failed, in which case the caller passes `null`). 'unset' is the only
 * fallback.
 */
export function resolveLoadedPersonalAnalyticsConsentState(stored: string | null): PersonalAnalyticsConsentState {
  return isPersistedPersonalAnalyticsConsentState(stored) ? stored : 'unset';
}

/**
 * PostHog SDK lifecycle + the fixed event allowlist -- pure decision logic
 * only (see docs/analytics-pivot.md section 3 and CLAUDE.md's "Privacy &
 * legal guardrails"). The RN-bound wrappers around these functions live in
 * ./posthog.ts (client construction/teardown) and ./personalAnalytics.ts
 * (the `captureAllowed` wrapper every call site uses instead of the raw
 * SDK) -- neither of those files can be loaded under plain node:test
 * because they import posthog-react-native / react-native, so every
 * consent-gating and allowlist decision they make is expressed here first
 * and unit-tested directly (see test/analytics-core.test.ts).
 *
 * HARD CONTRACT (docs/analytics-pivot.md section 3 / CLAUDE.md): the SDK
 * must not be constructed -- not even loaded -- until personal-analytics
 * consent is exactly 'accepted', because construction itself triggers a
 * network call (PostHog fetches remote config/flags on init). "Configured
 * but not yet consented" must therefore behave identically to "not
 * configured at all": zero bytes leave the device.
 */

/** The complete, fixed set of event names this app is ever allowed to send to PostHog. */
export const PERSONAL_ANALYTICS_EVENT_ALLOWLIST = [
  'app_open',
  'screen_view',
  'spot_view',
  'navigate_pressed',
  'spot_shared',
  'alerts_opt_in',
  'language_set',
  'trip_mode_toggled'
] as const;

export type PersonalAnalyticsEventName = (typeof PERSONAL_ANALYTICS_EVENT_ALLOWLIST)[number];

/** Narrows an arbitrary event-name string to one of the fixed allowlist members. */
export function isAllowedPersonalAnalyticsEvent(event: string): event is PersonalAnalyticsEventName {
  return (PERSONAL_ANALYTICS_EVENT_ALLOWLIST as readonly string[]).includes(event);
}

export type PersonalAnalyticsSendGateInput = {
  consent: PersonalAnalyticsConsentState;
  /** Whether a PostHog client instance currently exists (construction is itself consent-gated -- see below). */
  clientReady: boolean;
  event: string;
};

/**
 * Single "may we send this personal-analytics event right now?" predicate,
 * shared by every call site via ./personalAnalytics.ts's `captureAllowed`.
 * Fail-closed: true only when consent is exactly 'accepted', a client
 * instance currently exists, and the event name is one of the fixed eight.
 * Every one of those three failing independently must produce the same
 * silent no-op -- there is no partial-send state.
 */
export function mayCapturePersonalAnalyticsEvent(input: PersonalAnalyticsSendGateInput): boolean {
  return input.consent === 'accepted' && input.clientReady && isAllowedPersonalAnalyticsEvent(input.event);
}

export type PersonalAnalyticsClientLifecycleInput = {
  consent: PersonalAnalyticsConsentState;
  /** Whether POSTHOG_PROJECT_TOKEN + POSTHOG_HOST are both present (see app.config.js's `extra`). */
  configured: boolean;
};

export type PersonalAnalyticsClientAction = 'construct' | 'teardown' | 'none';

/**
 * Decides what should happen to the (at most one) PostHog client instance
 * given the current consent state and whether a config was already
 * constructed for a previous state. This is the pure heart of the
 * consent-gated singleton in ./posthog.ts:
 *
 * - 'construct': consent is exactly 'accepted', config is present, and no
 *   instance exists yet -- construct one now (this is the ONLY path that
 *   is ever allowed to call `new PostHog(...)`, and it can only be reached
 *   after consent is 'accepted').
 * - 'teardown': an instance exists but consent is no longer 'accepted'
 *   (withdrawal after prior acceptance, or consent unexpectedly reverting
 *   to 'unset') -- the caller must optOut() + reset() the instance and
 *   drop the reference, per docs/analytics-pivot.md section 2.3.
 * - 'none': nothing to do -- either already in the right state (no
 *   instance + not accepted, or an instance already exists + still
 *   accepted), or accepted but not configured (stays disabled, silently,
 *   per the missing-config contract in ./posthog.ts).
 */
export function resolvePersonalAnalyticsClientAction(
  input: PersonalAnalyticsClientLifecycleInput,
  hasInstance: boolean
): PersonalAnalyticsClientAction {
  if (input.consent === 'accepted' && input.configured && !hasInstance) return 'construct';
  if (input.consent !== 'accepted' && hasInstance) return 'teardown';
  return 'none';
}
