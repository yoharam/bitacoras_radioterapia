import { test, expect } from '@playwright/test';

const headers = { 'X-Bitacoras-Request': '1' };
async function login(page, email = 'admin@bitacoras.local', password = 'Bitacoras2026!') {
  await page.goto('/');
  await page.getByLabel('Usuario o correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar al sistema', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bitácora de radioterapia', exact: true })).toBeVisible();
}

for (const width of [320, 1440]) {
  test(`menú de pacientes accesible y acciones reales a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page);
    const name = `Paciente ficticio menú ${width} ${Date.now()}`;
    const date = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
    const created = await page.request.post('/api/records', { headers, data: { patient_name: name, date, treatment_time: '10:30' } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).record.id;
    try {
      await page.reload();
      const row = page.locator(`[data-record-id="${id}"]`);
      const trigger = row.getByRole('button', { name: /^Acciones RT-/ });
      await expect(trigger).toBeVisible();
      await trigger.focus();
      await page.keyboard.press('Enter');
      const menu = page.getByRole('menu', { name: /^Acciones RT-/ });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Ver detalle', exact: true })).toBeFocused();
      await page.keyboard.press('End');
      await expect(menu.getByRole('menuitem', { name: 'Eliminar registro', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(menu.getByRole('menuitem', { name: 'Ver detalle', exact: true })).toBeFocused();
      await expect(menu.getByRole('menuitem', { name: 'Solicitar internet', exact: true })).toBeDisabled();
      await expect(menu.getByRole('menuitem', { name: 'Eliminar registro', exact: true })).toBeVisible();
      await page.screenshot({ path: `test-results/actions-patients-${width}.png`, style: 'nextjs-portal { display: none !important; }' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await menu.getByRole('menuitem', { name: 'Ver detalle', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Detalle del registro', exact: true })).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
      await expect(trigger).toBeFocused();
      await trigger.click();
      let arrivals = 0;
      await page.route(`**/api/records/${id}/arrival`, async route => { arrivals++; await route.continue(); });
      await menu.getByRole('menuitem', { name: 'Registrar llegada', exact: true }).click();
      await expect(row).toContainText('Llegada registrada');
      expect(arrivals).toBe(1);
      await trigger.click();
      await expect(menu.getByRole('menuitem', { name: 'Registrar llegada', exact: true })).toBeDisabled();
      await expect(menu.getByRole('menuitem', { name: 'Solicitar internet', exact: true })).toBeEnabled();
      await menu.getByRole('menuitem', { name: 'Solicitar internet', exact: true }).click();
      await expect(row).toContainText('Asistencia de Redes solicitada');
      await trigger.click();
      await expect(menu.getByRole('menuitem', { name: 'Solicitar internet', exact: true })).toBeDisabled();
      await menu.getByRole('menuitem', { name: 'Editar registro', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Editar registro', exact: true }).getByLabel('Nombre del paciente *', { exact: true })).toBeFocused();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await menu.getByRole('menuitem', { name: 'Eliminar registro', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Eliminar registro', exact: true })).toContainText(name);
      await page.getByRole('button', { name: 'Conservar registro', exact: true }).click();
      await expect(trigger).toBeFocused();
      expect(errors).toEqual([]);
    } finally {
      await page.unrouteAll({ behavior: 'wait' });
      expect((await page.request.delete(`/api/records/${id}`, { headers })).ok()).toBe(true);
    }
  });
}

for (const width of [320, 1440]) {
  test(`menú de usuarios conserva permisos y foco a ${width}px`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    const name = `Usuario ficticio menú ${width} ${Date.now()}`;
    const email = `menu-${width}-${Date.now()}@bitacoras.local`, password = 'UsuarioPrueba2026!';
    const created = await page.request.post('/api/users', { headers, data: { name, username: email.split('@')[0].toLowerCase(), email, password, active: true, is_admin: false, permissions: ['users.read', 'radiotherapy.read'] } });
    expect(created.status()).toBe(201);
    const id = (await created.json()).user.id;
    const date = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
    const patient = await page.request.post('/api/records', { headers, data: { patient_name: `Paciente ficticio permisos ${width}`, date, treatment_time: '10:30' } });
    expect(patient.status()).toBe(201);
    const recordId = (await patient.json()).record.id;
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    async function users(target) {
      if (await target.getByTestId('mobile-menu-trigger').isVisible()) await target.getByTestId('mobile-menu-trigger').click();
      await target.getByRole('navigation', { name: 'Navegación principal', exact: true }).filter({ visible: true }).getByRole('button', { name: 'Usuarios', exact: true }).click();
      await expect(target.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
    }
    try {
      await users(page);
      const row = page.locator(`[data-user-id="${id}"]`), trigger = row.getByRole('button', { name: `Acciones de ${name}`, exact: true });
      await trigger.click();
      const menu = page.getByRole('menu', { name: `Acciones de ${name}`, exact: true });
      await expect(menu.getByRole('menuitem', { name: 'Editar usuario', exact: true })).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Eliminar usuario', exact: true })).toBeVisible();
      await page.screenshot({ path: `test-results/actions-users-${width}.png`, style: 'nextjs-portal { display: none !important; }' });
      await menu.getByRole('menuitem', { name: 'Editar usuario', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Editar usuario', exact: true });
      await expect(dialog.getByLabel('Nombre completo *', { exact: true })).toBeFocused();
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await menu.getByRole('menuitem', { name: 'Eliminar usuario', exact: true }).click();
      await page.getByRole('button', { name: 'Conservar usuario', exact: true }).click();
      await expect(trigger).toBeFocused();
      const self = page.locator('tbody tr').filter({ hasText: 'Tu cuenta' });
      await self.getByRole('button', { name: /^Acciones de / }).click();
      await expect(page.getByRole('menu').getByRole('menuitem', { name: 'Eliminar usuario', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
      const reader = await context.newPage();
      await login(reader, email, password);
      await reader.locator(`[data-record-id="${recordId}"]`).getByRole('button', { name: /^Acciones RT-/ }).click();
      const patientMenu = reader.getByRole('menu');
      await expect(patientMenu.getByRole('menuitem', { name: 'Ver detalle', exact: true })).toBeVisible();
      for (const label of ['Editar registro', 'Registrar llegada', 'Solicitar internet', 'Eliminar registro']) await expect(patientMenu.getByRole('menuitem', { name: label, exact: true })).toHaveCount(0);
      await reader.keyboard.press('Escape');
      await users(reader);
      await reader.locator(`[data-user-id="${id}"]`).getByRole('button', { name: `Acciones de ${name}`, exact: true }).click();
      await expect(reader.getByRole('menu').getByRole('menuitem', { name: 'Ver detalle', exact: true })).toBeVisible();
      await expect(reader.getByRole('menu').getByRole('menuitem', { name: 'Editar usuario', exact: true })).toHaveCount(0);
      await expect(reader.getByRole('menu').getByRole('menuitem', { name: 'Eliminar usuario', exact: true })).toHaveCount(0);
      await reader.keyboard.press('Escape');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally {
      await context.close();
      expect((await page.request.delete(`/api/records/${recordId}`, { headers })).ok()).toBe(true);
      expect((await page.request.delete(`/api/users/${id}`, { headers })).ok()).toBe(true);
    }
  });
}

test('el menú respeta cambios dinámicos de movimiento reducido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Usuarios', exact: true }).click();
  const trigger = page.locator('tbody tr').filter({ hasText: 'Tu cuenta' }).getByRole('button', { name: /^Acciones de / });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(menu).toHaveCSS('animation-name', 'enter');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});
