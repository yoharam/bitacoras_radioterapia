const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const word = value => normalize(value || '').split(/\s+/).find(Boolean)?.replace(/[^a-z0-9]/g, '') || '';

export function usernameBase(name, givenNames = '', surnames = '') {
  const parts = name.trim().split(/\s+/);
  const first = word(givenNames || parts[0]);
  const last = word(surnames || (parts.length > 2 ? parts.at(-2) : parts.at(-1)));
  const base = [first, parts.length > 1 || surnames ? last : ''].filter(Boolean).join('.').slice(0, 40);
  return base.length >= 3 ? base : 'usuario';
}

export function uniqueUsername(db, base) {
  let username = base, suffix = 1;
  const exists = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE');
  while (exists.get(username)) username = `${base.slice(0, 50 - String(suffix).length)}${suffix++}`;
  return username;
}
