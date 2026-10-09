import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, cpSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './config.mjs';

export const repository = 'https://github.com/yoharam/bitacoras_radioterapia.git';
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 45000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();

export function bootstrap(root, source = repository) {
  if (existsSync(join(root, '.git'))) return;
  const state = join(root, '.windows');
  mkdirSync(state, { recursive: true });
  const temporary = mkdtempSync(join(state, 'bootstrap-'));
  try {
    git(root, ['clone', '--no-checkout', '--branch', 'main', source, temporary]);
    const commits = git(temporary, ['rev-list', '--first-parent', '--max-count=100', 'origin/main']).split('\n');
    const hashes = new Map();
    let matched;
    for (const commit of commits) {
      const tree = git(temporary, ['ls-tree', '-r', '--full-tree', commit]).split('\n');
      const matches = tree.every(entry => {
        const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
        if (!match) return false;
        const [, , expected, path] = match;
        const file = join(root, path);
        if (!existsSync(file)) return false;
        if (!hashes.has(path)) hashes.set(path, git(temporary, ['hash-object', '--no-filters', file]));
        return hashes.get(path) === expected;
      });
      if (matches) { matched = commit; break; }
    }
    if (!matched) throw new Error('La carpeta ZIP contiene cambios o no coincide con una version de main. Se conservan sus archivos; descarga el ZIP publicado completo o usa una instalacion clonada.');
    git(temporary, ['switch', '--detach', matched]);
    git(temporary, ['branch', '--force', 'main', matched]);
    git(temporary, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    git(temporary, ['config', 'branch.main.remote', 'origin']);
    git(temporary, ['config', 'branch.main.merge', 'refs/heads/main']);
    // Populate the index only inside the temporary clone; never overwrite the user's files.
    git(temporary, ['read-tree', matched]);
    cpSync(join(temporary, '.git'), join(root, '.git'), { recursive: true, errorOnExist: true, force: false });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

export function plan(root, allowedSource = repository) {
  if (git(root, ['branch', '--show-current']) !== 'main') throw new Error('La actualizacion automatica requiere la rama main. Cambia de rama manualmente cuando hayas conservado tus cambios.');
  const remote = git(root, ['remote', 'get-url', 'origin']);
  const normalized = value => value.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '').replace(/\/$/, '');
  if (normalized(remote) !== normalized(allowedSource)) throw new Error('origin no corresponde al repositorio de Bitacoras Institucionales.');
  if (git(root, ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Hay cambios locales pendientes. No se sobrescribiran; publica o conserva esos cambios antes de actualizar.');
  git(root, ['fetch', 'origin', 'main']);
  const current = git(root, ['rev-parse', 'HEAD']);
  const target = git(root, ['rev-parse', 'refs/remotes/origin/main']);
  if (current !== target) {
    try { git(root, ['merge-base', '--is-ancestor', current, target]); }
    catch { throw new Error('La historia local no permite avanzar a origin/main. No se forzara la actualizacion.'); }
  }
  return { current, target, changed: current !== target };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'bootstrap') bootstrap(projectRoot);
    else if (process.argv[2] === 'plan') console.log(JSON.stringify(plan(projectRoot)));
    else throw new Error('Operacion de actualizacion desconocida.');
  } catch (error) {
    // Do not echo Git credential helpers or remote command output.
    console.log(error.status !== undefined || error.code === 'ETIMEDOUT' ? 'No se pudo consultar main. Comprueba internet y Git; la version instalada se conserva.' : error.message);
    process.exitCode = 1;
  }
}
