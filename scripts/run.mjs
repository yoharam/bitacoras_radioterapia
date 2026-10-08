import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(`${root}.env`)) loadEnvFile(`${root}.env`);
const mode = ['start', 'build'].includes(process.argv[2]) ? process.argv[2] : 'dev';
process.env.NODE_ENV = mode === 'dev' ? 'development' : 'production';
process.env.API_PORT ||= '4100';
process.env.WEB_PORT ||= '3100';
process.env.APP_ORIGIN ||= `http://localhost:${process.env.WEB_PORT}`;
process.env.API_URL ||= `http://127.0.0.1:${process.env.API_PORT}`;

async function availablePort(preferred) {
  const first = Number(preferred);
  if (!Number.isInteger(first) || first < 1024 || first > 65515) throw new Error('Configura los puertos entre 1024 y 65515.');
  for (let port = first; port < first + 20; port++) {
    const free = await new Promise((resolve, reject) => {
      const probe = createServer();
      probe.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (free) return String(port);
    if (process.env.STRICT_PORTS === '1') throw new Error(`El puerto ${port} está ocupado.`);
  }
  throw new Error(`No hay puertos disponibles a partir de ${first}.`);
}

if (mode === 'dev') {
  const requestedWebPort = process.env.WEB_PORT;
  const requestedApiPort = process.env.API_PORT;
  process.env.WEB_PORT = await availablePort(requestedWebPort);
  process.env.API_PORT = await availablePort(requestedApiPort);
  if (process.env.WEB_PORT === process.env.API_PORT) process.env.API_PORT = await availablePort(Number(process.env.API_PORT) + 1);
  if (process.env.WEB_PORT !== requestedWebPort) console.log(`El puerto ${requestedWebPort} está ocupado; el frontend usará ${process.env.WEB_PORT}.`);
  if (process.env.API_PORT !== requestedApiPort) console.log(`El puerto ${requestedApiPort} está ocupado; el backend usará ${process.env.API_PORT}.`);
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(process.env.APP_ORIGIN)) process.env.APP_ORIGIN = `http://localhost:${process.env.WEB_PORT}`;
  process.env.API_URL = `http://127.0.0.1:${process.env.API_PORT}`;
  console.log(`\nAbre la aplicación en http://localhost:${process.env.WEB_PORT}\nFrontend y backend se inician juntos. Ctrl+C detiene ambos.\n`);
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
  : [{ cwd: root, args: [...(mode === 'dev' ? ['--watch'] : []), `${root}backend/src/server.js`] }, { cwd: `${root}frontend`, args: [`${root}frontend/node_modules/next/dist/bin/next`, mode, '--hostname', '127.0.0.1', '--port', process.env.WEB_PORT] }];
for (const command of commands) {
  const child = spawn(process.execPath, command.args, { cwd: command.cwd, env: process.env, stdio: 'inherit' });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
