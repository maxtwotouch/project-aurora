// Tests for the repo-wide IP-log redaction configured in buildApp()
// (backend/src/server.ts). PRIVACY INVARIANT under test: no route may ever
// log a caller's IP address, port, or headers -- Fastify's default request
// serializer would otherwise include remoteAddress/remotePort for every
// route (see fastify/lib/logger-pino.js), so buildApp() overrides the `req`
// (and, explicitly, `res`) serializers repo-wide.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let serverMod: typeof import('../src/server.js');
let tempDir: string;
let originalCwd: string;

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

before(async () => {
  originalCwd = process.cwd();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aurora-server-logging-test-'));
  process.chdir(tempDir);
  serverMod = await import('../src/server.js');
});

after(async () => {
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true, force: true });
});

// --- Unit-level: assert the serializer functions' output shape directly. ---

test('logSerializers.req exposes only method + url -- no IP, port, host, or headers', () => {
  const fakeRawRequest = {
    method: 'GET',
    url: '/v1/health',
    headers: { 'accept-version': '1.0.0', 'x-forwarded-for': '203.0.113.5' },
    host: 'example.com',
    ip: '203.0.113.5',
    socket: { remotePort: 54321 }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serialized = serverMod.logSerializers.req!(fakeRawRequest as any);

  assert.deepEqual(Object.keys(serialized).sort(), ['method', 'url']);
  assert.equal(serialized.method, 'GET');
  assert.equal(serialized.url, '/v1/health');
});

test('logSerializers.res exposes only statusCode', () => {
  const fakeReply = { statusCode: 204, someOtherField: 'should not leak through' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serialized = serverMod.logSerializers.res!(fakeReply as any);

  assert.deepEqual(Object.keys(serialized), ['statusCode']);
  assert.equal(serialized.statusCode, 204);
});

// --- Integration-level: boot a real app, capture the actual log stream,
// hit several routes, and grep the captured output. ---

test('booted app never logs remoteAddress/remotePort across several routes; method/url/status still present', async () => {
  const lines: string[] = [];
  const captureStream = {
    write(msg: string): boolean {
      lines.push(msg);
      return true;
    }
  };

  const app = serverMod.buildApp({ adminToken: '', loggerStream: captureStream });

  await app.inject({ method: 'GET', url: '/v1/health' });
  await app.inject({ method: 'GET', url: '/v1/tonight' });
  await app.inject({ method: 'GET', url: '/v1/spots/not-a-real-spot' });
  await app.inject({ method: 'POST', url: '/v1/admin/refresh', headers: { 'x-admin-token': 'anything' } });
  await app.close();

  assert.ok(lines.length > 0, 'expected at least one captured log line');

  const combined = lines.join('\n');
  assert.doesNotMatch(combined, /remoteAddress/i, 'no log line may mention remoteAddress');
  assert.doesNotMatch(combined, /remotePort/i, 'no log line may mention remotePort');

  const parsedLines = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  const requestLines = parsedLines.filter((entry) => entry.req);
  assert.ok(requestLines.length > 0, 'expected at least one request log line with a req field');
  for (const entry of requestLines) {
    const req = entry.req as Record<string, unknown>;
    assert.deepEqual(Object.keys(req).sort(), ['method', 'url']);
    assert.equal(typeof req.method, 'string');
    assert.equal(typeof req.url, 'string');
  }

  const responseLines = parsedLines.filter((entry) => entry.res);
  assert.ok(responseLines.length > 0, 'expected at least one response log line with a res field');
  for (const entry of responseLines) {
    const res = entry.res as Record<string, unknown>;
    assert.deepEqual(Object.keys(res).sort(), ['statusCode']);
    assert.equal(typeof res.statusCode, 'number');
  }
});
