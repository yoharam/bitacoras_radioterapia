import { test, expect } from '@playwright/test';

async function login(page, email = 'admin@bitacoras.local', password = 'Bitacoras2026!') {
  await page.goto('/');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
}

for (const width of [320, 1440]) {
  test(`asistencia de Redes y notificaciones Sileo verdes a ${width}px`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page);
    await expect(page.getByRole('heading', { name: 'Bitácora de radioterapia', exact: true })).toBeVisible();
    const patient = `Paciente ficticio Redes ${width} ${Date.now()}`;
    const response = await page.request.post('/api/records', { headers: { 'X-Bitacoras-Request': '1' }, data: { patient_name: patient, date: '2026-10-08', arrival_time: '08:00', treatment_time: '08:30' } });
    expect(response.status()).toBe(201);
    const id = (await response.json()).record.id;
    const email = `redes-${width}-${Date.now()}@bitacoras.local`, password = 'IngenieroPrueba2026!';
    const engineer = await page.request.post('/api/users', { headers: { 'X-Bitacoras-Request': '1' }, data: { name: 'Ingeniero de prueba', email, password, active: true, is_admin: false, permissions: ['networks.read', 'networks.update'] } });
    expect(engineer.status()).toBe(201);
    const engineerId = (await engineer.json()).user.id;
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    try {
      await page.getByRole('button', { name: 'Todo el historial', exact: true }).click();
      await page.getByRole('combobox', { name: 'Buscar pacientes' }).fill(patient);
      const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: patient, exact: true }) });
      const hand = row.getByRole('button', { name: /^Solicitar asistencia de Redes RT-/ });
      await expect(hand).toBeVisible();
      // Un fallo de servidor debe mostrar error y permitir reintentar.
      const endpoint = `**/api/records/${id}/network-assistance`;
      await page.route(endpoint, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Redes temporalmente no disponible.' }) }));
      await hand.click();
      await expect(page.locator('[data-sileo-toast][data-state="error"]')).toContainText('No se pudo completar la acción');
      await expect(hand).toBeEnabled();
      await expect(row).not.toContainText('Asistencia de Redes solicitada');
      await page.unroute(endpoint);
      await hand.click();
      const toast = page.locator('[data-sileo-toast][data-state="success"]').filter({ hasText: 'Tu ingeniero va en camino' });
      await expect(toast).toBeVisible();
      await expect(toast.locator('svg rect').first()).toHaveAttribute('fill', '#1e5b4f');
      await expect(toast.locator('[data-sileo-title]').last()).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(toast.locator('[data-sileo-title]').last()).toHaveCSS('text-transform', 'none');
      await expect(row.getByRole('button', { name: /^Asistencia de Redes solicitada RT-/ })).toBeDisabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/asistencia-sileo-${width}.png`, fullPage: true });
      await page.reload();
      await page.getByRole('button', { name: 'Todo el historial', exact: true }).click();
      await page.getByRole('combobox', { name: 'Buscar pacientes' }).fill(patient);
      await expect(row.getByRole('button', { name: /^Asistencia de Redes solicitada RT-/ })).toBeDisabled();
      const networks = await context.newPage();
      await login(networks, email, password);
      await expect(networks.getByRole('heading', { name: 'Asistencia de Redes', exact: true })).toBeVisible();
      await expect(networks.getByRole('navigation').getByRole('button', { name: 'Pacientes', exact: true })).toHaveCount(0);
      const request = networks.getByRole('article').filter({ hasText: patient });
      await expect(request).toBeVisible();
      expect(await networks.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await networks.screenshot({ path: `test-results/redes-${width}.png`, fullPage: true });
      await request.getByRole('button', { name: 'Marcar como atendida', exact: true }).click();
      await expect(request).toHaveCount(0);
      await networks.getByLabel('Estado de la solicitud', { exact: true }).selectOption('Atendida');
      await expect(request).toContainText('Ingeniero de prueba');
      await page.reload();
      await page.getByRole('button', { name: 'Todo el historial', exact: true }).click();
      await page.getByRole('combobox', { name: 'Buscar pacientes' }).fill(patient);
      await expect(hand).toBeEnabled();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await page.request.delete(`/api/records/${id}`, { headers: { 'X-Bitacoras-Request': '1' } });
      await page.request.delete(`/api/users/${engineerId}`, { headers: { 'X-Bitacoras-Request': '1' } });
    }
  });
}
