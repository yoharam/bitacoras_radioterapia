import { test, expect } from '@playwright/test';
import { chooseRowAction } from './helpers/row-actions.mjs';

async function login(page) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('admin@bitacoras.local');
  await page.getByLabel('Contraseña', { exact: true }).fill('Bitacoras2026!');
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
}

test('auditoría sin datos personales y bloqueo visual tras inactividad', async ({ page }) => {
  const patient = `Paciente sintético auditoría ${Date.now()}`;
  await page.clock.install();
  await login(page);
  await page.getByRole('button', { name: 'Registrar paciente', exact: true }).click();
    await page.getByLabel('Nombre del paciente *', { exact: true }).fill(patient);
    await page.getByLabel('Hora programada de tratamiento *', { exact: true }).fill('23:59');
    await page.getByRole('button', { name: 'Guardar registro', exact: true }).click();
    const record = page.getByRole('button', { name: patient, exact: true });
    await expect(record).toBeVisible();
    const row = page.locator('tbody tr').filter({ has: record });
    await chooseRowAction(page, row, 'Registrar llegada');
    await expect(row).toContainText('Llegada registrada');
    await page.getByRole('button', { name: 'Auditoría', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Auditoría', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Eventos recientes' })).toContainText('Inicio de sesión');
    await expect(page.getByRole('list', { name: 'Eventos recientes' })).toContainText('Llegada registrada');
    await expect(page.getByRole('list', { name: 'Eventos recientes' })).not.toContainText(patient);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: 'test-results/bitacoras-auditoria-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/bitacoras-auditoria-movil.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /^Pacientes/ }).click();
    const patientRow = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: patient, exact: true }) });
    await chooseRowAction(page, patientRow, 'Eliminar registro');
    await page.getByRole('button', { name: 'Sí, eliminar', exact: true }).click();
    await page.clock.fastForward(5 * 60 * 1000);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});
