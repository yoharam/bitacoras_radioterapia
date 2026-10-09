import { test, expect } from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('admin@bitacoras.local');
  await page.getByLabel('Contraseña', { exact: true }).fill('Bitacoras2026!');
  await page.getByRole('button', { name: 'Entrar al sistema', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bitácora de radioterapia', exact: true })).toBeVisible();
}

async function capture(page, name) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: false });
}

test('sidebar institucional identifica el módulo y concentra la cuenta en escritorio', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const sidebar = page.getByTestId('institutional-sidebar');
  const header = page.getByTestId('workspace-header');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: /^Pacientes/ })).toHaveAttribute('aria-current', 'page');
  await expect(header.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeHidden();
  await expect(sidebar.getByRole('button', { name: 'Abrir mi cuenta', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
  await sidebar.getByRole('button', { name: 'Usuarios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Usuarios', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('button', { name: /^Pacientes/ })).not.toHaveAttribute('aria-current', 'page');
  await sidebar.getByRole('button', { name: 'Abrir mi cuenta', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mi cuenta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar ventana', exact: true }).click();
  await sidebar.getByRole('button', { name: 'Resumen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen de radioterapia', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, 'navigation-desktop');
  await sidebar.screenshot({ path: 'test-results/navigation-sidebar.png' });
  await sidebar.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`sidebar móvil accesible a ${width}px: foco, Escape y navegación`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    if (width === 320) await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page);
    const opener = page.getByTestId('mobile-menu-trigger');
    await expect(opener).toHaveAccessibleName('Abrir menú');
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await opener.click();
    const menu = page.getByRole('dialog', { name: 'Navegación de Bitácoras', exact: true });
    await expect(menu).toBeVisible();
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('button', { name: /^Pacientes/ })).toHaveAttribute('aria-current', 'page');
    await expect(menu.getByRole('button', { name: 'Cerrar menú', exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Guía rápida', exact: true })).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await menu.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, `navigation-mobile-${width}`);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await opener.click();
    await menu.getByRole('button', { name: 'Usuarios', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  });
}

test('sidebar conserva acciones en tableta con poca altura', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 560 });
  await login(page);
  const sidebar = page.getByTestId('institutional-sidebar');
  await expect(sidebar).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir menú', exact: true })).toBeHidden();
  await expect(sidebar.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeInViewport();
  await expect(sidebar.getByRole('button', { name: 'Abrir mi cuenta', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await sidebar.getByRole('button', { name: 'Guía rápida', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Guía rápida', exact: true })).toBeVisible();
});

test('sidebar cierra el menú móvil al pasar a escritorio sin dejar el contenido bloqueado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Navegación de Bitácoras', exact: true });
  await expect(menu).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(menu).toHaveCount(0);
  const sidebar = page.getByTestId('institutional-sidebar');
  await expect(sidebar).toBeVisible();
  await sidebar.getByRole('button', { name: 'Usuarios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
});
