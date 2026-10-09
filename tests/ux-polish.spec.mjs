import { test, expect } from '@playwright/test';
import { openRowActions } from './helpers/row-actions.mjs';

async function login(page, email = 'admin@bitacoras.local', password = 'Bitacoras2026!', heading = 'Bitácora de radioterapia') {
  await page.goto('/');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar al sistema', exact: true }).click();
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}

async function navigate(page, label) {
  if (await page.getByTestId('mobile-menu-trigger').isVisible()) await page.getByTestId('mobile-menu-trigger').click();
  await page.getByRole('navigation', { name: 'Navegación principal', exact: true }).filter({ visible: true }).getByRole('button', { name: new RegExp(`^${label}(?:\\s|$)`) }).click();
}

async function capture(page, name) {
  await page.screenshot({ path: `test-results/ux-${name}.png`, fullPage: false, style: 'nextjs-portal { display: none !important; }' });
}

test('la transición de módulo no vuelve a ejecutarse al actualizar datos', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const content = page.getByTestId('workspace-content');
  await expect(content).toHaveAttribute('data-view', 'records');
  await expect(content).toHaveCSS('animation-name', 'workspace-enter');
  await navigate(page, 'Usuarios');
  await expect(content).toHaveAttribute('data-view', 'users');
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
  await capture(page, 'navigation-desktop');
  await navigate(page, 'Pacientes');
  await expect(content).toHaveAttribute('data-view', 'records');
  await expect(page.getByTestId('records-count')).not.toHaveText('—');
  const started = await content.evaluate(element => element.getAnimations().find(animation => animation.animationName === 'workspace-enter')?.startTime);
  expect(started).not.toBeNull();
  expect(started).not.toBeUndefined();
  const refresh = page.waitForResponse(response => response.url().includes('/api/records?') && new URL(response.url()).searchParams.get('q') === 'Paciente ficticio UX inexistente');
  await page.getByRole('combobox', { name: 'Buscar pacientes', exact: true }).fill('Paciente ficticio UX inexistente');
  await refresh;
  expect(await content.evaluate(element => element.getAnimations().find(animation => animation.animationName === 'workspace-enter')?.startTime)).toBe(started);
});

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

const recordList = url => url.pathname === '/api/records' && url.searchParams.has('page');
const headers = { 'X-Bitacoras-Request': '1' };

async function removeFixtures(page, name) {
  const response = await page.request.get(`/api/records?${new URLSearchParams({ q: name, limit: '100' })}`);
  expect(response.ok()).toBe(true);
  for (const record of (await response.json()).records.filter(record => record.patient_name === name)) {
    expect((await page.request.delete(`/api/records/${record.id}`, { headers })).ok()).toBe(true);
  }
}

for (const width of [320, 1440]) {
  test(`carga con placeholders y actualización sin ocultar filas a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    const name = `Paciente ficticio UX cargas ${width} ${Date.now()}`;
    const date = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
    const created = await page.request.post('/api/records', { headers, data: { patient_name: name, date, treatment_time: '10:30' } });
    expect(created.status()).toBe(201);
    let pending = gate();
    await page.route(recordList, async route => { if (pending) await pending.promise; await route.continue(); });
    try {
      await page.reload();
      await expect(page.getByTestId('records-skeleton')).toBeVisible();
      await expect(page.getByTestId('records-count')).toHaveText('—');
      await expect(page.getByRole('region', { name: 'Registros de radioterapia', exact: true })).toHaveAttribute('aria-busy', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await capture(page, `loading-${width}`);
      pending.release(); pending = null;
      const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name, exact: true }) });
      await expect(row).toBeVisible();
      const count = await page.getByTestId('records-count').textContent();
      pending = gate();
      await page.getByRole('button', { name: 'Hoy', exact: true }).filter({ visible: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Actualizando pacientes…' })).toBeVisible();
      await expect(row).toBeVisible();
      await expect(page.getByTestId('records-skeleton')).toHaveCount(0);
      await expect(page.getByTestId('records-count')).toHaveText(count);
      pending.release(); pending = null;
      await expect(page.getByRole('region', { name: 'Registros de radioterapia', exact: true })).toHaveAttribute('aria-busy', 'false');
      if (width === 320) await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
      pending = gate();
      await page.getByRole('combobox', { name: 'Buscar pacientes', exact: true }).fill('Paciente ficticio UX sin coincidencias');
      await expect(page.getByTestId('records-skeleton')).toBeVisible();
      await expect(row).toHaveCount(0);
      await expect(page.getByTestId('records-count')).toHaveText('—');
      pending.release(); pending = null;
      await expect(page.getByRole('heading', { name: 'No encontramos coincidencias', exact: true })).toBeVisible();
    } finally {
      pending?.release();
      await page.unrouteAll({ behavior: 'wait' });
      await removeFixtures(page, name);
    }
  });

  test(`guardado único, feedback y foco de modal a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page);
    const name = `Paciente ficticio UX guardado ${width} ${Date.now()}`;
    const pending = gate();
    let writes = 0;
    await page.route('**/api/records', async route => {
      if (route.request().method() === 'POST') { writes++; await pending.promise; }
      await route.continue();
    });
    try {
      const trigger = page.getByRole('button', { name: 'Registrar paciente', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Registrar paciente', exact: true });
      await expect(dialog).toHaveCSS('animation-name', 'app-modal-enter');
      const form = dialog.locator('form');
      await dialog.getByLabel('Nombre del paciente *', { exact: true }).fill(name);
      await dialog.getByLabel('Hora programada de tratamiento *', { exact: true }).fill('10:30');
      await form.evaluate(element => { element.requestSubmit(); element.requestSubmit(); });
      await expect(form).toHaveAttribute('aria-busy', 'true');
      await expect(dialog.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled();
      await expect.poll(() => writes).toBe(1);
      await dialog.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await capture(page, `saving-${width}`);
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/records' && response.request().method() === 'POST');
      pending.release();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      const saved = (await response.json()).record;
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      const row = page.locator(`[data-record-id="${saved.id}"]`);
      await expect(row).toHaveAttribute('data-highlighted', 'true');
      await expect(row).toContainText(name);
      expect(await row.evaluate(element => getComputedStyle(element).transform)).toBe('none');
      await row.scrollIntoViewIfNeeded();
      await capture(page, `saved-${width}`);
      const persisted = await page.request.get(`/api/records?${new URLSearchParams({ q: name, limit: '100' })}`);
      expect((await persisted.json()).records.filter(record => record.patient_name === name).map(record => record.id)).toEqual([saved.id]);
      expect(writes).toBe(1);
      await expect(row).not.toHaveAttribute('data-highlighted', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      pending.release();
      await page.unrouteAll({ behavior: 'wait' });
      await removeFixtures(page, name);
    }
  });
}

test('modales sin movimiento respetan Escape, foco y cambios de preferencia', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await expect(page.getByTestId('workspace-content')).toHaveCSS('animation-name', 'none');
  const trigger = page.getByRole('button', { name: 'Registrar paciente', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Registrar paciente', exact: true });
  await expect(dialog).toHaveCSS('animation-name', 'none');
  await expect(dialog.getByLabel('Nombre del paciente *', { exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(dialog).toHaveCSS('animation-name', 'app-modal-enter');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.locator('body').getAttribute('style') || '').not.toContain('pointer-events: none');
  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('Redes conserva solicitudes durante la actualización y anima el progreso sin repetir celebraciones', async ({ page, browser }) => {
  await login(page);
  const name = `Paciente ficticio UX Redes ${Date.now()}`;
  const date = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  const created = await page.request.post('/api/records', { headers, data: { patient_name: name, date, treatment_time: '10:30' } });
  const id = (await created.json()).record.id;
  expect((await page.request.post(`/api/records/${id}/arrival`, { headers, data: { arrival_time: '10:00' } })).ok()).toBe(true);
  expect((await page.request.post(`/api/records/${id}/network-assistance`, { headers })).ok()).toBe(true);
  const email = `ux-redes-${Date.now()}@bitacoras.local`, password = 'IngenieroPrueba2026!';
  const engineer = await page.request.post('/api/users', { headers, data: { name: 'Ingeniero ficticio UX', email, password, active: true, is_admin: false, permissions: ['networks.read', 'networks.update'] } });
  expect(engineer.status()).toBe(201);
  const engineerId = (await engineer.json()).user.id;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const networks = await context.newPage();
  await login(networks, email, password, 'Asistencia de Redes');
  let pending = null;
  const networkList = url => url.pathname === '/api/network-assistance';
  await networks.route(networkList, async route => { if (pending) await pending.promise; await route.continue(); });
  try {
    const request = networks.getByRole('article').filter({ hasText: name });
    await expect(request).toBeVisible();
    const progress = networks.getByRole('progressbar').first().locator('div');
    await expect(progress).toHaveCSS('transition-property', 'width, background-color');
    pending = gate();
    await networks.getByRole('button', { name: 'Actualizar solicitudes', exact: true }).click();
    await expect(networks.getByRole('status').filter({ hasText: 'Actualizando solicitudes…' })).toBeVisible();
    await expect(request).toBeVisible();
    await expect(request.getByRole('button', { name: 'Marcar como atendida', exact: true })).toBeDisabled();
    pending.release(); pending = null;
    await expect(networks.getByRole('button', { name: 'Actualizar solicitudes', exact: true })).toBeEnabled();
    await request.getByRole('button', { name: 'Marcar como atendida', exact: true }).click();
    await expect(networks.locator('[data-sileo-toast]').filter({ hasText: '¡Gran trabajo, inge!' })).toBeVisible();
    const card = networks.locator('[data-testid^="engineer-recognition-"][data-celebrating="true"]');
    await expect(card).toHaveCount(1);
    await expect(card).toHaveCSS('animation-name', 'recognition-celebrate');
    await expect(card).toHaveCount(0);
    await networks.getByRole('button', { name: 'Actualizar solicitudes', exact: true }).click();
    await expect(networks.getByRole('button', { name: 'Actualizar solicitudes', exact: true })).toBeEnabled();
    await expect(card).toHaveCount(0);
    await networks.emulateMedia({ reducedMotion: 'reduce' });
    await expect(progress).toHaveCSS('transition-duration', '0s');
    await capture(networks, 'networks-desktop');
  } finally {
    pending?.release();
    await networks.unrouteAll({ behavior: 'wait' });
    await context.close();
    await removeFixtures(page, name);
    expect((await page.request.delete(`/api/users/${engineerId}`, { headers })).ok()).toBe(true);
  }
});

test('editar con filtros devuelve el foco aunque desaparezca el botón original', async ({ page }) => {
  await login(page);
  const name = `Paciente ficticio UX edición ${Date.now()}`;
  const date = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  const created = await page.request.post('/api/records', { headers, data: { patient_name: name, date, treatment_time: '10:30' } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).record.id;
  const pending = gate();
  try {
    await page.getByRole('combobox', { name: 'Buscar pacientes', exact: true }).fill(name);
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Editar registro', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar registro', exact: true });
    await dialog.getByLabel('Observaciones', { exact: true }).fill('Edición ficticia para verificar foco.');
    await page.route(recordList, async route => { await pending.promise; await route.continue(); });
    await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('records-skeleton')).toBeVisible();
    await expect(page.getByTestId('workspace-content')).toBeFocused();
    pending.release();
    const row = page.locator(`[data-record-id="${id}"]`);
    await expect(row).toHaveAttribute('data-highlighted', 'true');
    await expect(page.getByRole('combobox', { name: 'Buscar pacientes', exact: true })).toHaveValue('');
    const persisted = await page.request.get(`/api/records?${new URLSearchParams({ q: name })}`);
    expect((await persisted.json()).records.find(record => record.id === id).observations).toBe('Edición ficticia para verificar foco.');
  } finally {
    pending.release();
    await page.unrouteAll({ behavior: 'wait' });
    expect((await page.request.delete(`/api/records/${id}`, { headers })).ok()).toBe(true);
  }
});

test('el formulario no vuelve a enviar durante la animación de cierre', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await login(page);
  const name = `Paciente ficticio UX cierre ${Date.now()}`;
  let writes = 0;
  await page.route('**/api/records', async route => {
    if (route.request().method() === 'POST') writes++;
    await route.continue();
  });
  try {
    await page.getByRole('button', { name: 'Registrar paciente', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar paciente', exact: true });
    await dialog.getByLabel('Nombre del paciente *', { exact: true }).fill(name);
    await dialog.getByLabel('Hora programada de tratamiento *', { exact: true }).fill('10:30');
    await dialog.evaluate(element => {
      window.__exitSubmitAttempt = false;
      window.__closeSubmitEvents = 0;
      const form = element.querySelector('form');
      form.addEventListener('submit', () => window.__closeSubmitEvents++);
      const observer = new MutationObserver(() => {
        if (element.getAttribute('data-state') !== 'closed') return;
        observer.disconnect();
        window.__closedModalInert = element.inert;
        window.__closedModalConnected = element.isConnected;
        window.__closedModalAnimation = getComputedStyle(element).animationName;
        window.__exitSubmitAttempt = true;
        form.requestSubmit();
      });
      observer.observe(element, { attributes: true, attributeFilter: ['data-state'] });
    });
    await dialog.getByRole('button', { name: 'Guardar registro', exact: true }).click();
    await page.waitForFunction(() => window.__exitSubmitAttempt, null, { timeout: 5000 });
    expect(await page.evaluate(() => window.__closedModalConnected)).toBe(true);
    expect(await page.evaluate(() => window.__closedModalAnimation)).toBe('app-modal-exit');
    expect(await page.evaluate(() => window.__closeSubmitEvents)).toBe(2);
    expect(await page.evaluate(() => window.__closedModalInert)).toBe(true);
    await expect(page.locator('.app-modal')).toHaveCount(0);
    const persisted = await page.request.get(`/api/records?${new URLSearchParams({ q: name })}`);
    expect((await persisted.json()).records.filter(record => record.patient_name === name)).toHaveLength(1);
    expect(writes).toBe(1);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    await removeFixtures(page, name);
  }
});

test('no permite repetir una solicitud de internet mientras la fila se actualiza', async ({ page }) => {
  await login(page);
  const name = `Paciente ficticio UX solicitud ${Date.now()}`;
  const date = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
  const created = await page.request.post('/api/records', { headers, data: { patient_name: name, date, treatment_time: '10:30' } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).record.id;
  expect((await page.request.post(`/api/records/${id}/arrival`, { headers, data: { arrival_time: '10:00' } })).ok()).toBe(true);
  const pending = gate();
  let writes = 0;
  try {
    await page.reload();
    const row = page.locator(`[data-record-id="${id}"]`);
    const trigger = row.getByRole('button', { name: /^Acciones RT-/ });
    await openRowActions(page, row);
    const request = page.getByRole('menuitem', { name: 'Solicitar internet', exact: true });
    await expect(request).toBeEnabled();
    await page.route(recordList, async route => { await pending.promise; await route.continue(); });
    await page.route(`**/api/records/${id}/network-assistance`, async route => { writes++; await route.continue(); });
    await request.click();
    await expect(page.getByRole('status').filter({ hasText: 'Actualizando pacientes…' })).toBeVisible();
    await expect(row).toBeVisible();
    await expect(trigger).toBeDisabled();
    await trigger.evaluate(element => element.click());
    await expect(page.getByRole('menu')).toHaveCount(0);
    pending.release();
    await openRowActions(page, row);
    await expect(page.getByRole('menuitem', { name: 'Solicitar internet', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    expect(writes).toBe(1);
  } finally {
    pending.release();
    await page.unrouteAll({ behavior: 'wait' });
    expect((await page.request.delete(`/api/records/${id}`, { headers })).ok()).toBe(true);
  }
});

test('validación de API conserva el formulario y permite reintentar; el cierre se anima', async ({ page }) => {
  await login(page);
  const name = `Paciente ficticio UX reintento ${Date.now()}`;
  const trigger = page.getByRole('button', { name: 'Registrar paciente', exact: true });
  try {
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Registrar paciente', exact: true });
    await dialog.getByLabel('Nombre del paciente *', { exact: true }).fill('  ');
    await dialog.getByLabel('Hora programada de tratamiento *', { exact: true }).fill('10:30');
    const rejected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/records' && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Guardar registro', exact: true }).click();
    expect((await rejected).status()).toBe(400);
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByLabel('Nombre del paciente *', { exact: true })).toHaveValue('  ');
    await expect(dialog.getByRole('button', { name: 'Guardar registro', exact: true })).toBeEnabled();
    await dialog.getByLabel('Nombre del paciente *', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Guardar registro', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await trigger.click();
    await dialog.evaluate(element => {
      window.__modalClosingAnimations = [];
      element.addEventListener('animationstart', event => window.__modalClosingAnimations.push(event.animationName));
    });
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.__modalClosingAnimations)).toContain('app-modal-exit');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(dialog.getByLabel('Nombre del paciente *', { exact: true })).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await page.locator('body').getAttribute('style') || '').not.toContain('pointer-events: none');
  } finally {
    await removeFixtures(page, name);
  }
});
