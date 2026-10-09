import { test, expect } from '@playwright/test';
import { chooseRowAction } from './helpers/row-actions.mjs';

async function login(page) {
  await page.goto('/');
  await page.getByLabel('Usuario o correo electrónico', { exact: true }).fill('admin@bitacoras.local');
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
    const list = page.getByRole('list', { name: 'Eventos recientes' });
    await expect(list).toContainText('@admin');
    await expect(list).toContainText('IP: 127.0.0.1');
    await page.getByLabel('Buscar persona, usuario, correo o IP').fill('127.0.0.1');
    await page.getByLabel('Tipo de actividad').selectOption('record.arrival_recorded');
    await expect(list).not.toContainText('Inicio de sesión');
    await list.getByRole('button', { name: /Ver detalle: Llegada registrada/ }).first().click();
    const detail = page.getByRole('dialog');
    await expect(detail).toContainText('IP de origen');
    await expect(detail).toContainText('127.0.0.1');
    await expect(detail).toContainText('POST /api/records/');
    await expect(detail).not.toContainText(patient);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Limpiar', exact: true }).click();

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: 'test-results/bitacoras-auditoria-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/bitacoras-auditoria-movil.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: /^Pacientes/ }).click();
    const patientRow = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: patient, exact: true }) });
    await chooseRowAction(page, patientRow, 'Eliminar registro');
    await page.getByRole('button', { name: 'Sí, eliminar', exact: true }).click();
    await page.clock.fastForward(5 * 60 * 1000);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
});
