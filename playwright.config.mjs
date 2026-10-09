import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const webPort = process.env.E2E_WEB_PORT || '3110';
const apiPort = process.env.E2E_API_PORT || '4110';
const baseURL = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 60000,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [...(process.env.E2E_PERSONNEL_PORT ? [{
    command: 'node tests/helpers/personnel-server.mjs',
    url: `http://127.0.0.1:${process.env.E2E_PERSONNEL_PORT}/health`,
    reuseExistingServer: false, timeout: 15000
  }] : []), {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
    env: { ...(process.env.E2E_PERSONNEL_PORT ? { PERSONAL_API_BASE_URL: `http://127.0.0.1:${process.env.E2E_PERSONNEL_PORT}`, PERSONAL_API_KEY: 'llave-de-prueba' } : {}), STRICT_PORTS: '1', WEB_PORT: webPort, API_PORT: apiPort, APP_ORIGIN: baseURL, NEXT_DIST_DIR: `.next-e2e-${webPort}`, COOKIE_SECURE: 'false', DB_PATH: fileURLToPath(new URL(`./.playwright-data/test-${webPort}.sqlite`, import.meta.url)), ADMIN_EMAIL: 'admin@bitacoras.local', ADMIN_PASSWORD: 'Bitacoras2026!' }
  }]
});
