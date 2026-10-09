import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { modules, permissionKeys, can, validatePermissions } from './permissions.js';
import { ENTITLEMENT_TYPES } from '../../shared/entitlement-types.mjs';

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const statuses = ['Pendiente', 'En proceso', 'Completada'];
const priorities = ['Normal', 'Alta', 'Urgente'];
const surgeryTypes = ['Hospitalizado', 'Ambulatorio'];
const sessionDuration = 8 * 60 * 60 * 1000;
const idleSessionDuration = 5 * 60 * 1000;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = await derive(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '2100-12-31' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validateRecord(body, existing = {}) {
  const fields = { patient_name: [2, 150, 'El nombre del paciente'], observations: [0, 3000, 'Las observaciones'] };
  const record = {};
  for (const [key, [min, max, label]] of Object.entries(fields)) {
    const value = key === 'observations' && body[key] == null ? '' : body[key];
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw Object.assign(new Error(`${label} debe tener entre ${min} y ${max} caracteres.`), { status: 400 });
    record[key] = value.trim();
  }
  if (!validDate(body.date)) throw Object.assign(new Error('Selecciona una fecha válida entre 1900 y 2100.'), { status: 400 });
  const arrivalTime = body.arrival_time === undefined ? existing.arrival_time ?? '' : body.arrival_time;
  if (typeof arrivalTime !== 'string' || (arrivalTime !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime))) throw Object.assign(new Error('La hora de llegada debe tener formato HH:MM de 24 horas.'), { status: 400 });
  record.arrival_time = arrivalTime;
  if (typeof body.treatment_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.treatment_time)) throw Object.assign(new Error('La hora programada de tratamiento es obligatoria y debe tener formato HH:MM de 24 horas.'), { status: 400 });
  record.treatment_time = body.treatment_time;
  const status = body.status ?? 'Pendiente';
  if (!statuses.includes(status)) throw Object.assign(new Error('El estado de atención no es válido.'), { status: 400 });
  const rawRfc = body.rfc === undefined ? existing.rfc ?? '' : body.rfc;
  if (typeof rawRfc !== 'string') throw Object.assign(new Error('El RFC debe ser texto.'), { status: 400 });
  const rfc = rawRfc.trim().toUpperCase();
  if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) throw Object.assign(new Error('Escribe un RFC válido de 12 o 13 caracteres, con homoclave.'), { status: 400 });
  const surgery_type = body.surgery_type === undefined ? existing.surgery_type ?? '' : body.surgery_type;
  if (surgery_type !== '' && !surgeryTypes.includes(surgery_type)) throw Object.assign(new Error('Selecciona Hospitalizado o Ambulatorio como tipo de cirugía.'), { status: 400 });
  const rawEntitlement = body.entitlement_type === undefined ? existing.entitlement_type ?? '' : body.entitlement_type;
  if (typeof rawEntitlement !== 'string' || (rawEntitlement !== '' && !ENTITLEMENT_TYPES.some(type => type.code === rawEntitlement))) throw Object.assign(new Error('Selecciona un tipo de derechohabiencia del catálogo por código o nombre.'), { status: 400 });
  return { ...record, date: body.date, status, rfc, surgery_type, entitlement_type: rawEntitlement || null };
}

export async function createApp({ databasePath, adminEmail = process.env.ADMIN_EMAIL || 'admin@bitacoras.local', adminPassword = process.env.ADMIN_PASSWORD, adminName = process.env.ADMIN_NAME || 'Administrador', origin = process.env.APP_ORIGIN || 'http://localhost:3100', secureCookies = process.env.COOKIE_SECURE === 'true' } = {}) {
  if (!databasePath) throw new Error('Se requiere una ruta de base de datos.');
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  if (databasePath !== ':memory:') chmodSync(databasePath, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_permissions (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, permission TEXT NOT NULL, PRIMARY KEY(user_id, permission));
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, idle_expires_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, date TEXT NOT NULL, area TEXT NOT NULL, responsible TEXT NOT NULL,
      description TEXT NOT NULL, observations TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('Pendiente', 'En proceso', 'Completada')),
      priority TEXT NOT NULL CHECK(priority IN ('Normal', 'Alta', 'Urgente')),
      created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_date_idx ON records(date DESC);
    CREATE INDEX IF NOT EXISTS sessions_expiration_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS network_assistance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'Solicitada' CHECK(status IN ('Solicitada', 'Atendida')),
      requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requester_name TEXT NOT NULL, requested_at TEXT NOT NULL,
      handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL, handled_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS network_assistance_pending_idx ON network_assistance(record_id) WHERE status = 'Solicitada';
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC, id DESC);
  `);
  // Migración aditiva: conserva íntegros los registros anteriores y sus sesiones.
  const existingColumns = new Set(db.prepare('PRAGMA table_info(records)').all().map(column => column.name));
  db.exec('BEGIN');
  try {
    db.exec('CREATE TABLE IF NOT EXISTS entitlement_types (code TEXT PRIMARY KEY, name TEXT NOT NULL)');
    const saveEntitlement = db.prepare('INSERT INTO entitlement_types (code, name) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET name = excluded.name');
    for (const type of ENTITLEMENT_TYPES) saveEntitlement.run(type.code, type.name);
    if (!existingColumns.has('entitlement_type')) db.exec('ALTER TABLE records ADD COLUMN entitlement_type TEXT REFERENCES entitlement_types(code)');
    for (const column of ['patient_name', 'arrival_time', 'treatment_time', 'rfc', 'surgery_type', 'arrived_at', 'treatment_started_at', 'treatment_completed_at']) {
      if (!existingColumns.has(column)) db.exec(`ALTER TABLE records ADD COLUMN ${column} TEXT`);
    }
    if (!existingColumns.has('arrived_at')) db.exec("UPDATE records SET arrived_at = updated_at WHERE arrival_time IS NOT NULL AND arrival_time != ''");
    const sessionColumns = new Set(db.prepare('PRAGMA table_info(sessions)').all().map(column => column.name));
    if (!sessionColumns.has('idle_expires_at')) db.exec('ALTER TABLE sessions ADD COLUMN idle_expires_at INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE sessions SET idle_expires_at = expires_at WHERE idle_expires_at = 0');
    const assistanceColumns = new Set(db.prepare('PRAGMA table_info(network_assistance)').all().map(column => column.name));
    if (!assistanceColumns.has('assigned_to')) db.exec('ALTER TABLE network_assistance ADD COLUMN assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL');
    const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
    if (!userColumns.has('is_admin')) {
      db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
      // The original application only had administrative accounts.
      db.exec('UPDATE users SET is_admin = 1');
    }
    if (!userColumns.has('active')) db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    db.exec('CREATE INDEX IF NOT EXISTS records_treatment_idx ON records(date, treatment_time)');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  db.function('normalize', { deterministic: true }, normalize);
  if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
    const password = adminPassword || (process.env.NODE_ENV === 'production' ? '' : 'Bitacoras2026!');
    if (password.length < 12) { db.close(); throw new Error('Configura ADMIN_PASSWORD con al menos 12 caracteres para crear el administrador.'); }
    db.prepare('INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)').run(adminName, adminEmail.trim().toLowerCase(), await hashPassword(password));
  }
  const dummyHash = await hashPassword(randomBytes(24).toString('hex'));
  const app = express();
  const attempts = new Map();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (req.get('X-Bitacoras-Request') !== '1' || (req.get('Origin') && req.get('Origin') !== origin))) return res.status(403).json({ message: 'La solicitud no tiene un origen autorizado.' });
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  function writeAudit(actor, action, entity, entityId = null, details = {}) {
    db.prepare('INSERT INTO audit_events (actor_id, actor_name, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(actor?.id ?? null, actor?.name ?? 'Anónimo', action, entity, entityId == null ? null : String(entityId), JSON.stringify(details), new Date().toISOString());
  }
  function auth(req, res, next) {
    const cookie = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith('bitacoras_session='));
    const token = cookie?.slice('bitacoras_session='.length);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return res.status(401).json({ message: 'Inicia sesión para continuar.' });
    const now = Date.now();
    const tokenHash = digest(token);
    const session = db.prepare('SELECT users.id, users.name, users.email, users.is_admin, users.active FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ? AND idle_expires_at > ? AND users.active = 1').get(tokenHash, now, now);
    if (!session) return res.status(401).json({ message: 'Tu sesión terminó por inactividad o vencimiento. Vuelve a iniciar sesión.' });
    db.prepare('UPDATE sessions SET idle_expires_at = ? WHERE token_hash = ?').run(now + idleSessionDuration, tokenHash);
    req.user = publicUser(session);
    req.sessionHash = tokenHash;
    next();
  }
  function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email, is_admin: Boolean(user.is_admin), active: Boolean(user.active), permissions: user.is_admin ? [...permissionKeys] : db.prepare('SELECT permission FROM user_permissions WHERE user_id = ? ORDER BY permission').all(user.id).map(row => row.permission) };
  }
  const requirePermission = permission => (req, res, next) => {
    if (!can(req.user, permission)) return res.status(403).json({ message: 'No tienes permiso para realizar esta acción.' });
    next();
  };
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: secureCookies, path: '/' };
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 200 || typeof password !== 'string' || password.length > 200) return res.status(400).json({ message: 'Escribe tu correo y contraseña.' });
    const now = Date.now();
    for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    const key = req.ip;
    const count = attempts.get(key) || { failures: 0, expires: now + 15 * 60 * 1000 };
    if (count.failures >= 5) { writeAudit(null, 'auth.login_blocked', 'auth', null, { reason: 'rate_limited' }); return res.status(429).json({ message: 'Demasiados intentos. Inténtalo de nuevo en 15 minutos.' }); }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    const valid = await verifyPassword(password, user?.password_hash || dummyHash);
    if (!user || !valid || !user.active) { count.failures++; attempts.set(key, count); writeAudit(null, 'auth.login_failed', 'auth', null, { reason: 'invalid_credentials' }); return res.status(401).json({ message: 'El correo o la contraseña son incorrectos.' }); }
    attempts.delete(key);
    db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR idle_expires_at <= ?').run(now, now);
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, idle_expires_at) VALUES (?, ?, ?, ?)').run(digest(token), user.id, now + sessionDuration, now + idleSessionDuration);
    writeAudit(user, 'auth.login_succeeded', 'auth');
    res.cookie('bitacoras_session', token, { ...cookieOptions, maxAge: sessionDuration });
    res.json({ user: publicUser(user) });
  });
  app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));
  app.post('/api/auth/activity', auth, (_req, res) => res.status(204).end());
  app.post('/api/auth/logout', auth, (req, res) => {
    writeAudit(req.user, 'auth.logout', 'auth');
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.sessionHash);
    res.clearCookie('bitacoras_session', cookieOptions).json({ message: 'Sesión cerrada.' });
  });
  app.post('/api/auth/password', auth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || currentPassword.length > 200 || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 200) return res.status(400).json({ message: 'La nueva contraseña debe tener entre 12 y 200 caracteres.' });
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!await verifyPassword(currentPassword, user.password_hash)) return res.status(400).json({ message: 'La contraseña actual es incorrecta.' });
    const passwordHash = await hashPassword(newPassword);
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user.id, req.sessionHash);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    writeAudit(req.user, 'auth.password_changed', 'user', req.user.id);
    res.json({ message: 'Contraseña actualizada.' });
  });
  app.get('/api/audit', auth, (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ message: 'La auditoría está disponible solo para administradores.' });
    const { page = '1', limit = '20' } = req.query;
    if ([page, limit].some(value => typeof value !== 'string') || !/^[0-9]+$/.test(page) || !/^[0-9]+$/.test(limit) || Number(page) < 1 || Number(page) > 100000 || Number(limit) < 1 || Number(limit) > 100) return res.status(400).json({ message: 'Revisa la página y el límite de auditoría.' });
    const total = db.prepare('SELECT COUNT(*) AS total FROM audit_events').get().total;
    const events = db.prepare('SELECT id, actor_id, actor_name, action, entity, entity_id, details, created_at FROM audit_events ORDER BY id DESC LIMIT ? OFFSET ?').all(Number(limit), (Number(page) - 1) * Number(limit)).map(event => ({ ...event, details: JSON.parse(event.details) }));
    res.json({ events, total, page: Number(page), pages: Math.max(1, Math.ceil(total / Number(limit))) });
  });
  app.get('/api/permissions', auth, (_req, res) => res.json({ modules }));
  app.use('/api/users', auth);
  const findUser = (req, res, next) => {
    if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ message: 'El usuario no es válido.' });
    req.targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
    if (!req.targetUser) return res.status(404).json({ message: 'No se encontró el usuario.' });
    next();
  };
  function validateUser(body, actor, target) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (name.length < 2 || name.length > 100) throw Object.assign(new Error('El nombre debe tener entre 2 y 100 caracteres.'), { status: 400 });
    if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Escribe un correo electrónico válido.'), { status: 400 });
    if (typeof body.is_admin !== 'boolean' || typeof body.active !== 'boolean') throw Object.assign(new Error('Selecciona el perfil y el estado del usuario.'), { status: 400 });
    const permissions = validatePermissions(body.permissions);
    if (!actor.is_admin && (body.is_admin || target?.is_admin || permissions.some(permission => !can(actor, permission)))) throw Object.assign(new Error('Solo puedes asignar los permisos que tienes. Los administradores son gestionados por otro administrador.'), { status: 403 });
    const password = body.password ?? '';
    if (typeof password !== 'string' || (!target && !password) || (password && (password.length < 12 || password.length > 200))) throw Object.assign(new Error('La contraseña debe tener entre 12 y 200 caracteres.'), { status: 400 });
    return { name, email, is_admin: body.is_admin, active: body.active, permissions, password };
  }
  function protectAccount(actor, target, values) {
    if (actor.id === target.id && (!values.active || values.is_admin !== Boolean(target.is_admin) || (!target.is_admin && JSON.stringify([...values.permissions].sort()) !== JSON.stringify([...actor.permissions].sort())))) throw Object.assign(new Error('No puedes desactivar tu cuenta ni cambiar tus propios permisos.'), { status: 409 });
    if (target.is_admin && target.active && (!values.is_admin || !values.active) && db.prepare('SELECT COUNT(*) AS total FROM users WHERE is_admin = 1 AND active = 1').get().total <= 1) throw Object.assign(new Error('Debe permanecer al menos un administrador activo.'), { status: 409 });
  }
  function savePermissions(id, permissions) {
    db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);
    const insert = db.prepare('INSERT INTO user_permissions (user_id, permission) VALUES (?, ?)');
    for (const permission of permissions) insert.run(id, permission);
  }
  function ensureUniqueEmail(email, id = 0) {
    if (db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id)) throw Object.assign(new Error('Este correo electrónico ya está registrado.'), { status: 409 });
  }
  app.get('/api/users', requirePermission('users.read'), (req, res) => {
    const { q = '', page = '1', limit = '8' } = req.query;
    if ([q, page, limit].some(value => typeof value !== 'string') || q.length > 200 || !/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 100000 || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) return res.status(400).json({ message: 'Revisa los filtros de usuarios.' });
    const search = normalize(q.trim());
    const where = "WHERE instr(normalize(name || ' ' || email), ?) > 0";
    const total = db.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).get(search).total;
    const users = db.prepare(`SELECT id, name, email, is_admin, active FROM users ${where} ORDER BY is_admin DESC, name, id LIMIT ? OFFSET ?`).all(search, Number(limit), (Number(page) - 1) * Number(limit)).map(publicUser);
    res.json({ users, total, pages: Math.max(1, Math.ceil(total / Number(limit))) });
  });
  app.get('/api/users/:id', requirePermission('users.read'), findUser, (req, res) => res.json({ user: publicUser(req.targetUser) }));
  app.post('/api/users', requirePermission('users.create'), async (req, res) => {
    const values = validateUser(req.body || {}, req.user);
    const passwordHash = await hashPassword(values.password);
    ensureUniqueEmail(values.email);
    db.exec('BEGIN');
    try {
      const result = db.prepare('INSERT INTO users (name, email, password_hash, is_admin, active) VALUES (?, ?, ?, ?, ?)').run(values.name, values.email, passwordHash, Number(values.is_admin), Number(values.active));
      const id = Number(result.lastInsertRowid);
      savePermissions(id, values.is_admin ? [] : values.permissions);
      db.exec('COMMIT');
      writeAudit(req.user, 'user.created', 'user', id);
      res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  app.put('/api/users/:id', requirePermission('users.update'), findUser, async (req, res) => {
    const values = validateUser(req.body || {}, req.user, req.targetUser);
    const passwordHash = values.password ? await hashPassword(values.password) : req.targetUser.password_hash;
    protectAccount(req.user, req.targetUser, values);
    ensureUniqueEmail(values.email, req.targetUser.id);
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE users SET name = ?, email = ?, password_hash = ?, is_admin = ?, active = ? WHERE id = ?').run(values.name, values.email, passwordHash, Number(values.is_admin), Number(values.active), req.targetUser.id);
      savePermissions(req.targetUser.id, values.is_admin ? [] : values.permissions);
      if (!values.active || values.password) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.targetUser.id);
      db.exec('COMMIT');
      writeAudit(req.user, 'user.updated', 'user', req.targetUser.id);
      res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.targetUser.id)) });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  app.delete('/api/users/:id', requirePermission('users.delete'), findUser, (req, res) => {
    if (!req.user.is_admin && req.targetUser.is_admin) return res.status(403).json({ message: 'Los administradores son gestionados por otro administrador.' });
    protectAccount(req.user, req.targetUser, { active: false, is_admin: false, permissions: [] });
    if (db.prepare('SELECT id FROM records WHERE created_by = ? LIMIT 1').get(req.targetUser.id)) return res.status(409).json({ message: 'Este usuario tiene registros de radioterapia. Desactívalo para conservar su historial.' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.targetUser.id);
    writeAudit(req.user, 'user.deleted', 'user', req.targetUser.id);
    res.json({ message: 'Usuario eliminado.' });
  });
  app.use('/api/records', auth);
  app.get(['/api/records', '/api/records/export', '/api/records/suggestions'], requirePermission('radiotherapy.read'), (req, res, next) => { if (req.path.endsWith('/export')) return requirePermission('radiotherapy.export')(req, res, next); next(); }, (req, res) => {
    const { q = '', status = '', priority = '', date = '', from = '', to = '', page = '1', limit = '8' } = req.query;
    if ([q, status, priority, date, from, to, page, limit].some(value => typeof value !== 'string') || q.length > 200 || (status && !statuses.includes(status)) || (priority && !priorities.includes(priority)) || (date && !validDate(date)) || (from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to) || !/^\d+$/.test(page) || !/^\d+$/.test(limit) || Number(page) < 1 || Number(page) > 100000 || Number(limit) < 1 || Number(limit) > 100) return res.status(400).json({ message: 'Revisa los filtros de búsqueda.' });
    const clauses = [], params = [];
    if (req.path.endsWith('/suggestions')) {
      clauses.push("patient_name IS NOT NULL AND instr(normalize(patient_name), ?) > 0"); params.push(normalize(q.trim()));
    } else if (q.trim()) { clauses.push("instr(normalize(COALESCE(patient_name, '') || ' ' || observations || ' ' || CASE WHEN patient_name IS NULL THEN title ELSE '' END), ?) > 0"); params.push(normalize(q.trim())); }
    for (const [key, value, operator] of [['status', status, '='], ['priority', priority, '='], ['date', date, '='], ['date', from, '>='], ['date', to, '<=']]) if (value) { clauses.push(`${key} ${operator} ?`); params.push(value); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    if (req.path.endsWith('/suggestions')) return res.json({ suggestions: db.prepare(`SELECT MIN(patient_name) AS name, COUNT(*) AS count FROM records ${where} GROUP BY normalize(patient_name) ORDER BY MAX(date) DESC, normalize(patient_name) LIMIT 6`).all(...params) });
    const total = db.prepare(`SELECT COUNT(*) AS count FROM records ${where}`).get(...params).count;
    const rows = db.prepare(`SELECT records.*, users.name AS author, (SELECT requested_at FROM network_assistance WHERE record_id = records.id AND status = 'Solicitada') AS assistance_requested_at FROM records JOIN users ON users.id = records.created_by ${where} ORDER BY date DESC, (treatment_time IS NULL), treatment_time ASC, arrival_time ASC, records.id DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), (Number(page) - 1) * Number(limit));
    const stats = db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(status = 'Pendiente'), 0) AS pending, COALESCE(SUM(status = 'En proceso'), 0) AS inProgress, COALESCE(SUM(status = 'Completada'), 0) AS completed FROM records ${where}`).get(...params);
    res.json({ records: rows, total, page: Number(page), pages: Math.max(1, Math.ceil(total / Number(limit))), stats });
  });
  const findRecord = (req, res, next) => {
    if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ message: 'El folio no es válido.' });
    req.record = db.prepare("SELECT records.*, users.name AS author, (SELECT requested_at FROM network_assistance WHERE record_id = records.id AND status = 'Solicitada') AS assistance_requested_at FROM records JOIN users ON users.id = records.created_by WHERE records.id = ?").get(Number(req.params.id));
    if (!req.record) return res.status(404).json({ message: 'No se encontró la bitácora.' });
    next();
  };
  app.get('/api/records/:id', requirePermission('radiotherapy.read'), findRecord, (req, res) => res.json({ record: req.record }));
  app.post('/api/records/:id/arrival', requirePermission('radiotherapy.arrive'), findRecord, (req, res) => {
    if (!req.record.patient_name) return res.status(400).json({ message: 'Completa el nombre del paciente antes de registrar su llegada.' });
    const arrivalTime = req.body?.arrival_time;
    if (typeof arrivalTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime)) return res.status(400).json({ message: 'La hora de llegada debe tener formato HH:MM de 24 horas.' });
    if (req.record.arrived_at) return res.json({ record: req.record, message: 'La llegada del paciente ya estaba registrada.' });
    const arrivedAt = new Date().toISOString();
    db.prepare('UPDATE records SET arrival_time = ?, arrived_at = ?, updated_at = ? WHERE id = ? AND arrived_at IS NULL').run(arrivalTime, arrivedAt, arrivedAt, req.record.id);
    writeAudit(req.user, 'record.arrival_recorded', 'record', req.record.id);
    const updated = db.prepare('SELECT records.*, users.name AS author, (SELECT requested_at FROM network_assistance WHERE record_id = records.id AND status = \'Solicitada\') AS assistance_requested_at FROM records JOIN users ON users.id = records.created_by WHERE records.id = ?').get(req.record.id);
    res.json({ record: updated, message: 'Llegada registrada. Ya puedes solicitar internet.' });
  });
  app.post('/api/records/:id/network-assistance', requirePermission('radiotherapy.assist'), findRecord, (req, res) => {
    if (!req.record.patient_name) return res.status(400).json({ message: 'Completa el nombre del paciente antes de solicitar asistencia.' });
    if (!req.record.arrived_at) return res.status(409).json({ message: 'Registra la llegada del paciente antes de solicitar internet.' });
    const existing = db.prepare("SELECT * FROM network_assistance WHERE record_id = ? AND status = 'Solicitada'").get(req.record.id);
    if (existing) return res.json({ request: existing, message: 'La asistencia ya está solicitada. Tu ingeniero va en camino.' });
    const result = db.prepare('INSERT INTO network_assistance (record_id, requested_by, requester_name, requested_at) VALUES (?, ?, ?, ?)').run(req.record.id, req.user.id, req.user.name, new Date().toISOString());
    const requestId = Number(result.lastInsertRowid);
    writeAudit(req.user, 'network.requested', 'network_assistance', requestId);
    res.status(201).json({ request: db.prepare('SELECT * FROM network_assistance WHERE id = ?').get(requestId), message: 'Tu ingeniero va en camino' });
  });
  app.post('/api/records', requirePermission('radiotherapy.create'), (req, res) => {
    const record = validateRecord(req.body || {}), now = new Date().toISOString();
    const result = db.prepare('INSERT INTO records (title, date, area, responsible, description, observations, status, priority, created_by, created_at, updated_at, patient_name, arrival_time, treatment_time, rfc, surgery_type, entitlement_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(record.patient_name, record.date, 'Radioterapia', req.user.name, '', record.observations, record.status, 'Normal', req.user.id, now, now, record.patient_name, record.arrival_time, record.treatment_time, record.rfc, record.surgery_type, record.entitlement_type);
    const id = Number(result.lastInsertRowid);
    writeAudit(req.user, 'record.created', 'record', id);
    res.status(201).json({ record: db.prepare('SELECT * FROM records WHERE id = ?').get(id) });
  });
  app.put('/api/records/:id', requirePermission('radiotherapy.update'), findRecord, (req, res) => {
    const record = validateRecord(req.body || {}, req.record), now = new Date().toISOString();
    let treatmentStartedAt = req.record.treatment_started_at, treatmentCompletedAt = req.record.treatment_completed_at;
    if (record.status === 'Pendiente' && req.record.status !== 'Pendiente') { treatmentStartedAt = null; treatmentCompletedAt = null; }
    else if (record.status === 'En proceso' && req.record.status !== 'En proceso') { treatmentStartedAt = now; treatmentCompletedAt = null; }
    else if (record.status === 'Completada' && req.record.status !== 'Completada') treatmentCompletedAt = now;
    db.prepare('UPDATE records SET patient_name = ?, date = ?, arrival_time = ?, treatment_time = ?, observations = ?, status = ?, rfc = ?, surgery_type = ?, entitlement_type = ?, treatment_started_at = ?, treatment_completed_at = ?, updated_at = ? WHERE id = ?').run(record.patient_name, record.date, record.arrival_time, record.treatment_time, record.observations, record.status, record.rfc, record.surgery_type, record.entitlement_type, treatmentStartedAt, treatmentCompletedAt, now, req.record.id);
    writeAudit(req.user, 'record.updated', 'record', req.record.id);
    if (record.status !== req.record.status) writeAudit(req.user, 'record.status_changed', 'record', req.record.id);
    res.json({ record: db.prepare('SELECT * FROM records WHERE id = ?').get(req.record.id) });
  });
  app.delete('/api/records/:id', requirePermission('radiotherapy.delete'), findRecord, (req, res) => {
    db.prepare('DELETE FROM records WHERE id = ?').run(req.record.id);
    writeAudit(req.user, 'record.deleted', 'record', req.record.id);
    res.json({ message: 'Bitácora eliminada.' });
  });
  function recognitionPeriod(month) {
    const now = new Date();
    month ??= `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)) throw Object.assign(new Error('Selecciona un mes válido para el reconocimiento.'), { status: 400 });
    const [year, monthNumber] = month.split('-').map(Number);
    return { month, start: new Date(year, monthNumber - 1, 1).toISOString(), end: new Date(year, monthNumber, 1).toISOString() };
  }
  function recognitionFor(engineerId, period = recognitionPeriod()) {
    if (engineerId == null) return null;
    const person = db.prepare('SELECT name FROM users WHERE id = ?').get(engineerId);
    const completed = db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action = 'network.completed' AND actor_id = ? AND COALESCE(json_extract(details, '$.handled_at'), created_at) >= ? AND COALESCE(json_extract(details, '$.handled_at'), created_at) < ?").get(engineerId, period.start, period.end).count;
    return { engineer_id: engineerId, engineer_name: person?.name || 'Redes', month: period.month, completed, gold: completed > 10 };
  }
  app.use('/api/network-assistance', auth);
  app.get('/api/network-assistance/recognition', requirePermission('networks.read'), (req, res) => {
    const { month, engineer = '', page = '1', limit = '8' } = req.query;
    const period = recognitionPeriod(month);
    if ([engineer, page, limit].some(value => typeof value !== 'string') || (engineer !== '' && (!/^[1-9][0-9]*$/.test(engineer) || !Number.isSafeInteger(Number(engineer)))) || !/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 100000 || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) return res.status(400).json({ message: 'Revisa los filtros de reconocimiento.' });
    const people = db.prepare("SELECT users.id, users.active FROM users WHERE EXISTS (SELECT 1 FROM user_permissions WHERE user_id = users.id AND permission = 'networks.update') ORDER BY users.name, users.id").all();
    const engineers = people.map(person => ({ ...recognitionFor(person.id, period), active: Boolean(person.active) }));
    const clauses = ["action = 'network.completed'", "COALESCE(json_extract(details, '$.handled_at'), created_at) >= ?", "COALESCE(json_extract(details, '$.handled_at'), created_at) < ?"];
    const params = [period.start, period.end];
    if (engineer) { clauses.push("actor_id = ?"); params.push(Number(engineer)); }
    const where = clauses.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS total FROM audit_events WHERE ${where}`).get(...params).total;
    const history = db.prepare(`SELECT id, entity_id AS assistance_id, actor_id AS engineer_id, actor_name AS engineer_name, COALESCE(json_extract(details, '$.record_id'), (SELECT record_id FROM network_assistance WHERE id = CAST(audit_events.entity_id AS INTEGER))) AS record_id, COALESCE(json_extract(details, '$.handled_at'), created_at) AS handled_at FROM audit_events WHERE ${where} ORDER BY handled_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), (Number(page) - 1) * Number(limit));
    res.json({ month: period.month, start_at: period.start, end_at: period.end, engineers, personal: recognitionFor(req.user.id, period), history, total, page: Number(page), pages: Math.max(1, Math.ceil(total / Number(limit))) });
  });
  app.get('/api/network-assistance', requirePermission('networks.read'), (req, res) => {
    const { status = 'Solicitada', page = '1', limit = '8' } = req.query;
    if ([status, page, limit].some(value => typeof value !== 'string') || !['', 'Solicitada', 'Atendida'].includes(status) || !/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 100000 || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) return res.status(400).json({ message: 'Revisa los filtros de solicitudes.' });
    const where = status ? 'WHERE network_assistance.status = ?' : '';
    const params = status ? [status] : [];
    const total = db.prepare(`SELECT COUNT(*) AS total FROM network_assistance ${where}`).get(...params).total;
    const requests = db.prepare(`SELECT network_assistance.*, records.patient_name, records.rfc, records.date, handler.name AS engineer_name, assignee.name AS assigned_name FROM network_assistance JOIN records ON records.id = network_assistance.record_id LEFT JOIN users AS handler ON handler.id = network_assistance.handled_by LEFT JOIN users AS assignee ON assignee.id = network_assistance.assigned_to ${where} ORDER BY requested_at DESC, network_assistance.id DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), (Number(page) - 1) * Number(limit));
    const assignees = db.prepare("SELECT id, name FROM users WHERE active = 1 AND (is_admin = 1 OR id IN (SELECT user_id FROM user_permissions WHERE permission = 'networks.update')) ORDER BY name, id").all();
    res.json({ requests, assignees, total, page: Number(page), pages: Math.max(1, Math.ceil(total / Number(limit))) });
  });
  app.patch('/api/network-assistance/:id', requirePermission('networks.update'), (req, res) => {
    if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ message: 'La solicitud no es válida.' });
    const assistance = db.prepare('SELECT * FROM network_assistance WHERE id = ?').get(Number(req.params.id));
    if (!assistance) return res.status(404).json({ message: 'No se encontró la solicitud.' });
    if (Object.hasOwn(req.body || {}, 'assigned_to')) {
      if (assistance.status !== 'Solicitada') return res.status(409).json({ message: 'Solo puedes asignar solicitudes pendientes.' });
      const assignedTo = req.body.assigned_to;
      if (assignedTo !== null && (!Number.isSafeInteger(assignedTo) || assignedTo < 1)) return res.status(400).json({ message: 'Selecciona una persona válida de Redes.' });
      if (assignedTo !== null && !db.prepare("SELECT users.id FROM users WHERE users.id = ? AND users.active = 1 AND (users.is_admin = 1 OR EXISTS (SELECT 1 FROM user_permissions WHERE user_id = users.id AND permission = 'networks.update'))").get(assignedTo)) return res.status(400).json({ message: 'La persona seleccionada no tiene permiso activo para atender solicitudes de Redes.' });
      db.prepare('UPDATE network_assistance SET assigned_to = ? WHERE id = ? AND status = \'Solicitada\'').run(assignedTo, assistance.id);
      writeAudit(req.user, 'network.assigned', 'network_assistance', assistance.id);
      return res.json({ request: db.prepare('SELECT * FROM network_assistance WHERE id = ?').get(assistance.id), message: assignedTo === null ? 'Solicitud sin asignar.' : 'Solicitud asignada.' });
    }
    if (req.body?.status !== 'Atendida') return res.status(400).json({ message: 'Selecciona Atendida para completar la solicitud.' });
    const handledAt = new Date().toISOString();
    let changes;
    db.exec('BEGIN');
    try {
      changes = db.prepare("UPDATE network_assistance SET status = 'Atendida', handled_by = ?, handled_at = ? WHERE id = ? AND status = 'Solicitada'").run(req.user.id, handledAt, assistance.id).changes;
      if (changes) writeAudit(req.user, 'network.completed', 'network_assistance', assistance.id, { engineer_id: req.user.id, record_id: assistance.record_id, handled_at: handledAt });
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    const completedRequest = db.prepare('SELECT * FROM network_assistance WHERE id = ?').get(assistance.id);
    res.json({ request: completedRequest, message: 'Asistencia de Redes atendida.', newly_completed: Boolean(changes), recognition: recognitionFor(completedRequest.handled_by) });
  });
  app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    if (status >= 500) console.error('Error de API:', error.message);
    res.status(status).json({ message: status === 413 ? 'La solicitud es demasiado grande.' : status >= 500 ? 'No se pudo completar la operación.' : error.type === 'entity.parse.failed' ? 'La solicitud no contiene JSON válido.' : error.message });
  });
  return { app, db };
}
