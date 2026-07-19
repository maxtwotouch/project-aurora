import { createSign } from 'node:crypto';

import type { Clock, FetchLike } from './sources.js';
import { fetchWithTimeout } from './sources.js';

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

/**
 * Publishes a data-only message to an FCM topic. `data` values must all be
 * strings (FCM's HTTP v1 `data` payload requirement). See this file's header
 * comment for the inert-when-unconfigured behavior and the privacy
 * invariant (topic only, never a device token).
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

  const response = await fetchWithTimeout(fetchImpl, `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    // message: { topic, data } -- topic-only addressing, data-only payload.
    // Never `token`, `condition` (which can encode token-derived state), or
    // any field sourced from a client request; see this file's header.
    body: JSON.stringify({ message: { topic, data } })
  });

  return { ok: response.ok, status: response.status };
}
