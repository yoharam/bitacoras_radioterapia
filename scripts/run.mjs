import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { freePort } from './ports.mjs';
import { randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(`${root}.env`)) loadEnvFile(`${root}.env`);
const mode = ['start', 'build'].includes(process.argv[2]) ? process.argv[2] : 'dev';
process.env.NODE_ENV = mode === 'dev' ? 'development' : 'production';
process.env.API_PORT ||= '4100';
process.env.WEB_PORT ||= '3100';
process.env.WEB_HOST ||= '0.0.0.0';
process.env.APP_ORIGIN ||= `http://192.168.38.250:${process.env.WEB_PORT}`;
process.env.API_URL ||= `http://127.0.0.1:${process.env.API_PORT}`;
process.env.INTERNAL_API_PROXY_SECRET ||= randomBytes(32).toString('hex');

for (const value of [process.env.WEB_PORT, process.env.API_PORT]) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Configura los puertos entre 1024 y 65535.');
}
if (Number(process.env.WEB_PORT) === Number(process.env.API_PORT)) throw new Error('WEB_PORT y API_PORT deben ser distintos.');
const origin = new URL(process.env.APP_ORIGIN);
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || Number(origin.port || (origin.protocol === 'https:' ? 443 : 80)) !== Number(process.env.WEB_PORT)) throw new Error('APP_ORIGIN debe ser el origen del frontend y coincidir con WEB_PORT.');
process.env.APP_ORIGIN = origin.origin;

if (mode !== 'build') {
  const options = { strict: process.env.STRICT_PORTS === '1' };
  await freePort(Number(process.env.WEB_PORT), process.env.WEB_HOST, options);
  await freePort(Number(process.env.API_PORT), '127.0.0.1', options);
  process.env.API_URL = `http://127.0.0.1:${process.env.API_PORT}`;
  console.log(`\nAbre la aplicación en ${process.env.APP_ORIGIN}\nFrontend y backend se inician juntos. Ctrl+C detiene ambos.\n`);
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => child.kill('SIGTERM'));
  process.exitCode = code;
}
const commands = mode === 'build'
  ? [{ cwd: `${root}frontend`, args: [`${root}frontend/node_modules/next/dist/bin/next`, 'build', '--webpack'] }]
  : [{ cwd: root, args: [...(mode === 'dev' ? ['--watch'] : []), `${root}backend/src/server.js`] }, { cwd: `${root}frontend`, args: [`${root}frontend/node_modules/next/dist/bin/next`, mode, '--hostname', process.env.WEB_HOST, '--port', process.env.WEB_PORT] }];
for (const command of commands) {
  const child = spawn(process.execPath, command.args, { cwd: command.cwd, env: process.env, stdio: 'inherit' });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
