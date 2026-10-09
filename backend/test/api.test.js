import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp, hashPassword } from '../src/app.js';
import { request } from './request.js';
import { ENTITLEMENT_TYPES, searchEntitlementTypes } from '../../shared/entitlement-types.mjs';

const credentials = { email: 'admin@bitacoras.local', password: 'PruebaSegura2026!' };
const sample = { patient_name: 'Paciente de prueba María López', date: '2026-10-08', arrival_time: '08:15', treatment_time: '08:45', observations: 'Registro ficticio para pruebas.', status: 'Pendiente' };
async function session(app) {
  const result = await request(app, '/api/auth/login', { method: 'POST', body: credentials });
  assert.equal(result.status, 200);
  const setCookie = [].concat(result.headers['set-cookie'])[0];
  const cookie = setCookie.split(';')[0];
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  return cookie;
}
async function fixture(t, path = ':memory:') {
  const result = await createApp({ databasePath: path, adminPassword: credentials.password });
  t.after(() => result.db.close());
  return { ...result, cookie: await session(result.app) };
}

test('exige sesión en todas las operaciones y rechaza solicitudes sin protección CSRF', async t => {
  const { app, cookie } = await fixture(t);
  for (const [method, path] of [['GET', '/api/records'], ['GET', '/api/records/1'], ['POST', '/api/records'], ['PUT', '/api/records/1'], ['DELETE', '/api/records/1']]) assert.equal((await request(app, path, { method, body: sample })).status, 401);
  assert.equal((await request(app, '/api/records', { method: 'POST', cookie, body: sample, headers: { 'x-bitacoras-request': '' } })).status, 403);
  assert.equal((await request(app, '/api/records', { method: 'POST', cookie, body: sample, headers: { origin: 'https://otro-sitio.test' } })).status, 403);
});
test('crea, consulta, edita y elimina; calcula resúmenes y conserva fecha de registro', async t => {
  const { app, cookie } = await fixture(t);
  const created = await request(app, '/api/records', { method: 'POST', cookie, body: sample });
  assert.equal(created.status, 201);
  const id = created.body.record.id;
  const detail = await request(app, `/api/records/${id}`, { cookie });
  assert.equal(detail.body.record.author, 'Administrador');
  assert.equal(detail.body.record.patient_name, sample.patient_name);
  assert.equal(detail.body.record.arrival_time, '08:15');
  assert.equal(detail.body.record.treatment_time, '08:45');
  const list = await request(app, '/api/records', { cookie });
  assert.equal(list.body.stats.pending, 1);
  assert.equal(list.body.total, 1);
  const update = await request(app, `/api/records/${id}`, { method: 'PUT', cookie, body: { ...sample, treatment_time: '09:00', status: 'Completada', observations: 'Seguimiento concluido.' } });
  assert.equal(update.status, 200);
  assert.equal(update.body.record.created_at, created.body.record.created_at);
  assert.equal(update.body.record.status, 'Completada');
  assert.equal(update.body.record.treatment_time, '09:00');
  assert.equal(update.body.record.arrival_time, '08:15');
  assert.equal((await request(app, '/api/records', { cookie })).body.stats.completed, 1);
  assert.equal((await request(app, `/api/records/${id}`, { method: 'DELETE', cookie })).status, 200);
  assert.equal((await request(app, `/api/records/${id}`, { cookie })).status, 404);
  assert.equal((await request(app, '/api/records', { cookie })).body.stats.total, 0);
});
test('RFC y tipo de cirugía: captura opcional, normalización, validación, edición y exportación', async t => {
  const { app, cookie } = await fixture(t);
  const empty = await request(app, '/api/records', { method: 'POST', cookie, body: sample });
  assert.equal(empty.status, 201);
  assert.equal(empty.body.record.rfc, '');
  assert.equal(empty.body.record.surgery_type, '');
  const created = await request(app, '/api/records', { method: 'POST', cookie, body: { ...sample, rfc: ' lohm900101ab1 ', surgery_type: 'Hospitalizado' } });
  assert.equal(created.status, 201);
  const id = created.body.record.id;
  const detail = await request(app, `/api/records/${id}`, { cookie });
  assert.equal(detail.body.record.rfc, 'LOHM900101AB1');
  assert.equal(detail.body.record.surgery_type, 'Hospitalizado');
  // Los clientes anteriores que omiten estos campos conservan los datos capturados.
  const unchanged = await request(app, `/api/records/${id}`, { method: 'PUT', cookie, body: sample });
  assert.equal(unchanged.body.record.rfc, 'LOHM900101AB1');
  assert.equal(unchanged.body.record.surgery_type, 'Hospitalizado');
  for (const change of [{ rfc: 123 }, { rfc: null }, { rfc: 'INVALIDO' }, { rfc: 'LOHM900101AB12' }, { surgery_type: null }, { surgery_type: 1 }, { surgery_type: 'Otro' }]) {
    for (const [method, path] of [['POST', '/api/records'], ['PUT', `/api/records/${id}`]]) {
      assert.equal((await request(app, path, { method, cookie, body: { ...sample, ...change } })).status, 400);
    }
  }
  const updated = await request(app, `/api/records/${id}`, { method: 'PUT', cookie, body: { ...sample, rfc: 'abc900101ab1', surgery_type: 'Ambulatorio' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.record.rfc, 'ABC900101AB1');
  assert.equal(updated.body.record.surgery_type, 'Ambulatorio');
  const exported = await request(app, '/api/records/export', { cookie });
  const row = exported.body.records.find(record => record.id === id);
  assert.equal(row.rfc, 'ABC900101AB1');
  assert.equal(row.surgery_type, 'Ambulatorio');
  const cleared = await request(app, `/api/records/${id}`, { method: 'PUT', cookie, body: { ...sample, rfc: '', surgery_type: '' } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.record.rfc, '');
  assert.equal(cleared.body.record.surgery_type, '');
});
test('búsqueda sin acentos, filtros y paginación; consultas parametrizadas', async t => {
  const { app, cookie } = await fixture(t);
  for (let index = 0; index < 10; index++) await request(app, '/api/records', { method: 'POST', cookie, body: { ...sample, patient_name: `Paciente de prueba María López ${index}`, status: index < 4 ? 'Completada' : 'Pendiente' } });
  assert.equal((await request(app, '/api/records?q=maria', { cookie })).body.total, 10);
  assert.equal((await request(app, '/api/records?q=lopez', { cookie })).body.total, 10);
  assert.equal((await request(app, '/api/records?date=2026-10-08', { cookie })).body.total, 10);
  assert.equal((await request(app, '/api/records?date=2026-10-09', { cookie })).body.stats.total, 0);
  assert.equal((await request(app, '/api/records?status=Completada', { cookie })).body.total, 4);
  assert.equal((await request(app, '/api/records?priority=Urgente', { cookie })).body.total, 0);
  assert.equal((await request(app, '/api/records?from=2026-10-09', { cookie })).body.total, 0);
  const second = await request(app, '/api/records?page=2&limit=8', { cookie });
  assert.equal(second.body.records.length, 2);
  assert.equal(second.body.pages, 2);
  assert.equal((await request(app, '/api/records?q=%27%20OR%201%3D1--', { cookie })).body.total, 0);
});
test('valida fechas, tamaños, enums, filtros e identificadores', async t => {
  const { app, cookie } = await fixture(t);
  assert.equal((await request(app, '/api/records', { method: 'POST', cookie, body: { ...sample, arrival_time: '' } })).status, 201);
  for (const change of [{ date: '2026-02-30' }, { date: '01/10/2026' }, { status: 'Inventado' }, { patient_name: '  ' }, { patient_name: null }, { patient_name: 'x'.repeat(151) }, { observations: 'x'.repeat(3001) }, { arrival_time: '24:00' }, { arrival_time: '08:60' }, { treatment_time: '8:00' }, { treatment_time: null }, { treatment_time: '09:00:00' }]) assert.equal((await request(app, '/api/records', { method: 'POST', cookie, body: { ...sample, ...change } })).status, 400);
  for (const path of ['/api/records?page=0', '/api/records?limit=9999', '/api/records?status=Error', '/api/records?date=2026-02-30', '/api/records?from=2026-10-09&to=2026-10-01', '/api/records?q=uno&q=dos', '/api/records/not-an-id']) assert.equal((await request(app, path, { cookie })).status, 400);
});
test('rangos inclusivos: lista, contadores, exportación y sugerencias respetan los mismos filtros', async t => {
  const { app, cookie } = await fixture(t);
  for (const change of [
    { date: '2026-10-04', patient_name: 'María fuera del período' },
    { date: '2026-10-05', patient_name: 'María López', status: 'Completada' },
    { date: '2026-10-11', patient_name: 'María López', status: 'Completada' },
    { date: '2026-10-08', patient_name: 'María Pérez', status: 'Pendiente' },
    { date: '2026-10-12', patient_name: 'María fuera del período' }
  ]) await request(app, '/api/records', { method: 'POST', cookie, body: { ...sample, ...change } });
  const filters = '?from=2026-10-05&to=2026-10-11&q=MARIA&status=Completada';
  const list = await request(app, `/api/records${filters}`, { cookie });
  assert.equal(list.body.total, 2);
  assert.deepEqual(list.body.stats, { total: 2, pending: 0, inProgress: 0, completed: 2 });
  assert.deepEqual(list.body.records.map(row => row.date), ['2026-10-11', '2026-10-05']);
  const exported = await request(app, `/api/records/export${filters}`, { cookie });
  assert.deepEqual(exported.body.records, list.body.records);
  assert.deepEqual((await request(app, `/api/records/suggestions${filters}`, { cookie })).body.suggestions, [{ name: 'María López', count: 2 }]);
  assert.equal((await request(app, `/api/records/suggestions${filters}`)).status, 401);
  assert.equal((await request(app, '/api/records/suggestions?from=2026-10-11&to=2026-10-05', { cookie })).status, 400);
});
test('catálogo de derechohabiencia: claves, validación, edición y exportación', async t => {
  const { app, db, cookie } = await fixture(t);
  assert.equal(ENTITLEMENT_TYPES.length, 24);
  assert.deepEqual(db.prepare('SELECT code, name FROM entitlement_types ORDER BY code').all().map(type => ({ ...type })), ENTITLEMENT_TYPES);
  assert.deepEqual(searchEntitlementTypes('95').map(type => type.code), ['95']);
  assert.deepEqual(searchEntitlementTypes('IMSS bienestar').map(type => type.code), ['95', '96']);
  assert.deepEqual(searchEntitlementTypes('conyuge').map(type => type.code), ['71', '81']);
  for (const type of ENTITLEMENT_TYPES) {
    const result = await request(app, '/api/records', { method: 'POST', cookie, body: { ...sample, entitlement_type: type.code } });
    assert.equal(result.status, 201);
    assert.equal(result.body.record.entitlement_type, type.code);
  }
  for (const value of ['11', 'Trabajador', '95 · IMSS BIENESTAR Hombre', 95, null, {}, true]) {
    const body = { ...sample, entitlement_type: value };
    assert.equal((await request(app, '/api/records', { method: 'POST', cookie, body })).status, 400);
    assert.equal((await request(app, '/api/records/1', { method: 'PUT', cookie, body })).status, 400);
  }
  assert.equal((await request(app, '/api/records/1', { method: 'PUT', cookie, body: sample })).body.record.entitlement_type, '10');
  assert.equal((await request(app, '/api/records/1', { method: 'PUT', cookie, body: { ...sample, entitlement_type: '99' } })).body.record.entitlement_type, '99');
  assert.equal((await request(app, '/api/records/export?limit=100', { cookie })).body.records.find(record => record.id === 1).entitlement_type, '99');
  assert.throws(() => db.prepare('UPDATE records SET entitlement_type = ? WHERE id = 1').run('11'), /FOREIGN KEY/);
  assert.equal((await request(app, '/api/records/1', { method: 'PUT', cookie, body: { ...sample, entitlement_type: '' } })).body.record.entitlement_type, null);
});

test('persiste registros y sesiones al reabrir SQLite y revoca sesión al salir', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitacoras-test-'));
  let db;
  try {
    let result = await createApp({ databasePath: join(directory, 'test.sqlite'), adminPassword: credentials.password });
    db = result.db;
    const cookie = await session(result.app);
    await request(result.app, '/api/records', { method: 'POST', cookie, body: { ...sample, rfc: 'LOHM900101AB1', surgery_type: 'Hospitalizado', entitlement_type: '95' } });
    db.close(); db = undefined;
    result = await createApp({ databasePath: join(directory, 'test.sqlite'), adminPassword: 'OtraClave2026!' });
    db = result.db;
    assert.equal((await request(result.app, '/api/records', { cookie })).body.total, 1);
    assert.equal((await request(result.app, '/api/records', { cookie })).body.records[0].patient_name, sample.patient_name);
    assert.equal((await request(result.app, '/api/records', { cookie })).body.records[0].arrival_time, '08:15');
    assert.equal((await request(result.app, '/api/records', { cookie })).body.records[0].treatment_time, '08:45');
    assert.equal((await request(result.app, '/api/records', { cookie })).body.records[0].rfc, 'LOHM900101AB1');
    assert.equal((await request(result.app, '/api/records', { cookie })).body.records[0].surgery_type, 'Hospitalizado');
    assert.equal((await request(result.app, '/api/records', { cookie })).body.records[0].entitlement_type, '95');
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM entitlement_types').get().total, 24);
    await request(result.app, '/api/auth/logout', { method: 'POST', cookie });
    assert.equal((await request(result.app, '/api/auth/me', { cookie })).status, 401);
    assert.equal((await request(result.app, '/api/auth/login', { method: 'POST', body: credentials })).status, 200);
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('acepta llegada tardía y medianoche; ordena por hora programada y permite atenciones en varias fechas', async t => {
  const { app, cookie } = await fixture(t);
  for (const change of [{ arrival_time: '09:10', treatment_time: '08:45' }, { arrival_time: '00:00', treatment_time: '00:00' }, { date: '2026-10-09', treatment_time: '07:00' }]) {
    assert.equal((await request(app, '/api/records', { method: 'POST', cookie, body: { ...sample, ...change } })).status, 201);
  }
  const list = await request(app, '/api/records?date=2026-10-08', { cookie });
  assert.deepEqual(list.body.records.map(record => record.treatment_time), ['00:00', '08:45']);
  assert.equal(list.body.stats.total, 2);
  assert.equal((await request(app, '/api/records?date=2026-10-09', { cookie })).body.stats.total, 1);
  assert.equal((await request(app, '/api/records', { cookie })).body.stats.total, 3);
});

test('migra la tabla anterior sin inventar pacientes ni perder información; la migración es idempotente', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'radioterapia-migration-'));
  const path = join(directory, 'legacy.sqlite');
  let db = new DatabaseSync(path);
  try {
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
      CREATE TABLE records (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, date TEXT NOT NULL, area TEXT NOT NULL, responsible TEXT NOT NULL, description TEXT NOT NULL, observations TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, priority TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(1, 'Administrador', credentials.email, await hashPassword(credentials.password));
    db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(1, 'Actividad anterior ficticia', sample.date, 'Área anterior', 'Responsable anterior', 'Descripción original', 'Observaciones originales', 'Pendiente', 'Alta', 1, '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z');
    db.close(); db = undefined;
    for (let iteration = 0; iteration < 2; iteration++) {
      const result = await createApp({ databasePath: path }); db = result.db;
      const record = db.prepare('SELECT * FROM records WHERE id = 1').get();
      assert.equal(record.patient_name, null);
      assert.equal(record.arrival_time, null);
      assert.equal(record.treatment_time, null);
      assert.equal(record.rfc, null);
      assert.equal(record.surgery_type, null);
      assert.equal(record.entitlement_type, null);
      assert.equal(db.prepare('SELECT COUNT(*) AS total FROM entitlement_types').get().total, 24);
      assert.equal(record.title, 'Actividad anterior ficticia');
      assert.equal(record.description, 'Descripción original');
      assert.equal(record.priority, 'Alta');
      assert.equal(record.created_at, '2026-10-01T10:00:00Z');
      if (iteration === 1) {
        const cookie = await session(result.app);
        assert.equal((await request(result.app, '/api/records/1', { method: 'PUT', cookie, body: sample })).status, 200);
        const updated = db.prepare('SELECT * FROM records WHERE id = 1').get();
        assert.equal(updated.patient_name, sample.patient_name);
        assert.equal(updated.title, 'Actividad anterior ficticia');
        assert.equal(updated.description, 'Descripción original');
      }
      db.close(); db = undefined;
    }
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});
test('cambio de contraseña invalida otras sesiones y verifica la clave actual', async t => {
  const { app, cookie } = await fixture(t);
  const other = await session(app);
  assert.equal((await request(app, '/api/auth/password', { method: 'POST', cookie, body: { currentPassword: 'equivocada', newPassword: 'NuevaClave2026!' } })).status, 400);
  assert.equal((await request(app, '/api/auth/password', { method: 'POST', cookie, body: { currentPassword: credentials.password, newPassword: 'NuevaClave2026!' } })).status, 200);
  assert.equal((await request(app, '/api/auth/me', { cookie: other })).status, 401);
  assert.equal((await request(app, '/api/auth/me', { cookie })).status, 200);
  assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: credentials })).status, 401);
  assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: { ...credentials, password: 'NuevaClave2026!' } })).status, 200);
});
test('limita intentos fallidos y no expone el hash en la sesión', async t => {
  const { app, cookie } = await fixture(t);
  assert.equal((await request(app, '/api/auth/me', { cookie })).body.user.password_hash, undefined);
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: { ...credentials, password: 'incorrecta' } })).status, 401);
  assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: credentials })).status, 429);
});

test('registra y conserva las horas reales al avanzar la atención', async t => {
  const { app, cookie } = await fixture(t);
  const created = await request(app, '/api/records', { method: 'POST', cookie, body: sample });
  const id = created.body.record.id;
  assert.equal(created.body.record.treatment_started_at, null);
  assert.equal(created.body.record.treatment_completed_at, null);
  await request(app, `/api/records/${id}/arrival`, { method: 'POST', cookie, body: { arrival_time: sample.arrival_time } });
  const started = await request(app, `/api/records/${id}`, { method: 'PUT', cookie, body: { ...sample, status: 'En proceso' } });
  assert.equal(started.status, 200);
  assert.ok(Number.isFinite(Date.parse(started.body.record.treatment_started_at)));
  assert.equal(started.body.record.treatment_completed_at, null);
  const startedAt = started.body.record.treatment_started_at;
  const repeated = await request(app, `/api/records/${id}`, { method: 'PUT', cookie, body: { ...sample, status: 'En proceso', observations: 'Cambio no relacionado.' } });
  assert.equal(repeated.body.record.treatment_started_at, startedAt);
  const completed = await request(app, `/api/records/${id}`, { method: 'PUT', cookie, body: { ...sample, status: 'Completada' } });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.record.treatment_started_at, startedAt);
  assert.ok(Number.isFinite(Date.parse(completed.body.record.treatment_completed_at)));
  assert.equal((await request(app, `/api/records/${id}`, { cookie })).body.record.treatment_completed_at, completed.body.record.treatment_completed_at);
});

test('bloquea sesiones inactivas y renueva su vencimiento al registrar actividad', async t => {
  const { app, db, cookie } = await fixture(t);
  const first = db.prepare('SELECT idle_expires_at FROM sessions').get().idle_expires_at;
  assert.ok(first > Date.now());
  assert.equal((await request(app, '/api/auth/activity', { method: 'POST', cookie })).status, 204);
  assert.ok(db.prepare('SELECT idle_expires_at FROM sessions').get().idle_expires_at >= first);
  db.prepare('UPDATE sessions SET idle_expires_at = ?').run(Date.now() - 1);
  assert.equal((await request(app, '/api/auth/me', { cookie })).status, 401);
});

test('audita accesos y cambios sin incluir datos personales del paciente', async t => {
  const { app, cookie } = await fixture(t);
  const created = await request(app, '/api/records', { method: 'POST', cookie, body: sample });
  assert.equal(created.status, 201);
  const id = created.body.record.id;
  await request(app, `/api/records/${id}`, { method: 'PUT', cookie, body: { ...sample, observations: 'Nota sensible ficticia.' } });
  await request(app, `/api/records/${id}`, { method: 'DELETE', cookie });
  const result = await request(app, '/api/audit?page=1&limit=100', { cookie });
  assert.equal(result.status, 200);
  assert.ok(result.body.events.some(event => event.action === 'auth.login_succeeded'));
  assert.ok(result.body.events.some(event => event.action === 'record.created'));
  assert.ok(result.body.events.some(event => event.action === 'record.updated'));
  assert.ok(result.body.events.some(event => event.action === 'record.deleted'));
  const serialized = JSON.stringify(result.body.events);
  assert.equal(serialized.includes(sample.patient_name), false);
  assert.equal(serialized.includes('Nota sensible ficticia.'), false);
  const person = { name: 'Consulta', email: 'consulta@bitacoras.local', password: credentials.password, is_admin: false, active: true, permissions: ['radiotherapy.read'] };
  await request(app, '/api/users', { method: 'POST', cookie, body: person });
  const session = await request(app, '/api/auth/login', { method: 'POST', body: person });
  const userCookie = [].concat(session.headers['set-cookie'])[0].split(';')[0];
  assert.equal((await request(app, '/api/audit', { cookie: userCookie })).status, 403);
});
