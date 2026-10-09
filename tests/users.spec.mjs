import { test, expect } from '@playwright/test';
import { chooseRowAction } from './helpers/row-actions.mjs';

const password = 'UsuarioPrueba2026!';
async function login(page, email = 'admin@bitacoras.local', pass = 'Bitacoras2026!') {
  await page.goto('/');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
}
for (const width of [320, 1440]) {
  test(`usuarios y permisos modulares a ${width}px`, async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    await expect(page.getByRole('heading', { name: 'Bitácora de radioterapia' })).toBeVisible();
    if (width < 768) await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
    await page.getByRole('navigation').getByRole('button', { name: 'Usuarios', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
    const name = `Usuario de prueba ${width} ${Date.now()}`;
    const email = `prueba-${width}-${Date.now()}@bitacoras.local`;
    await page.getByRole('button', { name: 'Crear usuario', exact: true }).click();
    await page.getByLabel('Nombre completo *', { exact: true }).fill(name);
    await page.getByLabel('Correo electrónico *', { exact: true }).fill(email);
    await page.getByLabel('Contraseña inicial *', { exact: true }).fill(password);
    await page.getByRole('group', { name: 'Bitácora de radioterapia', exact: true }).getByRole('checkbox', { name: 'Consultar', exact: true }).check();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/usuarios-formulario-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    const getRow = value => page.locator('tbody tr').filter({ has: page.getByRole('button', { name: value, exact: true }) });
    await expect(getRow(name)).toBeVisible();
    await page.getByRole('combobox', { name: 'Buscar usuarios' }).fill(name);
    await expect(page.getByRole('option', { name: new RegExp(name) })).toBeVisible();
    await page.getByRole('option', { name: new RegExp(name) }).click();
    await expect(page.getByRole('combobox', { name: 'Buscar usuarios' })).toHaveValue(email);
    await chooseRowAction(page, getRow(name), 'Editar usuario');
    const renamed = `${name} editado`;
    await page.getByLabel('Nombre completo *', { exact: true }).fill(renamed);
    await page.getByRole('button', { name: 'Guardar usuario', exact: true }).click();
    await expect(getRow(renamed)).toBeVisible();
    await chooseRowAction(page, getRow(renamed), 'Ver detalle');
    await expect(page.getByRole('dialog').getByRole('group', { name: 'Bitácora de radioterapia', exact: true }).getByRole('checkbox', { name: 'Consultar', exact: true })).toBeChecked();
    await expect(page.getByRole('dialog').getByRole('group', { name: 'Usuarios', exact: true }).getByRole('checkbox', { name: 'Consultar', exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
    await page.screenshot({ path: `test-results/usuarios-${width}.png`, fullPage: true });
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    try {
      const operator = await context.newPage();
      await login(operator, email, password);
      await expect(operator.getByRole('heading', { name: 'Bitácora de radioterapia' })).toBeVisible();
      await expect(operator.getByRole('button', { name: 'Registrar paciente', exact: true })).toHaveCount(0);
      await expect(operator.getByRole('button', { name: 'Exportar CSV', exact: true })).toHaveCount(0);
      await expect(operator.getByRole('button', { name: 'Imprimir / PDF', exact: true })).toHaveCount(0);
      await expect(operator.getByRole('button', { name: /^Solicitar asistencia de Redes RT-/ })).toHaveCount(0);
      await expect(operator.getByRole('navigation').getByRole('button', { name: 'Redes', exact: true })).toHaveCount(0);
      await expect(operator.getByRole('navigation').getByRole('button', { name: 'Usuarios', exact: true })).toHaveCount(0);
      const denied = await operator.evaluate(async () => {
        const response = await fetch('/api/users', { credentials: 'same-origin' });
        return response.status;
      });
      expect(denied).toBe(403);
      await chooseRowAction(page, getRow(renamed), 'Editar usuario');
      await page.getByRole('checkbox', { name: 'Usuario activo', exact: true }).uncheck();
      await page.getByRole('button', { name: 'Guardar usuario', exact: true }).click();
      await expect(getRow(renamed)).toContainText('Inactivo');
      await operator.reload();
      await expect(operator.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
      await login(operator, email, password);
      await expect(operator.getByRole('alert').filter({ hasText: 'El correo o la contraseña son incorrectos.' })).toBeVisible();
      await chooseRowAction(page, getRow(renamed), 'Editar usuario');
      await page.getByRole('checkbox', { name: 'Usuario activo', exact: true }).check();
      await page.getByRole('group', { name: 'Bitácora de radioterapia', exact: true }).getByRole('checkbox', { name: 'Registrar', exact: true }).check();
      await page.getByRole('button', { name: 'Guardar usuario', exact: true }).click();
      await expect(getRow(renamed)).toContainText('Activo');
      await login(operator, email, password);
      await expect(operator.getByRole('button', { name: 'Registrar paciente', exact: true })).toBeVisible();
      await chooseRowAction(page, getRow(renamed), 'Eliminar usuario');
      await page.getByRole('button', { name: 'Conservar usuario', exact: true }).click();
      await expect(getRow(renamed)).toBeVisible();
      await chooseRowAction(page, getRow(renamed), 'Eliminar usuario');
      await page.getByRole('button', { name: 'Sí, eliminar usuario', exact: true }).click();
      await expect(getRow(renamed)).toHaveCount(0);
      await operator.reload();
      await expect(operator.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    } finally { await context.close(); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  });
}
