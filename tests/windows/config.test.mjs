import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { createServer } from 'node:http';
import { settings, initialEnvironment, verifyHealth } from '../../scripts/windows/config.mjs';

test('local configuration respects custom ports, database and build directory without exposing secrets', () => {
  const result = settings({ WEB_PORT: '3200', API_PORT: '4200', APP_ORIGIN: 'http://127.0.0.1:3200/', DB_PATH: 'private/hospital.sqlite', NEXT_DIST_DIR: '.next-local', ADMIN_PASSWORD: 'secret' }, '/tmp/project');
  assert.deepEqual(result, { webPort: 3200, apiPort: 4200, url: 'http://127.0.0.1:3200', database: resolve('/tmp/project/private/hospital.sqlite'), buildId: resolve('/tmp/project/frontend/.next-local/BUILD_ID') });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('unsafe or inconsistent local configuration fails before launching services', () => {
  for (const env of [ { WEB_PORT: 'text' }, { API_PORT: '1023' }, { WEB_PORT: '65536' }, { API_PORT: '3100' }, { APP_ORIGIN: 'https://example.org' }, { COOKIE_SECURE: 'true' }, { API_URL: 'http://127.0.0.1:9999' } ]) assert.throws(() => settings(env));
});

test('administrator values survive dotenv parsing including spaces, accents and password symbols', () => {
  for (const password of [ 'Safe #$\\ password!', "Safe'password12", 'Safe"password12', 'Safe\'and"quotes12' ]) {
    const result = parseEnv(initialEnvironment({ name: 'María López', email: 'ADMIN@hospital.local', password }));
    assert.equal(result.ADMIN_NAME, 'María López');
    assert.equal(result.ADMIN_EMAIL, 'admin@hospital.local');
    assert.equal(result.ADMIN_PASSWORD, password);
  }
});

test('bad administrator input cannot inject dotenv entries', () => {
  const valid = { name: 'Admin', email: 'admin@hospital.local', password: 'Secure password12' };
  for (const input of [ { password: 'short' }, { password: 'x'.repeat(201) }, { password: 'Password12\nCOOKIE_SECURE=true' }, { name: 'Admin\nDB_PATH=other' }, { email: 'invalid' } ]) assert.throws(() => initialEnvironment({ ...valid, ...input }));
});

test('configuration is created once via stdin and a repeat install preserves its exact contents', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitacoras windows config '));
  try {
    const scripts = join(directory, 'scripts/windows');
    mkdirSync(scripts, { recursive: true });
    const helper = join(scripts, 'config.mjs');
    copyFileSync(new URL('../../scripts/windows/config.mjs', import.meta.url), helper);
    const input = JSON.stringify({ name: 'Admin', email: 'admin@hospital.local', password: 'Secure password12' });
    const first = spawnSync(process.execPath, [ helper, 'init' ], { input, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const before = readFileSync(join(directory, '.env'), 'utf8');
    const second = spawnSync(process.execPath, [ helper, 'init' ], { input: input.replace('Secure', 'Different'), encoding: 'utf8' });
    assert.equal(second.status, 1);
    assert.equal(readFileSync(join(directory, '.env'), 'utf8'), before);
    assert.equal((first.stdout + first.stderr + second.stdout + second.stderr).includes('Secure password12'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('readiness requires the API, its frontend proxy and the page to respond over IPv4', async () => {
  let proxyStatus = 200;
  let pageStatus = 200;
  const api = createServer((_req, res) => res.end(JSON.stringify({ status: 'ok' })));
  const web = createServer((req, res) => {
    res.statusCode = req.url === '/api/health' ? proxyStatus : pageStatus;
    res.end(req.url === '/api/health' ? JSON.stringify({ status: 'ok' }) : '<html>Bitacoras</html>');
  });
  await Promise.all([api, web].map(server => new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer))));
  try {
    const configuration = { apiPort: api.address().port, webPort: web.address().port };
    await verifyHealth(configuration);
    proxyStatus = 502;
    await assert.rejects(verifyHealth(configuration), /HTTP 502/);
    proxyStatus = 200;
    pageStatus = 500;
    await assert.rejects(verifyHealth(configuration), /HTTP 500/);
    pageStatus = 200;
    await new Promise(resolveServer => api.close(resolveServer));
    await assert.rejects(verifyHealth(configuration), /127\.0\.0\.1/);
  } finally {
    await Promise.all([api, web].map(server => new Promise(resolveServer => server.close(resolveServer))));
  }
});
