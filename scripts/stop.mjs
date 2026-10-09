import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort } from './ports.mjs';

export async function stopConfiguredPorts(env = process.env) {
  // Validate both ports before stopping anything. No origin or login is needed.
  const ports = [env.WEB_PORT || '3100', env.API_PORT || '4100'].map(Number);
  if (ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535)) throw new Error('Configura los puertos entre 1024 y 65535.');
  for (const port of new Set(ports)) await freePort(port, '0.0.0.0');
  console.log(`Puertos ${[...new Set(ports)].join(' y ')} libres. La aplicación quedó detenida.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const envPath = fileURLToPath(new URL('../.env', import.meta.url));
    if (existsSync(envPath)) loadEnvFile(envPath);
    await stopConfiguredPorts();
  } catch (error) {
    console.error(`No se pudieron liberar los puertos: ${error.message}`);
    process.exitCode = 1;
  }
}
