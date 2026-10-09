import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp, hashPassword } from '../src/app.js';
import { createPersonnelService } from '../src/personnel.js';
import { request } from './request.js';

const password = 'PersonalPrueba2026!';
const account = { name: 'José González Pérez', username: 'jose.gonzalez', password, active: true, is_admin: false, permissions: ['radiotherapy.read'] };
const person = { numero_empleado: '004321', nombre: 'JOSÉ', apellidos: 'GONZÁLEZ PÉREZ', nombre_completo: 'JOSÉ GONZÁLEZ PÉREZ', status_laboral: 'ACTIVO', rfc: 'DATO_PRIVADO', direccion: 'DATO_PRIVADO', fm1: { servicio: 'RADIOTERAPIA', puesto: 'TÉCNICO', nivel_salarial: 'DATO_PRIVADO' } };
async function login(app, identifier = 'admin') {
  const result = await request(app, '/api/auth/login', { method: 'POST', body: { identifier, password } });
  assert.equal(result.status, 200);
  return [].concat(result.headers['set-cookie'])[0].split(';')[0];
}
async function fixture(t, fetchImpl = async () => Response.json({ datos: [person] })) {
  const personnelService = createPersonnelService({ baseUrl: 'https://personal.example.test', apiKey: 'llave-de-prueba', fetchImpl });
  const result = await createApp({ databasePath: ':memory:', adminPassword: password, personnelService });
  t.after(() => result.db.close());
  return { ...result, cookie: await login(result.app) };
}

test('correo opcional: varias cuentas sin correo, acceso, búsqueda y edición; nombre y usuario obligatorios', async t => {
  const { app, db, cookie } = await fixture(t);
  for (const [username, email] of [['jose.gonzalez', undefined], ['jose.gonzalez1', ''], ['jose.gonzalez2', null]]) {
    const created = await request(app, '/api/users', { method: 'POST', cookie, body: { ...account, username, email } });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.email, null);
    await login(app, username);
    assert.equal((await request(app, `/api/users?q=${username}`, { cookie })).body.users.some(user => user.username === username), true);
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(account.username);
  assert.equal((await request(app, `/api/users/${existing.id}`, { method: 'PUT', cookie, body: { ...account, email: 'persona@example.test' } })).status, 200);
  assert.equal((await request(app, `/api/users/${existing.id}`, { method: 'PUT', cookie, body: { ...account, email: '' } })).body.user.email, null);
  for (const changes of [{ name: '' }, { name: undefined }, { username: '' }, { username: undefined }, { email: 'correo inválido' }, { email: 123 }]) {
    assert.equal((await request(app, '/api/users', { method: 'POST', cookie, body: { ...account, ...changes } })).status, 400);
  }
});

test('sugerencias sin acentos con sufijos 1 y 2; revalida una sugerencia ocupada al guardar', async t => {
  const { app, cookie } = await fixture(t);
  const path = '/api/users/username-suggestion?name=Jos%C3%A9%20Gonz%C3%A1lez%20P%C3%A9rez&given_names=Jos%C3%A9&surnames=Gonz%C3%A1lez%20P%C3%A9rez';
  assert.equal((await request(app, path, { cookie })).body.username, 'jose.gonzalez');
  for (const expected of ['jose.gonzalez', 'jose.gonzalez1', 'jose.gonzalez2']) {
    const created = await request(app, '/api/users', { method: 'POST', cookie, body: { ...account, username_auto: true, username_base: 'jose.gonzalez' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.username, expected);
  }
  assert.equal((await request(app, path, { cookie })).body.username, 'jose.gonzalez3');
  assert.equal((await request(app, '/api/users', { method: 'POST', cookie, body: account })).status, 409);
});

test('personal: Bearer servidor, campos permitidos, ceros iniciales, vínculo único y permisos', async t => {
  const calls = [];
  const { app, cookie } = await fixture(t, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer llave-de-prueba');
    assert.equal(options.redirect, 'error');
    calls.push(url);
    return Response.json(url.pathname.endsWith('/004321') ? person : { datos: [person], total: 1 });
  });
  const list = await request(app, '/api/users/personnel?q=004321', { cookie });
  assert.equal(list.status, 200);
  assert.equal(calls[0].searchParams.get('buscar'), '004321');
  assert.equal(calls[0].searchParams.get('por_pagina'), '6');
  const employee = list.body.people[0];
  assert.equal(employee.employee_number, '004321');
  assert.equal(employee.name, person.nombre_completo);
  assert.equal(employee.username, 'jose.gonzalez');
  assert.equal(employee.service, 'RADIOTERAPIA');
  assert.ok(!JSON.stringify(list.body).includes('DATO_PRIVADO'));
  assert.ok(!JSON.stringify(list.body).includes('llave-de-prueba'));
  const created = await request(app, '/api/users', { method: 'POST', cookie, body: { ...account, employee_number: employee.employee_number } });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.employee_number, '004321');
  assert.equal(created.body.user.email, null);
  assert.equal((await request(app, '/api/users/personnel?q=004321', { cookie })).body.people[0].registered, true);
  assert.equal((await request(app, '/api/users', { method: 'POST', cookie, body: { ...account, username: 'otro.usuario', employee_number: employee.employee_number } })).status, 409);
  const viewer = await login(app, account.username);
  assert.equal((await request(app, '/api/users/personnel?q=004321', { cookie: viewer })).status, 403);
  assert.equal((await request(app, '/api/users/username-suggestion?name=Jose', { cookie: viewer })).status, 403);
  assert.equal((await request(app, '/api/users/personnel?q=004321')).status, 401);
  assert.equal((await request(app, '/api/users/personnel?q=a', { cookie })).status, 400);
});

test('personal: caché de 60 segundos, configuración faltante, fallos y límites sin filtrar credenciales', async () => {
  let time = 1000, calls = 0;
  const service = createPersonnelService({ baseUrl: 'https://personal.example.test', apiKey: 'llave-de-prueba', now: () => time, fetchImpl: async () => { calls++; return Response.json({ datos: [person] }); } });
  await service.search('José'); await service.search('José');
  assert.equal(calls, 1);
  time += 60001; await service.search('José'); assert.equal(calls, 2);
  const unconfigured = createPersonnelService({ baseUrl: '', apiKey: '', fetchImpl: () => assert.fail('No debe consultar sin configuración') });
  await assert.rejects(unconfigured.search('José'), /no está configurada/);
  for (const status of [401, 403, 500, 503]) {
    const failing = createPersonnelService({ baseUrl: 'https://personal.example.test', apiKey: 'llave-de-prueba', fetchImpl: async () => Response.json({ error: { mensaje: 'llave-de-prueba' } }, { status }) });
    await assert.rejects(failing.search('José'), error => error.status === 503 && !error.message.includes('llave-de-prueba'));
  }
  calls = 0;
  const limited = createPersonnelService({ baseUrl: 'https://personal.example.test', apiKey: 'llave-de-prueba', now: () => time, fetchImpl: async () => { calls++; return Response.json({}, { status: 429, headers: { 'Retry-After': '30' } }); } });
  await assert.rejects(limited.search('José'), error => error.retryAfter === 30);
  await assert.rejects(limited.search('Otro'), error => error.retryAfter === 30);
  assert.equal(calls, 1);
  time += 30001; await assert.rejects(limited.search('Otro')); assert.equal(calls, 2);
  const invalid = createPersonnelService({ baseUrl: 'https://personal.example.test', apiKey: 'llave-de-prueba', fetchImpl: async () => Response.json({ datos: 'respuesta inválida' }) });
  await assert.rejects(invalid.search('José'), /respuesta incompleta/);
});

test('migra email NOT NULL con usuarios, autoría, permisos y sesiones intactos; es idempotente', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitacoras-email-'));
  const databasePath = join(directory, 'legacy.sqlite');
  let db = new DatabaseSync(databasePath);
  try {
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
      CREATE TABLE user_permissions (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, permission TEXT NOT NULL, PRIMARY KEY(user_id, permission));
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, idle_expires_at INTEGER NOT NULL DEFAULT 0);`);
    const hash = await hashPassword(password);
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(1, 'Administrador', 'admin@bitacoras.local', hash);
    db.prepare('INSERT INTO user_permissions VALUES (?, ?)').run(1, 'users.read');
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run('sesion-anterior', 1, Date.now() + 60000, Date.now() + 60000);
    db.close(); db = undefined;
    for (let iteration = 0; iteration < 2; iteration++) {
      const result = await createApp({ databasePath }); db = result.db;
      assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = 1').get().password_hash, hash);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_permissions WHERE user_id = 1').get().count, 1);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count >= 1, true);
      assert.equal(db.prepare('PRAGMA table_info(users)').all().find(column => column.name === 'email').notnull, 0);
      assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      const cookie = await login(result.app);
      assert.equal((await request(result.app, '/api/users', { method: 'POST', cookie, body: { ...account, username: `sin.correo${iteration}` } })).status, 201);
      db.close(); db = undefined;
    }
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});
