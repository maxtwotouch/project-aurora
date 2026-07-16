/**
 * Centralized, fail-fast environment parsing for the backend's HTTP surface
 * (server.ts). Parsed once at module load, from `process.env`, mirroring the
 * module-scope constants server.ts used to compute directly.
 *
 * Scope note: `STALE_SNAPSHOT_MS` (store.ts) and `SOURCE_TIMEOUT_MS`
 * (sources.ts) are deliberately NOT read here. Those two are looked up
 * per-call in their own modules (not cached at import time) so tests can
 * mutate `process.env` between calls -- see `test/sources-timeout.test.ts`.
 * Moving them here would freeze their value at import time and break that
 * pattern. They keep their existing "invalid/missing -> silent documented
 * default" behavior; only the config below fails fast.
 */

export type AppConfig = {
  port: number;
  host: string;
  refreshMs: number;
  adminToken: string;
  corsOrigins: string[];
};

const DEFAULT_PORT = 8080;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_REFRESH_MS = 5 * 60 * 1000;
const DEFAULT_CORS_ORIGINS = ['http://localhost:8081', 'http://127.0.0.1:8081'];
const MIN_PORT = 1;
const MAX_PORT = 65535;

function isBlank(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === '';
}

function parsePort(raw: string | undefined): number {
  if (isBlank(raw)) return DEFAULT_PORT;

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < MIN_PORT || value > MAX_PORT) {
    throw new Error(`Invalid PORT: "${raw}" (must be an integer between ${MIN_PORT} and ${MAX_PORT}).`);
  }
  return value;
}

function parsePositiveMs(raw: string | undefined, fallback: number, name: string): number {
  if (isBlank(raw)) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: "${raw}" (must be a positive number of milliseconds).`);
  }
  return value;
}

function parseCorsOrigins(raw: string | undefined): string[] {
  if (isBlank(raw)) return DEFAULT_CORS_ORIGINS;

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Parses and validates the process env into an `AppConfig`, throwing a clear
 * error on clearly-invalid values (e.g. a non-numeric PORT) but falling back
 * to documented defaults for anything missing/blank. Does not mutate
 * `process.env` and has no side effects beyond a warn-level log when
 * `ADMIN_TOKEN` is unset. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = parsePort(env.PORT);
  const host = isBlank(env.HOST) ? DEFAULT_HOST : env.HOST.trim();
  const refreshMs = parsePositiveMs(env.REFRESH_MS, DEFAULT_REFRESH_MS, 'REFRESH_MS');
  const adminToken = env.ADMIN_TOKEN ?? '';
  const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);

  if (!adminToken) {
    console.warn(
      '[config] ADMIN_TOKEN is not set. POST /v1/admin/refresh (and any future admin/stats routes) will reject every request (fail closed) until it is configured.'
    );
  }

  return { port, host, refreshMs, adminToken, corsOrigins };
}

/** The process-wide config, parsed once at import time -- same timing as the
 * module-scope constants server.ts used to compute inline. */
export const config: AppConfig = loadConfig();
