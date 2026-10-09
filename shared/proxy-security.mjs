import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const cleanIp = value => {
  const ip = typeof value === 'string' ? value.replace(/^::ffff:/, '') : '';
  return isIP(ip) ? ip : null;
};
export function signClientIp(secret, timestamp, method, path, ip) {
  return createHmac('sha256', secret).update(`${timestamp}\n${method}\n${path}\n${ip}`).digest('hex');
}
export function clientIp(req, secret, now = Date.now()) {
  const peer = cleanIp(req.socket?.remoteAddress);
  const ip = cleanIp(req.headers['x-bitacoras-client-ip']);
  const timestamp = req.headers['x-bitacoras-client-time'];
  const signature = req.headers['x-bitacoras-client-signature'];
  if (secret && (peer === '::1' || peer?.startsWith('127.')) && ip && typeof timestamp === 'string' && /^\d{13}$/.test(timestamp) && Math.abs(now - Number(timestamp)) <= 60000 && typeof signature === 'string' && /^[a-f0-9]{64}$/.test(signature)) {
    const expected = signClientIp(secret, timestamp, req.method, req.originalUrl, ip);
    if (timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) return ip;
  }
  return peer;
}
