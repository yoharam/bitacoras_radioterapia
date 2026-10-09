import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { freePort, portIsFree } from '../scripts/ports.mjs';
import { stopConfiguredPorts } from '../scripts/stop.mjs';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function listener(host = '0.0.0.0', ignoreTerm = false) {
  const child = spawn(process.execPath, ['-e', `
    const server = require('node:net').createServer();
    ${ignoreTerm ? "process.on('SIGTERM', () => {});" : ''}
    server.listen(0, ${JSON.stringify(host)}, () => process.send(server.address().port));
  `], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [port] = await once(child, 'message');
  return { child, port };
}

test('restart frees a LAN listener while leaving an unrelated port running', async () => {
  const occupied = await listener();
  const unrelated = await listener('127.0.0.1');
  try {
    assert.equal(await portIsFree(occupied.port, '0.0.0.0'), false);
    await freePort(occupied.port, '0.0.0.0');
    assert.equal(await portIsFree(occupied.port, '0.0.0.0'), true);
    assert.equal(await portIsFree(unrelated.port, '127.0.0.1'), false);
  } finally {
    occupied.child.kill('SIGKILL');
    unrelated.child.kill('SIGKILL');
  }
});

test('strict ports rejects a conflict without stopping its process', async () => {
  const { child, port } = await listener();
  try {
    await assert.rejects(freePort(port, '0.0.0.0', { strict: true }), /STRICT_PORTS/);
    assert.equal(await portIsFree(port, '0.0.0.0'), false);
  } finally { child.kill('SIGKILL'); }
});

test('restart forces termination when a listener ignores SIGTERM', { skip: process.platform === 'win32' }, async () => {
  const { child, port } = await listener('127.0.0.1', true);
  try {
    await freePort(port, '127.0.0.1');
    assert.equal(await portIsFree(port, '127.0.0.1'), true);
  } finally { child.kill('SIGKILL'); }
});

test('stop validates all configured ports before stopping either service', async () => {
  const { child, port } = await listener();
  try {
    await assert.rejects(stopConfiguredPorts({ WEB_PORT: String(port), API_PORT: 'invalid' }), /Configura los puertos/);
    assert.equal(await portIsFree(port), false);
  } finally { child.kill('SIGKILL'); }
});

test('stop command reads its project env from any directory, frees both ports and is repeatable', async () => {
  const web = await listener();
  const api = await listener('127.0.0.1');
  const unrelated = await listener();
  const directory = mkdtempSync(join(tmpdir(), 'bitacoras stop '));
  try {
    mkdirSync(join(directory, 'scripts'));
    for (const name of ['stop.mjs', 'ports.mjs']) copyFileSync(new URL(`../scripts/${name}`, import.meta.url), join(directory, 'scripts', name));
    writeFileSync(join(directory, '.env'), `WEB_PORT=${web.port}\nAPI_PORT=${api.port}\nSTRICT_PORTS=1\nAPP_ORIGIN=invalid\n`);
    const env = { ...process.env };
    delete env.WEB_PORT;
    delete env.API_PORT;
    for (let attempt = 0; attempt < 2; attempt++) {
      const child = spawn(process.execPath, [join(directory, 'scripts/stop.mjs')], { cwd: tmpdir(), env, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      const [code] = await once(child, 'exit');
      assert.equal(code, 0, output);
      assert.match(output, /La aplicación quedó detenida/);
      assert.equal(await portIsFree(web.port), true);
      assert.equal(await portIsFree(api.port), true);
      assert.equal(await portIsFree(unrelated.port), false);
    }
  } finally {
    for (const { child } of [web, api, unrelated]) child.kill('SIGKILL');
    rmSync(directory, { recursive: true, force: true });
  }
});
