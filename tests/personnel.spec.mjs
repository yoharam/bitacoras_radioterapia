import { test, expect } from '@playwright/test';
const password = 'UsuarioPrueba2026!';
const account = { name: 'José González existente', username: 'jose.gonzalez', password, active: true, is_admin: false, permissions: ['radiotherapy.read'] };
const mutation = (data) => ({ data, headers: { 'X-Bitacoras-Request': '1' } });
test.skip(!process.env.E2E_PERSONNEL_PORT, 'Requiere el servidor institucional de prueba.');
for (const width of [320, 1440]) {
  test(`personal institucional, usuario único y cuenta sin correo a ${width}px`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByLabel('Usuario o correo electrónico', { exact: true }).fill('admin');
    await page.getByLabel('Contraseña', { exact: true }).fill('Bitacoras2026!');
    await page.getByRole('button', { name: 'Entrar al sistema' }).click();
    await expect(page.getByRole('heading', { name: 'Bitácora de radioterapia' })).toBeVisible();
    const existing = await page.request.post('/api/users', mutation(account));
    expect(existing.status()).toBe(201);
    const ids = [(await existing.json()).user.id];
    try {
      if (width < 768) await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
      await page.getByRole('navigation').getByRole('button', { name: 'Usuarios', exact: true }).click();
      await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
      const search = page.getByRole('combobox', { name: 'Buscar personal institucional', exact: true });
      await search.fill(width === 320 ? '004321' : 'José');
      await expect(page.getByRole('option', { name: /JOSÉ GONZÁLEZ PÉREZ/ })).toBeVisible();
      await search.press('ArrowDown'); await search.press('Enter');
      await expect(page.getByLabel('Nombre completo *', { exact: true })).toHaveValue('JOSÉ GONZÁLEZ PÉREZ');
      await expect(page.getByLabel('Nombre de usuario *', { exact: true })).toHaveValue('jose.gonzalez1');
      await expect(page.getByRole('dialog')).toContainText('004321');
      const email = page.getByLabel('Correo electrónico (opcional)', { exact: true });
      await expect(email).toHaveValue(''); expect(await email.getAttribute('required')).toBeNull();
      await page.getByLabel('Contraseña inicial *', { exact: true }).fill(password);
      await page.getByRole('group', { name: 'Bitácora de radioterapia', exact: true }).getByRole('checkbox', { name: 'Consultar', exact: true }).check();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/personal-institucional-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
      await expect(page.getByRole('button', { name: 'JOSÉ GONZÁLEZ PÉREZ', exact: true })).toBeVisible();
      const result = await (await page.request.get('/api/users?q=jose.gonzalez1')).json();
      expect(result.users).toHaveLength(1);
      ids.push(result.users[0].id);
      expect(result.users[0].email).toBeNull(); expect(result.users[0].employee_number).toBe('004321');
      const context = await browser.newContext();
      try {
        const userPage = await context.newPage(); await userPage.goto('/');
        await userPage.getByLabel('Usuario o correo electrónico', { exact: true }).fill('jose.gonzalez1');
        await userPage.getByLabel('Contraseña', { exact: true }).fill(password);
        await userPage.getByRole('button', { name: 'Entrar al sistema' }).click();
        await expect(userPage.getByRole('heading', { name: 'Bitácora de radioterapia' })).toBeVisible();
      } finally { await context.close(); }
      await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
      await search.fill('004321');
      const duplicate = page.getByRole('option', { name: /JOSÉ GONZÁLEZ PÉREZ/ });
      await expect(duplicate).toHaveAttribute('aria-disabled', 'true');
      await search.fill('error');
      await expect(page.getByRole('status').filter({ hasText: /personal.*(disponible|línea)|servicio.*(disponible|línea)/i })).toBeVisible();
      await page.getByLabel('Nombre completo *', { exact: true }).fill('María López Gómez');
      await expect(page.getByLabel('Nombre de usuario *', { exact: true })).toHaveValue('maria.lopez');
      await page.getByLabel('Contraseña inicial *', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
      await expect(page.getByRole('button', { name: 'María López Gómez', exact: true })).toBeVisible();
      const manual = await (await page.request.get('/api/users?q=maria.lopez')).json();
      ids.push(manual.users[0].id); expect(manual.users[0].email).toBeNull();
    } finally {
      for (const id of ids.reverse()) expect((await page.request.delete(`/api/users/${id}`, mutation())).status()).toBe(200);
    }
  });
}
