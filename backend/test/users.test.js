import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { permissionKeys } from '../src/permissions.js';
import { request } from './request.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const adminLogin = { email: 'admin@bitacoras.local', password: 'PruebaSegura2026!' };
const newUser = { name: 'Usuario de prueba', username: ('prueba@bitacoras.local').split('@')[0].toLowerCase(), email: 'prueba@bitacoras.local', password: 'UsuarioPrueba2026!', is_admin: false, active: true, permissions: ['radiotherapy.read'] };
const record = { patient_name: 'Paciente ficticio de permisos', date: '2026-10-08', arrival_time: '08:00', treatment_time: '08:30', status: 'Pendiente', observations: '' };
async function login(app, body) {
  const result = await request(app, '/api/auth/login', { method: 'POST', body });
  assert.equal(result.status, 200);
  return [].concat(result.headers['set-cookie'])[0].split(';')[0];
}
async function fixture(t) {
  const result = await createApp({ databasePath: ':memory:', adminPassword: adminLogin.password });
  t.after(() => result.db.close());
  return { ...result, cookie: await login(result.app, adminLogin) };
}
async function create(app, cookie, changes = {}) {
  const result = await request(app, '/api/users', { cookie, method: 'POST', body: { ...newUser, username: (changes.email || newUser.email).split('@')[0].toLowerCase().slice(0, 50), ...changes } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.user;
}
const editBody = (user, changes = {}) => ({ name: user.name, username: user.username, email: user.email, is_admin: user.is_admin, active: user.active, permissions: user.permissions, ...changes });
const cookieOptions = (cookie, method = 'GET', body) => ({ cookie, method, body });

test('inicia sesión con usuario o correo, normaliza mayúsculas y permite cambiar el usuario', async t => {
  const { app, cookie, db } = await fixture(t);
  const user = await create(app, cookie, { username: ' Captura.Unica ' });
  assert.equal(user.username, 'captura.unica');
  assert.equal((await request(app, '/api/users?q=CAPTURA.UNICA', { cookie })).body.users[0].id, user.id);
  for (const body of [{ identifier: ' CAPTURA.UNICA ', password: newUser.password }, { username: user.username, password: newUser.password }, { email: newUser.email, password: newUser.password }]) {
    const loggedIn = await request(app, '/api/auth/login', { method: 'POST', body });
    assert.equal(loggedIn.status, 200);
    assert.equal(loggedIn.body.user.id, user.id);
    assert.equal(loggedIn.body.user.username, user.username);
  }
  const userCookie = await login(app, { identifier: user.username, password: newUser.password });
  assert.equal((await request(app, '/api/auth/me', { cookie: userCookie })).body.user.username, user.username);
  const preserved = await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(user, { email: 'otro@bitacoras.local' })));
  assert.equal(preserved.body.user.username, user.username);
  const renamed = await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(preserved.body.user, { username: 'captura.nueva' })));
  assert.equal(renamed.status, 200);
  assert.equal((await request(app, '/api/auth/me', { cookie: userCookie })).body.user.username, 'captura.nueva');
  assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: { identifier: user.username, password: newUser.password } })).status, 401);
  await login(app, { identifier: 'captura.nueva', password: newUser.password });
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(user.id);
  assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: { identifier: 'captura.nueva', password: newUser.password } })).status, 401);
});

test('usuarios únicos, formato y protección de acceso con nombre de usuario', async t => {
  const { app, cookie, db } = await fixture(t);
  const user = await create(app, cookie, { username: 'captura' });
  for (const username of ['Captura', ' ADMIN ']) {
    assert.equal((await request(app, '/api/users', cookieOptions(cookie, 'POST', { ...newUser, email: 'otra@bitacoras.local', username }))).status, 409);
  }
  assert.equal((await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(user, { username: 'ADMIN' })))).status, 409);
  for (const username of ['', 'ab', 'a'.repeat(51), 'correo@dominio.local', 'dos palabras', 'ácceso', '-inicio', null, 42]) {
    assert.equal((await request(app, '/api/users', cookieOptions(cookie, 'POST', { ...newUser, email: 'otra@bitacoras.local', username }))).status, 400);
    assert.equal((await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(user, { username })))).status, 400);
  }
  assert.throws(() => db.prepare('UPDATE users SET username = ? WHERE id = ?').run('ADMIN', user.id), /UNIQUE/);
  for (const identifier of ['', ' ', null, {}, 'a'.repeat(201)]) {
    assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: { identifier, password: newUser.password } })).status, 400);
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: { identifier: 'captura', password: 'Incorrecta2026!' } })).status, 401);
  }
  assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: { identifier: 'captura', password: newUser.password } })).status, 429);
});

test('migra los usuarios existentes sin duplicados ni pérdida de contraseñas, permisos o sesiones', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bitacoras-username-'));
  const databasePath = join(directory, 'test.sqlite');
  let db;
  try {
    let result = await createApp({ databasePath, adminPassword: adminLogin.password });
    db = result.db;
    const cookie = await login(result.app, adminLogin);
    const first = await create(result.app, cookie, { email: 'captura@primero.local' });
    const second = await create(result.app, cookie, { email: 'captura@segundo.local', username: 'captura-2' });
    const hashes = db.prepare('SELECT id, password_hash FROM users ORDER BY id').all();
    db.exec('DROP INDEX users_username_idx; ALTER TABLE users DROP COLUMN username;');
    db.close(); db = undefined;
    for (let iteration = 0; iteration < 2; iteration++) {
      result = await createApp({ databasePath }); db = result.db;
      assert.deepEqual(db.prepare('SELECT id, password_hash FROM users ORDER BY id').all(), hashes);
      assert.equal(db.prepare('SELECT username FROM users WHERE id = ?').get(first.id).username, 'captura');
      assert.equal(db.prepare('SELECT username FROM users WHERE id = ?').get(second.id).username, 'captura-2');
      assert.equal((await request(result.app, '/api/auth/me', { cookie })).body.user.username, 'admin');
      const loggedIn = await request(result.app, '/api/auth/login', { method: 'POST', body: { identifier: 'captura-2', password: newUser.password } });
      assert.equal(loggedIn.status, 200);
      assert.equal(loggedIn.body.user.id, second.id);
      assert.deepEqual(loggedIn.body.user.permissions, ['radiotherapy.read']);
      db.close(); db = undefined;
    }
  } finally { db?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('usuarios: CRUD, correo único, búsqueda, paginación y respuestas sin secretos', async t => {
  const { app, cookie, db } = await fixture(t);
  const user = await create(app, cookie);
  assert.equal(user.is_admin, false);
  assert.equal(user.active, true);
  assert.equal(user.password_hash, undefined);
  assert.equal(user.password, undefined);
  const hash = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id).password_hash;
  assert.notEqual(hash, newUser.password);
  const list = await request(app, '/api/users?q=USUARIO&limit=1', { cookie });
  assert.equal(list.body.total, 1);
  assert.equal(list.body.users[0].id, user.id);
  assert.equal((await request(app, '/api/users', { cookie })).body.total, 2);
  assert.equal((await request(app, '/api/users?page=2&limit=1', { cookie })).body.users.length, 1);
  assert.equal((await request(app, `/api/users/${user.id}`, { cookie })).body.user.password_hash, undefined);
  assert.equal((await request(app, '/api/users', cookieOptions(cookie, 'POST', { ...newUser, email: newUser.email.toUpperCase() }))).status, 409);
  const update = await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(user, { name: 'María de prueba', username: ('editado@bitacoras.local').split('@')[0].toLowerCase(), email: 'editado@bitacoras.local', permissions: ['radiotherapy.read', 'radiotherapy.create'] })));
  assert.equal(update.status, 200);
  assert.equal(update.body.user.name, 'María de prueba');
  assert.deepEqual(update.body.user.permissions, ['radiotherapy.create', 'radiotherapy.read']);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id).password_hash, hash);
  assert.equal((await request(app, '/api/users?q=maria', { cookie })).body.total, 1);
  const userCookie = await login(app, { email: 'editado@bitacoras.local', password: newUser.password });
  assert.equal((await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'DELETE'))).status, 200);
  assert.equal((await request(app, `/api/users/${user.id}`, { cookie })).status, 404);
  assert.equal((await request(app, '/api/auth/me', { cookie: userCookie })).status, 401);
});

test('cada acción requiere su permiso en la API, incluyendo exportación y usuarios', async t => {
  const { app, cookie } = await fixture(t);
  const target = await create(app, cookie, { email: 'objetivo@bitacoras.local' });
  const recordId = (await request(app, '/api/records', cookieOptions(cookie, 'POST', record))).body.record.id;
  for (const [permission, method, path, body] of [
    ['radiotherapy.read', 'GET', '/api/records'],
    ['radiotherapy.read', 'GET', '/api/records/suggestions?q=maria'],
    ['radiotherapy.create', 'POST', '/api/records', record],
    ['radiotherapy.update', 'PUT', `/api/records/${recordId}`, record],
    ['radiotherapy.export', 'GET', '/api/records/export'],
    ['users.read', 'GET', '/api/users'],
    ['users.create', 'POST', '/api/users', { ...newUser, email: 'creado@bitacoras.local', permissions: [] }],
    ['users.update', 'PUT', `/api/users/${target.id}`, editBody(target, { permissions: [] })],
    ['users.delete', 'DELETE', `/api/users/${target.id}`],
    ['radiotherapy.delete', 'DELETE', `/api/records/${recordId}`]
  ]) {
    const actor = await create(app, cookie, { email: `${permission}-${path.split('/').at(-1).split('?')[0]}@bitacoras.local`, permissions: [] });
    const actorCookie = await login(app, { email: actor.email, password: newUser.password });
    assert.equal((await request(app, path, cookieOptions(actorCookie, method, body))).status, 403, permission);
    const permissions = [...new Set([`${permission.split('.')[0]}.read`, permission])];
    assert.equal((await request(app, `/api/users/${actor.id}`, cookieOptions(cookie, 'PUT', editBody(actor, { permissions })))).status, 200);
    assert.equal((await request(app, path, cookieOptions(actorCookie, method, body))).status, method === 'POST' ? 201 : 200, permission);
  }
  for (const [method, path] of [['GET', '/api/users'], ['GET', '/api/users/1'], ['POST', '/api/users'], ['PUT', '/api/users/1'], ['DELETE', '/api/users/1'], ['GET', '/api/permissions'], ['GET', '/api/records/export']]) {
    assert.equal((await request(app, path, { method })).status, 401);
  }
});

test('permiso revocado se aplica a la sesión existente; desactivar y cambiar clave revocan sesiones', async t => {
  const { app, cookie } = await fixture(t);
  const user = await create(app, cookie, { permissions: ['radiotherapy.read', 'radiotherapy.create'] });
  const actorCookie = await login(app, { email: user.email, password: newUser.password });
  await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(user, { permissions: ['radiotherapy.read'] })));
  assert.equal((await request(app, '/api/records', cookieOptions(actorCookie, 'POST', record))).status, 403);
  assert.equal((await request(app, '/api/records', { cookie: actorCookie })).status, 200);
  await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(user, { active: false })));
  assert.equal((await request(app, '/api/auth/me', { cookie: actorCookie })).status, 401);
  assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: { email: user.email, password: newUser.password } })).status, 401);
  await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(user)));
  const renewedCookie = await login(app, { email: user.email, password: newUser.password });
  await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(user, { password: 'NuevaUsuario2026!' })));
  assert.equal((await request(app, '/api/auth/me', { cookie: renewedCookie })).status, 401);
  assert.equal((await request(app, '/api/auth/login', { method: 'POST', body: { email: user.email, password: newUser.password } })).status, 401);
  await login(app, { email: user.email, password: 'NuevaUsuario2026!' });
});

test('evita escalamiento de privilegios, autoasignación y pérdida del administrador', async t => {
  const { app, cookie } = await fixture(t);
  const manager = await create(app, cookie, { permissions: ['users.read', 'users.create', 'users.update', 'users.delete', 'radiotherapy.read'] });
  const managerCookie = await login(app, { email: manager.email, password: newUser.password });
  for (const changes of [{ is_admin: true }, { permissions: ['radiotherapy.read', 'radiotherapy.export'] }]) {
    assert.equal((await request(app, '/api/users', cookieOptions(managerCookie, 'POST', { ...newUser, email: 'ilegal@bitacoras.local', ...changes }))).status, 403);
  }
  assert.equal((await request(app, '/api/users/1', cookieOptions(managerCookie, 'PUT', { ...newUser, email: adminLogin.email, is_admin: false }))).status, 403);
  assert.equal((await request(app, '/api/users/1', cookieOptions(managerCookie, 'DELETE'))).status, 403);
  assert.equal((await request(app, `/api/users/${manager.id}`, cookieOptions(managerCookie, 'PUT', editBody(manager, { permissions: [] })))).status, 409);
  assert.equal((await request(app, '/api/users/1', cookieOptions(cookie, 'DELETE'))).status, 409);
  const admin = (await request(app, '/api/auth/me', { cookie })).body.user;
  assert.deepEqual(admin.permissions, permissionKeys);
  assert.equal((await request(app, '/api/users/1', cookieOptions(cookie, 'PUT', editBody(admin, { active: false })))).status, 409);
  assert.equal((await request(app, '/api/users/1', cookieOptions(cookie, 'PUT', editBody(admin, { is_admin: false })))).status, 409);
});

test('conserva autores con registros: desactivación en lugar de eliminación', async t => {
  const { app, cookie } = await fixture(t);
  const user = await create(app, cookie, { permissions: ['radiotherapy.read', 'radiotherapy.create'] });
  const actorCookie = await login(app, { email: user.email, password: newUser.password });
  const result = await request(app, '/api/records', cookieOptions(actorCookie, 'POST', record));
  assert.equal(result.status, 201);
  assert.equal((await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'DELETE'))).status, 409);
  assert.equal((await request(app, `/api/users/${user.id}`, cookieOptions(cookie, 'PUT', editBody(user, { active: false })))).status, 200);
  const detail = await request(app, `/api/records/${result.body.record.id}`, { cookie });
  assert.equal(detail.body.record.author, user.name);
});

test('valida usuarios, permisos y filtros y no admite permisos inventados', async t => {
  const { app, cookie } = await fixture(t);
  for (const change of [{ name: ' ' }, { name: 'x'.repeat(101) }, { email: 'mal correo' }, { password: 'corta' }, { password: 42 }, { permissions: null }, { permissions: ['inventado.read'] }, { permissions: ['radiotherapy.create'] }, { active: 'true' }, { is_admin: 1 }]) {
    assert.equal((await request(app, '/api/users', cookieOptions(cookie, 'POST', { ...newUser, ...change }))).status, 400);
  }
  for (const path of ['/api/users?page=0', '/api/users?limit=999', '/api/users?q=uno&q=dos', '/api/users/no-valido']) assert.equal((await request(app, path, { cookie })).status, 400);
});
