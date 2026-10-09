import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
const options = { encoding: 'utf8', timeout: 10000, windowsHide: true };

export function portIsFree(port, host = '0.0.0.0') {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

async function listeners(port) {
  if (process.platform === 'win32') {
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`], options);
    return stdout.trim().split(/\s+/).map(Number).filter(pid => pid > 0);
  }
  try {
    const { stdout } = await execute('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], options);
    return [...new Set(stdout.trim().split(/\s+/).map(Number).filter(pid => pid > 0))];
  } catch (error) {
    if (error.code === 1 && !error.stdout?.trim() && !error.stderr?.trim()) return [];
    if (error.code === 'ENOENT') throw new Error('Instala lsof para liberar los puertos automáticamente.');
    throw error;
  }
}

// Stop the supervisor too: killing only a watched API makes Node restart it.
async function supervisor(pid) {
  let target = pid;
  for (let depth = 0; depth < 15 && pid > 1 && pid !== process.pid; depth++) {
    let parent, command;
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object ParentProcessId,CommandLine | ConvertTo-Json -Compress`], options);
        if (!stdout.trim()) break;
        const info = JSON.parse(stdout);
        parent = info.ParentProcessId;
        command = info.CommandLine || '';
      } else {
        const { stdout } = await execute('ps', ['-p', String(pid), '-o', 'ppid=', '-o', 'args='], options);
        const match = stdout.trim().match(/^(\d+)\s+([\s\S]*)$/);
        if (!match) break;
        parent = Number(match[1]);
        command = match[2];
      }
    } catch { break; }
    if (/(?:^|\s|[\\/])scripts[\\/]run\.mjs(?:["']?\s|$)/.test(command) || /\bnode\b.*--watch\b/.test(command)) target = pid;
    pid = parent;
  }
  return target;
}

function signal(pid, name) {
  try { process.kill(pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}

export async function freePort(port, host, { strict = false } = {}) {
  if (await portIsFree(port, host)) return;
  if (strict) throw new Error(`El puerto ${port} está ocupado (STRICT_PORTS=1).`);
  const pids = await listeners(port);
  if (!pids.length) throw new Error(`No se pudo identificar el proceso del puerto ${port}. Revisa los permisos.`);
  const targets = [...new Set(await Promise.all(pids.map(supervisor)))];
  if (targets.includes(process.pid)) throw new Error(`El proceso actual ocupa el puerto ${port}.`);
  console.log(`Liberando puerto ${port}; deteniendo procesos ${targets.join(', ')}.`);
  for (const pid of targets) {
    if (process.platform === 'win32') await execute('taskkill.exe', ['/PID', String(pid), '/T', '/F'], options);
    else signal(pid, 'SIGTERM');
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await portIsFree(port, host)) return;
    await delay(100);
  }
  if (process.platform !== 'win32') {
    for (const pid of new Set([...targets, ...pids])) signal(pid, 'SIGKILL');
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await portIsFree(port, host)) return;
      await delay(100);
    }
  }
  throw new Error(`El puerto ${port} sigue ocupado; no se iniciaron los servicios.`);
}
