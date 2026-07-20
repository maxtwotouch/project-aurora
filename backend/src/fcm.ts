import { createSign } from 'node:crypto';

import type { Clock, FetchLike } from './sources.js';
import { fetchWithTimeout, formatOsloTimeRange } from './sources.js';

/**
 * FCM (Firebase Cloud Messaging) HTTP v1 topic publisher.
 *
 * PRIVACY INVARIANT: every message this module sends is addressed to a
 * threshold-tier TOPIC (see alerts.ts's ALERT_TIERS, e.g. "alerts-ge70"),
 * never to an individual device/registration token. This backend never
 * requests, receives, or stores a device token, push-permission state, or
 * any other device/user identifier -- Google's FCM servers hold the
 * device<->topic subscription mapping, not us. This is the whole point of
 * Option B in docs/design-aurora-alerts.md section 2: "no person-identifying
 * data in our storage" is structurally true here, not policy discipline
 * alone. Every message payload is data-only (never any user-provided field),
 * so there is nothing to check per-message for PII beyond keeping this file
 * itself token-free -- see the "NO device tokens anywhere in any payload"
 * test in test/alerts.test.ts.
 *
 * No new npm dependency (google-auth-library etc. is NOT used): the OAuth2
 * service-account flow is implemented directly with node:crypto (RS256 JWT
 * signing) and a token exchange against oauth2.googleapis.com, per the task
 * brief. This is the standard "self-signed JWT -> Google's token endpoint"
 * pattern Google's own client libraries use internally.
 *
 * iOS BACKGROUND/KILLED DELIVERY (found during PR beta review): a data-only
 * FCM message (the `data` block below) does not wake a backgrounded or
 * killed iOS app -- Apple only guarantees delivery/wake for a message that
 * carries a native `aps.alert`. Android and any foreground app (either OS)
 * are unaffected; they already compose their own notification from `data`
 * (see origin/feat/alerts-client's src/notifications/alertsClient.ts,
 * unmerged PR #52). So every published message now ALSO carries an `apns`
 * block whose `aps.alert` uses `title-loc-key`/`loc-key`/`loc-args` (never
 * literal title/body text): this tells iOS to render the notification from
 * the ALERT_TITLE_<TIER>/ALERT_BODY_<TIER> entries in the app bundle's own
 * Localizable.strings (see plugins/withAlertLocalizableStrings.js),
 * substituted with `loc-args` positionally -- entirely on-device, and
 * correctly localized by the DEVICE's language rather than anything this
 * backend could guess. `android: { priority: 'high' }` is also added
 * alongside, for timely (not battery-deferred) delivery of the underlying
 * data message on Android -- see buildAndroidConfig/buildApnsAlert below.
 * Both blocks are built ONLY from the same public, already-`data`-payload
 * fields (spotName, the Oslo-local best-window time range) -- see the
 * PRIVACY INVARIANT paragraph above/below, which now also covers these two
 * blocks: neither ever carries a device token, registration id, or any
 * other identifier, and test/alerts.test.ts's privacy-invariant scan covers
 * the full message body, not just `data`.
 *
 * Config (env vars, both required together -- see backend/README.md /
 * backend/.env.example / docs/deploying.md):
 *   FCM_PROJECT_ID      Firebase project id (message target:
 *                       projects/{FCM_PROJECT_ID}/messages:send).
 *   FCM_SERVICE_ACCOUNT The Firebase service account key, as a single JSON
 *                       string (NOT a file path). Chosen over a
 *                       path-to-a-json-file because the deploy target (Fly,
 *                       see fly.toml) sets secrets as plain env var values
 *                       (`flyctl secrets set`), which can't easily mount a
 *                       file without an extra volume -- see
 *                       docs/setup-firebase-alerts.md. The value is the
 *                       exact JSON Firebase gives you when you generate a
 *                       key (Project settings -> Service accounts ->
 *                       Generate new private key); no re-encoding needed.
 * When either is unset, this module is INERT: publishToTopic() logs one
 * info line ("alerts engine active, publisher unconfigured") the first time
 * it is called and returns { ok: false, skipped: 'unconfigured' } without
 * making any network call -- alerts.ts's evaluation/state logic runs
 * unaffected either way.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_TTL_SEC = 3600;
// Refresh the cached OAuth2 token slightly before it actually expires, so a
// publish call never races an expiry that happens mid-request.
const TOKEN_REFRESH_SKEW_MS = 60_000;

export type FcmServiceAccount = {
  project_id?: string;
  client_email: string;
  private_key: string;
};

export type FcmConfig = {
  projectId: string;
  serviceAccount: FcmServiceAccount;
};

/** Parses FCM_PROJECT_ID / FCM_SERVICE_ACCOUNT from `env`. Returns null (not
 * a throw) for any missing/malformed input -- callers treat that as "the
 * publisher is unconfigured/inert", never a startup failure (the whole
 * feature must be safe to deploy unfunded, per the task brief). */
export function loadFcmConfig(env: NodeJS.ProcessEnv = process.env): FcmConfig | null {
  const projectId = env.FCM_PROJECT_ID;
  const raw = env.FCM_SERVICE_ACCOUNT;
  if (!projectId || !raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<FcmServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') {
      return null;
    }
    return { projectId, serviceAccount: parsed as FcmServiceAccount };
  } catch {
    return null;
  }
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Builds a self-signed RS256 JWT asserting the service account's identity to
 * Google's OAuth2 token endpoint (the standard "JWT bearer token" grant --
 * see https://developers.google.com/identity/protocols/oauth2/service-account).
 * Header/claims fields only; the signature itself is verified by Google, not
 * tested here (see test/alerts.test.ts's "JWT assembly sanity" test, which
 * checks structure/fields, not signature validity).
 */
export function buildServiceAccountJwt(serviceAccount: FcmServiceAccount, now: Clock = Date.now): string {
  const nowSec = Math.floor(now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_SEC
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(serviceAccount.private_key);
  return `${signingInput}.${base64url(signature)}`;
}

// Single module-level cache (not keyed by project/service-account): this
// assumes single-tenant, boot-time-fixed FCM config (one FCM_PROJECT_ID /
// FCM_SERVICE_ACCOUNT per running process, per the env-var loading in
// loadFcmConfig above) -- it would need to become a map keyed by project id
// if this backend ever published to more than one Firebase project at once.
let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

/** Test-only hook: clears the module-level access-token cache and the
 * "logged inert once" flag, so each test file starts from a clean slate. */
export function resetFcmStateForTests(): void {
  cachedToken = null;
  loggedInert = false;
}

async function getAccessToken(serviceAccount: FcmServiceAccount, fetchImpl: FetchLike, now: Clock): Promise<string> {
  const nowMs = now();
  if (cachedToken && cachedToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS > nowMs) {
    return cachedToken.accessToken;
  }

  const jwt = buildServiceAccountJwt(serviceAccount, now);
  const response = await fetchWithTimeout(fetchImpl, TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString()
  });

  if (!response.ok) {
    throw new Error(`FCM OAuth2 token exchange failed (${response.status})`);
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error('FCM OAuth2 token exchange returned no access_token.');
  }

  cachedToken = {
    accessToken: payload.access_token,
    expiresAtMs: nowMs + (payload.expires_in ?? TOKEN_TTL_SEC) * 1000
  };

  return cachedToken.accessToken;
}

export type PublishOutcome = { ok: boolean; skipped?: 'unconfigured'; status?: number };

let loggedInert = false;

export type PublishOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  now?: Clock;
  logger?: { info: (message: string) => void };
};

// --- iOS native-alert / Android priority augmentation --------------------
// See this file's header comment ("iOS BACKGROUND/KILLED DELIVERY") for why
// these exist. Both are derived ONLY from `topic` (a fixed, backend-owned
// string -- never client input) and the same public `data` fields already
// sent (spotName, bestWindowStart/End) -- no new data source, no device
// identifier of any kind.

const TOPIC_TIER_PATTERN = /^alerts-(ge\d+)$/i;

/** `alerts-ge70` -> `GE70`, `alerts-ge45` -> `GE45`, anything else -> null.
 * Matches backend/src/alerts.ts's ALERT_TIERS[].topic naming exactly (kept
 * as a regex here, rather than importing alerts.ts's ALERT_TIERS, to avoid
 * a circular import -- alerts.ts already imports this module). */
function tierSuffixForTopic(topic: string): string | null {
  const match = TOPIC_TIER_PATTERN.exec(topic);
  return match ? match[1].toUpperCase() : null;
}

export type ApnsAlertPayload = {
  payload: {
    aps: {
      alert: { 'title-loc-key': string; 'loc-key': string; 'loc-args': [string, string] };
      sound: string;
    };
  };
};

/**
 * Builds the native APNs `alert` block for a topic + this message's `data`
 * payload, or `null` when the topic isn't a recognized alert tier or `data`
 * is missing a field it needs (spotName, best-window start/end) -- e.g. a
 * caller publishing something other than alerts.ts's AlertFireEvent.data.
 * Never throws: a `null` result just means this message stays data-only
 * (Android and any foreground app are unaffected either way; iOS
 * background/killed simply won't wake for it, the same limitation as
 * before this change) rather than failing the whole publish over a
 * malformed/unexpected payload.
 *
 * `loc-args` is exactly `[spotName, bestWindowLocalTimeRange]` -- no score,
 * unlike the client's own richer data-driven render (PR #52,
 * src/notifications/alertsClient.ts's composeAlertNotification) -- APNs'
 * native alert path only ever substitutes `loc-args` into the bundle's
 * Localizable.strings templates (see plugins/withAlertLocalizableStrings.js
 * for the ALERT_TITLE_<TIER>/ALERT_BODY_<TIER> string tables those keys
 * name), it does not compose arbitrary text server-side.
 */
export function buildApnsAlert(topic: string, data: Record<string, string>): ApnsAlertPayload | null {
  const tierSuffix = tierSuffixForTopic(topic);
  if (!tierSuffix) return null;

  const spotName = data.spotName;
  const start = data.bestWindowStart;
  const end = data.bestWindowEnd;
  if (!spotName || !start || !end) return null;

  const timeRange = formatOsloTimeRange(start, end);
  if (!timeRange) return null;

  return {
    payload: {
      aps: {
        alert: {
          'title-loc-key': `ALERT_TITLE_${tierSuffix}`,
          'loc-key': `ALERT_BODY_${tierSuffix}`,
          'loc-args': [spotName, timeRange]
        },
        sound: 'default'
      }
    }
  };
}

export type AndroidMessageConfig = { priority: 'high' | 'normal' };

/** FCM HTTP v1's AndroidConfig.priority field: a lowercase string enum
 * ("normal" | "high"), per
 * https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages#androidconfig
 * -- not the uppercase Java/Kotlin enum constant names. `high` requests
 * timely (not battery-deferred) delivery of the underlying data message;
 * Android composes its own notification from `data` regardless (PR #52),
 * this just controls how promptly FCM/the device attempts that delivery. */
function buildAndroidConfig(): AndroidMessageConfig {
  return { priority: 'high' };
}

/**
 * Publishes a message to an FCM topic. `data` values must all be strings
 * (FCM's HTTP v1 `data` payload requirement) and stay unchanged by this
 * function -- the message additionally carries an `apns` native-alert block
 * (when recognized, see buildApnsAlert) and an `android: { priority: 'high'
 * }` block, both derived only from `topic`/`data`, never anything new. See
 * this file's header comment for the inert-when-unconfigured behavior and
 * the privacy invariant (topic only, never a device token, in `data` or in
 * these two additional blocks).
 */
export async function publishToTopic(
  topic: string,
  data: Record<string, string>,
  options: PublishOptions = {}
): Promise<PublishOutcome> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const logger = options.logger ?? console;

  const config = loadFcmConfig(env);
  if (!config) {
    if (!loggedInert) {
      loggedInert = true;
      logger.info('alerts engine active, publisher unconfigured');
    }
    return { ok: false, skipped: 'unconfigured' };
  }

  const accessToken = await getAccessToken(config.serviceAccount, fetchImpl, now);

  const apnsAlert = buildApnsAlert(topic, data);
  const message: Record<string, unknown> = {
    topic,
    data,
    android: buildAndroidConfig(),
    ...(apnsAlert ? { apns: apnsAlert } : {})
  };

  const response = await fetchWithTimeout(fetchImpl, `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    // message: { topic, data, android, apns? } -- topic-only addressing.
    // Never `token`, `condition` (which can encode token-derived state), or
    // any field sourced from a client request; see this file's header.
    body: JSON.stringify({ message })
  });

  return { ok: response.ok, status: response.status };
}
