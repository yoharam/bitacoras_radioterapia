import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { cleanIp, signClientIp } from '../../../shared/proxy-security.mjs';

export const config = { api: { bodyParser: false, externalResolver: true } };

export default function proxy(req, res) {
  if (!process.env.INTERNAL_API_PROXY_SECRET) {
    const envPath = path.resolve(process.cwd(), '../.env');
    if (existsSync(envPath)) loadEnvFile(envPath);
  }
  const secret = process.env.INTERNAL_API_PROXY_SECRET;
  if (!secret) return res.status(503).json({ message: 'No se pudo iniciar la conexión con la API. Reinicia la aplicación.' });
  const target = new URL(process.env.API_URL || 'http://127.0.0.1:4100');
  const incoming = new URL(req.url, 'http://localhost');
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = { ...req.headers };
  for (const name of Object.keys(headers)) {
    if (['host', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-authenticate', 'proxy-authorization', 'forwarded', 'x-forwarded-for', 'x-real-ip'].includes(name) || name.startsWith('x-bitacoras-client-')) delete headers[name];
  }
  const ip = cleanIp(req.socket.remoteAddress);
  const timestamp = String(Date.now());
  if (ip) {
    headers['x-bitacoras-client-ip'] = ip;
    headers['x-bitacoras-client-time'] = timestamp;
    headers['x-bitacoras-client-signature'] = signClientIp(secret, timestamp, req.method, target.pathname + target.search, ip);
  }
  return new Promise(resolve => {
    const outgoing = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, { method: req.method, headers }, upstream => {
      res.statusCode = upstream.statusCode;
      for (const [name, value] of Object.entries(upstream.headers)) if (value !== undefined && !['connection', 'transfer-encoding', 'keep-alive'].includes(name)) res.setHeader(name, value);
      upstream.pipe(res);
      upstream.on('end', resolve);
      upstream.on('error', () => { res.destroy(); resolve(); });
    });
    outgoing.setTimeout(15000, () => outgoing.destroy());
    outgoing.on('error', () => {
      if (!res.headersSent) res.status(502).json({ message: 'No se pudo conectar con la API. Intenta de nuevo.' });
      else res.destroy();
      resolve();
    });
    req.on('aborted', () => outgoing.destroy());
    res.on('close', () => { if (!res.writableEnded) outgoing.destroy(); });
    req.pipe(outgoing);
  });
}
