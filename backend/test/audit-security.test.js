import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { request } from './request.js';
import { signClientIp } from '../../shared/proxy-security.mjs';
const password = 'AuditoriaPrueba2026!';
const secret = 'secreto-interno-de-prueba';
const signed = (ip, method, path, time = Date.now()) => ({
  'x-bitacoras-client-ip': ip, 'x-bitacoras-client-time': String(time),
  'x-bitacoras-client-signature': signClientIp(secret, String(time), method, path, ip)
});
async function login(app, identifier = 'admin', options = {}) {
  const response = await request(app, '/api/auth/login', { method: 'POST', body: { identifier, password }, ...options });
  assert.equal(response.status, 200);
  return [].concat(response.headers['set-cookie'])[0].split(';')[0];
}
test('auditoría conserva identidad al renombrar y eliminar cuentas; filtros, permisos y datos seguros', async t => {
  const { app, db } = await createApp({ databasePath: ':memory:', adminPassword: password });
  t.after(() => db.close());
  const cookie = await login(app);
  const account = { name: 'José González Pérez', username: 'jose.gonzalez', password, active: true, is_admin: false, permissions: [] };
  const created = await request(app, '/api/users', { method: 'POST', cookie, body: account });
  assert.equal(created.status, 201);
  const id = created.body.user.id;
  const operator = await login(app, account.username, { remoteAddress: '::ffff:192.168.20.44' });
  assert.equal((await request(app, '/api/audit', { cookie: operator, remoteAddress: '192.168.20.44' })).status, 403);
  await request(app, `/api/users/${id}`, { method: 'PUT', cookie, body: { ...account, name: 'Nombre cambiado', username: 'usuario.cambiado' } });
  assert.equal((await request(app, `/api/users/${id}`, { method: 'DELETE', cookie })).status, 200);
  const result = await request(app, '/api/audit?q=jose.gonzalez&action=auth.login_succeeded', { cookie });
  assert.equal(result.status, 200);
  assert.equal(result.body.total, 1);
  const event = result.body.events[0];
  assert.equal(event.actor_id, null);
  assert.equal(event.actor_user_id, id);
  assert.equal(event.actor_name, account.name);
  assert.equal(event.actor_username, account.username);
  assert.equal(event.actor_email, null);
  assert.equal(event.ip_address, '192.168.20.44');
  assert.equal(event.request_method, 'POST');
  assert.equal(event.request_path, '/api/auth/login');
  const denied = await request(app, '/api/audit?q=192.168.20.44&action=security.permission_denied', { cookie });
  assert.equal(denied.body.total, 1);
  assert.equal(denied.body.events[0].details.permission, 'audit.read');
  assert.ok(!JSON.stringify(result.body).includes(password));
  assert.ok(!JSON.stringify(result.body).includes('password_hash'));
  assert.equal((await request(app, '/api/audit?q=admin&q=otro', { cookie })).status, 400);
  assert.equal((await request(app, '/api/audit?action=invalid', { cookie })).status, 400);
});
test('IP firmada por el proxy: ignora suplantación, firmas vencidas y firma desde cliente remoto', async t => {
  const { app, db } = await createApp({ databasePath: ':memory:', adminPassword: password, proxySecret: secret });
  t.after(() => db.close());
  const endpoint = '/api/auth/login';
  const cases = [
    [{ headers: { 'x-forwarded-for': '203.0.113.55', 'x-real-ip': '203.0.113.55' }, remoteAddress: '192.168.1.9' }, '192.168.1.9'],
    [{ headers: signed('192.168.2.88', 'POST', endpoint) }, '192.168.2.88'],
    [{ headers: { ...signed('192.168.2.88', 'POST', endpoint), 'x-bitacoras-client-ip': '203.0.113.55' } }, '127.0.0.1'],
    [{ headers: signed('192.168.2.88', 'POST', endpoint, Date.now() - 120000) }, '127.0.0.1'],
    [{ headers: signed('192.168.2.88', 'POST', endpoint), remoteAddress: '192.168.1.9' }, '192.168.1.9'],
    [{ headers: signed('192.168.2.88', 'GET', endpoint) }, '127.0.0.1']
  ];
  for (const [options, expected] of cases) {
    await login(app, 'admin', options);
    assert.equal(db.prepare('SELECT ip_address FROM audit_events ORDER BY id DESC LIMIT 1').get().ip_address, expected);
  }
});
test('intento fallido guarda IP e identificador sin atribuir una identidad ni registrar contraseña', async t => {
  const { app, db } = await createApp({ databasePath: ':memory:', adminPassword: password });
  t.after(() => db.close());
  await request(app, '/api/auth/login?dato=privado', { method: 'POST', body: { identifier: 'admin', password: 'incorrecta-privada' }, remoteAddress: '192.168.1.10' });
  const event = db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT 1').get();
  assert.equal(event.actor_user_id, null);
  assert.equal(event.actor_username, null);
  assert.equal(event.ip_address, '192.168.1.10');
  assert.equal(event.request_path, '/api/auth/login');
  assert.equal(JSON.parse(event.details).attempted_identifier, 'admin');
  assert.ok(!JSON.stringify(event).includes('incorrecta-privada'));
  assert.ok(!JSON.stringify(event).includes('dato=privado'));
});
