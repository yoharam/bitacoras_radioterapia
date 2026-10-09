import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { get } from 'node:http';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function settings(env, root = projectRoot) {
  const port = (value, fallback) => {
    const result = Number(value || fallback);
    if (!Number.isInteger(result) || result < 1024 || result > 65535) throw new Error('Configura puertos entre 1024 y 65535.');
    return result;
  };
  const webPort = port(env.WEB_PORT, 3100);
  const apiPort = port(env.API_PORT, 4100);
  if (webPort === apiPort) throw new Error('WEB_PORT y API_PORT deben ser distintos.');
  const origin = env.APP_ORIGIN || `http://192.168.38.250:${webPort}`;
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== 'http:' || Number(parsedOrigin.port || 80) !== webPort || parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== '/' || parsedOrigin.search || parsedOrigin.hash || ['0.0.0.0', '[::]'].includes(parsedOrigin.hostname)) throw new Error('APP_ORIGIN debe coincidir con el puerto web y usar HTTP local o LAN.');
  if (env.COOKIE_SECURE && env.COOKIE_SECURE !== 'false') throw new Error('Usa COOKIE_SECURE=false para HTTP local.');
  if (env.API_URL && env.API_URL !== `http://127.0.0.1:${apiPort}`) throw new Error('API_URL debe coincidir con API_PORT.');
  const buildDir = resolve(root, 'frontend', env.NEXT_DIST_DIR || '.next');
  return { webPort, apiPort, url: origin.replace(/\/$/, ''), database: resolve(root, env.DB_PATH || 'backend/data/bitacoras.sqlite'), buildId: resolve(buildDir, 'BUILD_ID') };
}

export function initialEnvironment({ name, email, password }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw new Error('Escribe un nombre de hasta 100 caracteres.');
  if (typeof email !== 'string' || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo valido.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new Error('La contrasena debe tener entre 12 y 200 caracteres.');
  const quote = value => {
    if (/[\r\n\0]/.test(value)) throw new Error('Los datos no pueden contener saltos de linea.');
    const delimiter = ["'", '"', '`'].find(mark => !value.includes(mark));
    if (!delimiter) throw new Error('Evita combinar los tres tipos de comillas en un mismo campo.');
    return `${delimiter}${value}${delimiter}`;
  };
  return `ADMIN_NAME=${quote(name.trim())}\nADMIN_EMAIL=${quote(email.trim().toLowerCase())}\nADMIN_PASSWORD=${quote(password)}\nWEB_PORT=3100\nAPI_PORT=4100\nWEB_HOST=0.0.0.0\nAPP_ORIGIN=http://192.168.38.250:3100\nCOOKIE_SECURE=false\n`;
}

export async function verifyHealth({ apiPort, webPort }) {
  const request = (url, json) => new Promise((resolveRequest, reject) => {
    const req = get(url, { signal: AbortSignal.timeout(2000) }, response => {
      response.on('error', reject);
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`${url}: HTTP ${response.statusCode}`)); return; }
      if (!json) { response.resume(); resolveRequest(); return; }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          if (JSON.parse(body).status !== 'ok') throw new Error('estado inesperado');
          resolveRequest();
        } catch { reject(new Error(`${url}: respuesta de API inesperada`)); }
      });
    });
    req.on('error', error => reject(new Error(`${url}: ${error.message}`)));
  });
  // Services bind IPv4. Direct HTTP avoids localhost IPv6 fallback and system proxies.
  await request(`http://127.0.0.1:${apiPort}/api/health`, true);
  await request(`http://127.0.0.1:${webPort}/api/health`, true);
  await request(`http://127.0.0.1:${webPort}/`, false);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'init') {
      // Exclusive creation protects an existing installation; stdin keeps passwords out of command lines.
      writeFileSync(resolve(projectRoot, '.env'), initialEnvironment(JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''))), { flag: 'wx', mode: 0o600 });
    } else {
      if (existsSync(resolve(projectRoot, '.env'))) loadEnvFile(resolve(projectRoot, '.env'));
      const configuration = settings(process.env);
      if (process.argv[2] === 'health') await verifyHealth(configuration);
      else console.log(JSON.stringify(configuration));
    }
  } catch (error) {
    const message = error.code === 'EEXIST' ? 'La configuracion existente se conserva.' : error.message;
    if (process.argv[2] === 'health') console.log(message);
    else console.error(message);
    process.exitCode = 1;
  }
}
