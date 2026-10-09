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
  await request(result.app, `/api/records/${record.id}/arrival`, { method: 'POST', cookie, body: { arrival_time: patient.arrival_time } });
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
    const body = { name: index, username: (`${index}@bitacoras.local`).split('@')[0].toLowerCase(), email: `${index}@bitacoras.local`, password: credentials.password, is_admin: false, active: true, permissions };
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
    await request(result.app, `/api/records/${record.id}/arrival`, { method: 'POST', cookie, body: { arrival_time: patient.arrival_time } });
    await request(result.app, `/api/records/${record.id}/network-assistance`, { method: 'POST', cookie });
    db.close(); db = undefined;
    result = await createApp(options); db = result.db;
    const queue = await request(result.app, '/api/network-assistance', { cookie });
    assert.equal(queue.body.total, 1);
    assert.equal(queue.body.requests[0].record_id, record.id);
    assert.equal((await request(result.app, `/api/records/${record.id}/network-assistance`, { method: 'POST', cookie })).status, 200);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('asigna solicitudes pendientes a personal de Redes y conserva el nombre en la cola', async t => {
  const { app, cookie, record } = await fixture(t);
  const path = `/api/records/${record.id}/network-assistance`;
  const requested = await request(app, path, { method: 'POST', cookie });
  assert.equal(requested.status, 201);
  const engineer = { name: 'Técnico Redes', username: ('redes@bitacoras.local').split('@')[0].toLowerCase(), email: 'redes@bitacoras.local', password: credentials.password, is_admin: false, active: true, permissions: ['networks.read', 'networks.update'] };
  const createdUser = await request(app, '/api/users', { method: 'POST', cookie, body: engineer });
  assert.equal(createdUser.status, 201);
  const assigned = await request(app, `/api/network-assistance/${requested.body.request.id}`, { method: 'PATCH', cookie, body: { assigned_to: createdUser.body.user.id } });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.request.assigned_to, createdUser.body.user.id);
  const queue = await request(app, '/api/network-assistance', { cookie });
  assert.equal(queue.body.requests[0].assigned_name, 'Técnico Redes');
  assert.ok(queue.body.assignees.some(person => person.id === createdUser.body.user.id));
  const audit = await request(app, '/api/audit', { cookie });
  assert.ok(audit.body.events.some(event => event.action === 'network.assigned'));
});

test('reconocimiento mensual acredita al inge autenticado y no duplica créditos al reintentar', async t => {
  const { app, db, cookie, record } = await fixture(t);
  const engineer = { name: 'Ingeniera Redes Uno', username: ('inge-uno@bitacoras.local').split('@')[0].toLowerCase(), email: 'inge-uno@bitacoras.local', password: credentials.password, is_admin: false, active: true, permissions: ['networks.read', 'networks.update'] };
  const createdUser = await request(app, '/api/users', { method: 'POST', cookie, body: engineer });
  assert.equal(createdUser.status, 201);
  const engineerId = createdUser.body.user.id;
  const engineerCookie = await login(app, engineer);
  const requested = await request(app, `/api/records/${record.id}/network-assistance`, { method: 'POST', cookie });
  const path = `/api/network-assistance/${requested.body.request.id}`;
  const completed = await request(app, path, { method: 'PATCH', cookie: engineerCookie, body: { status: 'Atendida', handled_by: 1 } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.newly_completed, true);
  assert.equal(completed.body.request.handled_by, engineerId);
  assert.equal(completed.body.recognition.engineer_id, engineerId);
  assert.equal(completed.body.recognition.engineer_name, engineer.name);
  assert.equal(completed.body.recognition.completed, 1);
  assert.equal(completed.body.recognition.gold, false);
  const retries = await Promise.all([request(app, path, { method: 'PATCH', cookie: engineerCookie, body: { status: 'Atendida' } }), request(app, path, { method: 'PATCH', cookie, body: { status: 'Atendida' } })]);
  assert.ok(retries.every(result => result.status === 200 && result.body.newly_completed === false && result.body.recognition.engineer_id === engineerId && result.body.recognition.completed === 1));
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'network.completed'").get().count, 1);
});

test('dos ingenieros tienen contadores e historiales independientes y el dorado exige superar diez', async t => {
  const { app, cookie, record } = await fixture(t);
  const engineers = [];
  for (const [index, name] of ['Ingeniera Redes Uno', 'Ingeniero Redes Dos'].entries()) {
    const body = { name, username: (`contador-${index}@bitacoras.local`).split('@')[0].toLowerCase(), email: `contador-${index}@bitacoras.local`, password: credentials.password, is_admin: false, active: true, permissions: ['networks.read', 'networks.update'] };
    const created = await request(app, '/api/users', { method: 'POST', cookie, body });
    assert.equal(created.status, 201);
    engineers.push({ id: created.body.user.id, name, cookie: await login(app, body) });
  }
  const complete = async engineer => {
    const created = await request(app, `/api/records/${record.id}/network-assistance`, { method: 'POST', cookie });
    assert.equal(created.status, 201);
    const path = `/api/network-assistance/${created.body.request.id}`;
    await request(app, path, { method: 'PATCH', cookie, body: { assigned_to: engineers[1].id } });
    return request(app, path, { method: 'PATCH', cookie: engineer.cookie, body: { status: 'Atendida' } });
  };
  for (let index = 0; index < 10; index++) await complete(engineers[0]);
  await complete(engineers[1]);
  const report = await request(app, '/api/network-assistance/recognition', { cookie: engineers[0].cookie });
  assert.equal(report.status, 200);
  assert.deepEqual(report.body.engineers.map(engineer => engineer.engineer_id).sort(), engineers.map(engineer => engineer.id).sort());
  const first = report.body.engineers.find(engineer => engineer.engineer_id === engineers[0].id);
  const second = report.body.engineers.find(engineer => engineer.engineer_id === engineers[1].id);
  assert.equal(first.completed, 10);
  assert.equal(first.gold, false);
  assert.equal(second.completed, 1);
  assert.equal(second.gold, false);
  const golden = await complete(engineers[0]);
  assert.equal(golden.body.recognition.completed, 11);
  assert.equal(golden.body.recognition.gold, true);
  const history = await request(app, `/api/network-assistance/recognition?engineer=${engineers[0].id}&limit=5`, { cookie: engineers[1].cookie });
  assert.equal(history.status, 200);
  assert.equal(history.body.total, 11);
  assert.equal(history.body.pages, 3);
  assert.equal(history.body.history.length, 5);
  assert.ok(history.body.history.every(event => event.engineer_id === engineers[0].id && event.engineer_name === engineers[0].name && event.record_id === record.id));
  assert.ok(!JSON.stringify(history.body).includes(patient.patient_name));
  await request(app, `/api/records/${record.id}`, { method: 'DELETE', cookie });
  const retained = await request(app, `/api/network-assistance/recognition?engineer=${engineers[0].id}`, { cookie: engineers[0].cookie });
  assert.equal(retained.body.total, 11);
  assert.equal(retained.body.personal.completed, 11);
  assert.ok(retained.body.history.every(event => event.record_id === record.id));
});

test('atención y crédito se guardan juntos: un fallo de auditoría no consume la solicitud', async t => {
  const { app, db, cookie, record } = await fixture(t);
  const created = await request(app, `/api/records/${record.id}/network-assistance`, { method: 'POST', cookie });
  const id = created.body.request.id;
  db.exec("CREATE TRIGGER recognition_failure BEFORE INSERT ON audit_events WHEN NEW.action = 'network.completed' BEGIN SELECT RAISE(ABORT, 'fallo controlado de auditoría'); END;");
  const errorLog = t.mock.method(console, 'error', () => {});
  const failed = await request(app, `/api/network-assistance/${id}`, { method: 'PATCH', cookie, body: { status: 'Atendida' } });
  assert.equal(failed.status, 500);
  assert.equal(errorLog.mock.calls.length, 1);
  assert.equal(db.prepare('SELECT status FROM network_assistance WHERE id = ?').get(id).status, 'Solicitada');
  db.exec('DROP TRIGGER recognition_failure');
  const completed = await request(app, `/api/network-assistance/${id}`, { method: 'PATCH', cookie, body: { status: 'Atendida' } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.newly_completed, true);
  assert.equal(completed.body.recognition.completed, 1);
});

test('meses locales sin solapamientos, historial anterior y permisos de reconocimiento', async t => {
  const { app, db, cookie } = await fixture(t);
  const body = { name: 'Inge Historial', username: ('historico@bitacoras.local').split('@')[0].toLowerCase(), email: 'historico@bitacoras.local', password: credentials.password, is_admin: false, active: true, permissions: ['networks.read', 'networks.update'] };
  const person = await request(app, '/api/users', { method: 'POST', cookie, body });
  const engineerId = person.body.user.id;
  const engineerCookie = await login(app, body);
  const empty = await request(app, '/api/network-assistance/recognition', { cookie: engineerCookie });
  assert.equal(empty.status, 200);
  const start = new Date(empty.body.start_at), end = new Date(empty.body.end_at);
  const insert = db.prepare("INSERT INTO audit_events (actor_id, actor_name, action, entity, entity_id, details, created_at) VALUES (?, ?, 'network.completed', 'network_assistance', ?, ?, ?)");
  for (const [index, timestamp] of [new Date(start.getTime() - 1), start, new Date(end.getTime() - 1), end].entries()) insert.run(engineerId, body.name, String(index + 1000), '{}', timestamp.toISOString());
  insert.run(engineerId, body.name, '2000', JSON.stringify({ engineer_id: engineerId, record_id: 2000, handled_at: start.toISOString() }), end.toISOString());
  const current = await request(app, '/api/network-assistance/recognition', { cookie: engineerCookie });
  assert.equal(current.body.personal.completed, 3);
  const previous = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
  const old = await request(app, `/api/network-assistance/recognition?month=${previousMonth}`, { cookie: engineerCookie });
  assert.equal(old.body.personal.completed, 1);
  const nextMonth = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
  assert.equal((await request(app, `/api/network-assistance/recognition?month=${nextMonth}`, { cookie: engineerCookie })).body.personal.completed, 1);
  assert.equal((await request(app, '/api/network-assistance/recognition')).status, 401);
  const viewer = { name: 'Consulta pacientes', username: ('solo-consulta@bitacoras.local').split('@')[0].toLowerCase(), email: 'solo-consulta@bitacoras.local', password: credentials.password, is_admin: false, active: true, permissions: ['radiotherapy.read'] };
  await request(app, '/api/users', { method: 'POST', cookie, body: viewer });
  assert.equal((await request(app, '/api/network-assistance/recognition', { cookie: await login(app, viewer) })).status, 403);
  for (const filter of ['month=2026-13', 'month=2026-00', 'month=1899-12', 'month=2101-01', 'month=2026-10&month=2026-11', 'engineer=-1', 'engineer=2&engineer=3', 'page=0', 'limit=101']) assert.equal((await request(app, `/api/network-assistance/recognition?${filter}`, { cookie: engineerCookie })).status, 400);
});

test('una cuenta nueva no hereda créditos aunque SQLite reutilice el id de un ingeniero eliminado', async t => {
  const { app, db, cookie, record } = await fixture(t);
  const body = { name: 'Inge anterior', username: ('anterior@bitacoras.local').split('@')[0].toLowerCase(), email: 'anterior@bitacoras.local', password: credentials.password, is_admin: false, active: true, permissions: ['networks.read', 'networks.update'] };
  const original = await request(app, '/api/users', { method: 'POST', cookie, body });
  const oldId = original.body.user.id;
  const originalCookie = await login(app, body);
  const created = await request(app, `/api/records/${record.id}/network-assistance`, { method: 'POST', cookie });
  await request(app, `/api/network-assistance/${created.body.request.id}`, { method: 'PATCH', cookie: originalCookie, body: { status: 'Atendida' } });
  assert.equal((await request(app, `/api/users/${oldId}`, { method: 'DELETE', cookie })).status, 200);
  const audit = db.prepare("SELECT actor_id, details FROM audit_events WHERE action = 'network.completed'").get();
  assert.equal(audit.actor_id, null);
  assert.equal(JSON.parse(audit.details).engineer_id, oldId);
  const replacement = { ...body, name: 'Inge nuevo', email: 'nuevo@bitacoras.local' };
  const fresh = await request(app, '/api/users', { method: 'POST', cookie, body: replacement });
  assert.equal(fresh.body.user.id, oldId);
  const report = await request(app, `/api/network-assistance/recognition?engineer=${oldId}`, { cookie: await login(app, replacement) });
  assert.equal(report.body.personal.completed, 0);
  assert.equal(report.body.total, 0);
  const archived = await request(app, '/api/network-assistance/recognition', { cookie });
  assert.equal(archived.body.total, 1);
  assert.equal(archived.body.history[0].engineer_name, body.name);
  assert.equal(archived.body.history[0].engineer_id, null);
});
