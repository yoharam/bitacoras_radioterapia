import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrap, plan } from '../../scripts/windows/update.mjs';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'bitacoras update '));
  const remote = join(directory, 'remote.git');
  const author = join(directory, 'author');
  const installed = join(directory, 'installed ZIP');
  for (const path of [remote, author, installed]) mkdirSync(path);
  git(remote, 'init', '--bare', '--initial-branch=main');
  git(author, 'init', '--initial-branch=main');
  git(author, 'config', 'user.name', 'Installer test');
  git(author, 'config', 'user.email', 'installer-test@bitacoras.local');
  writeFileSync(join(author, '.gitignore'), '.windows/\n.env\nbackend/data/\n');
  writeFileSync(join(author, 'app.mjs'), 'export const version = 1;\n');
  git(author, 'add', '.gitignore', 'app.mjs');
  git(author, 'commit', '-m', 'base');
  git(author, 'remote', 'add', 'origin', remote);
  git(author, 'push', '-u', 'origin', 'main');
  const base = git(author, 'rev-parse', 'HEAD');
  for (const file of ['.gitignore', 'app.mjs']) cpSync(join(author, file), join(installed, file));
  writeFileSync(join(installed, '.env'), 'private configuration');
  mkdirSync(join(installed, 'backend/data'), { recursive: true });
  writeFileSync(join(installed, 'backend/data/bitacoras.sqlite'), 'private database');
  const advance = () => {
    writeFileSync(join(author, 'app.mjs'), 'export const version = 2;\n');
    git(author, 'add', 'app.mjs');
    git(author, 'commit', '-m', 'new version');
    git(author, 'push', 'origin', 'main');
    return git(author, 'rev-parse', 'HEAD');
  };
  return { directory, remote, author, installed, base, advance, close: () => rmSync(directory, { recursive: true, force: true }) };
}

test('an older ZIP becomes a main checkout without overwriting configuration or data, then advances safely', () => {
  const f = fixture();
  try {
    const target = f.advance();
    bootstrap(f.installed, f.remote);
    assert.equal(git(f.installed, 'rev-parse', 'HEAD'), f.base);
    assert.match(readFileSync(join(f.installed, 'app.mjs'), 'utf8'), /version = 1/);
    assert.equal(readFileSync(join(f.installed, '.env'), 'utf8'), 'private configuration');
    assert.equal(readFileSync(join(f.installed, 'backend/data/bitacoras.sqlite'), 'utf8'), 'private database');
    assert.deepEqual(plan(f.installed, f.remote), { current: f.base, target, changed: true });
    git(f.installed, 'merge', '--ff-only', 'refs/remotes/origin/main');
    assert.match(readFileSync(join(f.installed, 'app.mjs'), 'utf8'), /version = 2/);
    assert.equal(readFileSync(join(f.installed, '.env'), 'utf8'), 'private configuration');
    assert.equal(readFileSync(join(f.installed, 'backend/data/bitacoras.sqlite'), 'utf8'), 'private database');
    assert.equal(plan(f.installed, f.remote).changed, false);
  } finally { f.close(); }
});

test('a modified ZIP is preserved and is never assigned repository metadata', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.installed, 'app.mjs'), 'local unpublished login');
    assert.throws(() => bootstrap(f.installed, f.remote), /contiene cambios/);
    assert.equal(existsSync(join(f.installed, '.git')), false);
    assert.equal(readFileSync(join(f.installed, 'app.mjs'), 'utf8'), 'local unpublished login');
  } finally { f.close(); }
});

test('local edits, another branch and another origin block automatic updates', () => {
  const f = fixture();
  try {
    bootstrap(f.installed, f.remote);
    writeFileSync(join(f.installed, 'app.mjs'), 'pending changes');
    assert.throws(() => plan(f.installed, f.remote), /cambios locales/);
    writeFileSync(join(f.installed, 'app.mjs'), 'export const version = 1;\n');
    git(f.installed, 'switch', '-c', 'development');
    assert.throws(() => plan(f.installed, f.remote), /rama main/);
    git(f.installed, 'switch', 'main');
    assert.throws(() => plan(f.installed), /origin no corresponde/);
    assert.equal(git(f.installed, 'rev-parse', 'HEAD'), f.base);
  } finally { f.close(); }
});

test('a local-only commit is never discarded or forced back to remote main', () => {
  const f = fixture();
  try {
    bootstrap(f.installed, f.remote);
    git(f.installed, 'config', 'user.name', 'Local test');
    git(f.installed, 'config', 'user.email', 'local-test@bitacoras.local');
    writeFileSync(join(f.installed, 'local.mjs'), 'local work');
    git(f.installed, 'add', 'local.mjs');
    git(f.installed, 'commit', '-m', 'local only');
    const current = git(f.installed, 'rev-parse', 'HEAD');
    assert.throws(() => plan(f.installed, f.remote), /historia local/);
    assert.equal(git(f.installed, 'rev-parse', 'HEAD'), current);
    assert.equal(readFileSync(join(f.installed, 'local.mjs'), 'utf8'), 'local work');
  } finally { f.close(); }
});
