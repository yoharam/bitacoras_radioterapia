import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { request } from './request.js';

const credentials = { email: 'admin@bitacoras.local', password: 'PruebaSegura2026!' };
const patient = { patient_name: 'Paciente ficticio de asistencia', date: '2026-10-08', arrival_time: '08:00', treatment_time: '08:30' };
async function login(app, body = credentials) {
  const result = await request(app, '/api/auth/login', { method: 'POST', body });
  assert.equal(result.status, 200);
  return [].concat(result.headers['set-cookie'])[0].split(';')[0];
}
async function fixture(t) {
  const result = await createApp({ databasePath: ':memory:', adminPassword: credentials.password });
  t.after(() => result.db.close());
  const cookie = await login(result.app);
  const record = (await request(result.app, '/api/records', { method: 'POST', cookie, body: patient })).body.record;
  return { ...result, cookie, record };
}
test('solicitud persistida, duplicados idempotentes, cola de Redes, atención e historial', async t => {
  const { app, db, cookie, record } = await fixture(t);
  const path = `/api/records/${record.id}/network-assistance`;
  const created = await request(app, path, { method: 'POST', cookie });
  assert.equal(created.status, 201);
  assert.equal(created.body.message, 'Tu ingeniero va en camino');
  const id = created.body.request.id;
  const duplicates = await Promise.all([request(app, path, { method: 'POST', cookie }), request(app, path, { method: 'POST', cookie })]);
  assert.ok(duplicates.every(result => result.status === 200 && result.body.request.id === id));
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM network_assistance').get().total, 1);
  const queue = await request(app, '/api/network-assistance', { cookie });
  assert.equal(queue.body.total, 1);
  assert.equal(queue.body.requests[0].patient_name, patient.patient_name);
  assert.equal(queue.body.requests[0].requester_name, 'Administrador');
  const detail = await request(app, `/api/records/${record.id}`, { cookie });
  assert.equal(detail.body.record.assistance_requested_at, created.body.request.requested_at);
  assert.equal((await request(app, '/api/records', { cookie })).body.records[0].assistance_requested_at, created.body.request.requested_at);
  const completed = await request(app, `/api/network-assistance/${id}`, { method: 'PATCH', cookie, body: { status: 'Atendida' } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.request.status, 'Atendida');
  assert.equal(completed.body.request.handled_by, 1);
  assert.ok(completed.body.request.handled_at);
  assert.equal((await request(app, '/api/network-assistance', { cookie })).body.total, 0);
  assert.equal((await request(app, '/api/network-assistance?status=Atendida', { cookie })).body.total, 1);
  assert.equal((await request(app, `/api/records/${record.id}`, { cookie })).body.record.assistance_requested_at, null);
  const repeatedCompletion = await request(app, `/api/network-assistance/${id}`, { method: 'PATCH', cookie, body: { status: 'Atendida' } });
  assert.equal(repeatedCompletion.body.request.handled_at, completed.body.request.handled_at);
  const reopened = await request(app, path, { method: 'POST', cookie });
  assert.equal(reopened.status, 201);
  assert.notEqual(reopened.body.request.id, id);
  assert.equal((await request(app, '/api/network-assistance?status=', { cookie })).body.total, 2);
});
test('sesión, CSRF, permisos separados de captura y Redes, validaciones y registros anteriores', async t => {
  const { app, db, cookie, record } = await fixture(t);
  const path = `/api/records/${record.id}/network-assistance`;
  const created = await request(app, path, { method: 'POST', cookie });
  const resolvePath = `/api/network-assistance/${created.body.request.id}`;
  assert.equal((await request(app, path, { method: 'POST' })).status, 401);
  assert.equal((await request(app, '/api/network-assistance')).status, 401);
  assert.equal((await request(app, resolvePath, { method: 'PATCH', body: { status: 'Atendida' } })).status, 401);
  assert.equal((await request(app, path, { method: 'POST', cookie, headers: { 'x-bitacoras-request': '' } })).status, 403);
  for (const [index, permissions] of [['viewer', ['radiotherapy.read']], ['requester', ['radiotherapy.read', 'radiotherapy.assist']], ['engineer', ['networks.read', 'networks.update']]]) {
    const body = { name: index, email: `${index}@bitacoras.local`, password: credentials.password, is_admin: false, active: true, permissions };
    assert.equal((await request(app, '/api/users', { method: 'POST', cookie, body })).status, 201);
    const actor = await login(app, body);
    assert.equal((await request(app, path, { method: 'POST', cookie: actor })).status, index === 'requester' ? 200 : 403);
    assert.equal((await request(app, '/api/network-assistance', { cookie: actor })).status, index === 'engineer' ? 200 : 403);
    assert.equal((await request(app, resolvePath, { method: 'PATCH', cookie: actor, body: { status: 'Atendida' } })).status, index === 'engineer' ? 200 : 403);
  }
  for (const badPath of ['/api/network-assistance?page=0', '/api/network-assistance?limit=101', '/api/network-assistance?status=Otro', '/api/network-assistance?status=a&status=b']) assert.equal((await request(app, badPath, { cookie })).status, 400);
  assert.equal((await request(app, '/api/records/no-id/network-assistance', { method: 'POST', cookie })).status, 400);
  assert.equal((await request(app, '/api/records/999999/network-assistance', { method: 'POST', cookie })).status, 404);
  assert.equal((await request(app, resolvePath, { method: 'PATCH', cookie, body: { status: 'Error' } })).status, 400);
  assert.equal((await request(app, '/api/network-assistance/999999', { method: 'PATCH', cookie, body: { status: 'Atendida' } })).status, 404);
  db.prepare('UPDATE records SET patient_name = NULL WHERE id = ?').run(record.id);
  assert.equal((await request(app, path, { method: 'POST', cookie })).status, 400);
});
test('solicitudes sobreviven al reinicio y la migración es idempotente', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'network-assistance-'));
  let db;
  try {
    const options = { databasePath: join(directory, 'test.sqlite'), adminPassword: credentials.password };
    let result = await createApp(options); db = result.db;
    const cookie = await login(result.app);
    const record = (await request(result.app, '/api/records', { method: 'POST', cookie, body: patient })).body.record;
    await request(result.app, `/api/records/${record.id}/network-assistance`, { method: 'POST', cookie });
    db.close(); db = undefined;
    result = await createApp(options); db = result.db;
    const queue = await request(result.app, '/api/network-assistance', { cookie });
    assert.equal(queue.body.total, 1);
    assert.equal(queue.body.requests[0].record_id, record.id);
    assert.equal((await request(result.app, `/api/records/${record.id}/network-assistance`, { method: 'POST', cookie })).status, 200);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});
