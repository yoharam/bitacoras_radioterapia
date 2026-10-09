import { test, expect } from '@playwright/test';

const openLogin = async page => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
};

const capture = async (page, name) => {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
};

test('login muestra seda tinto animada sin tapar el contenido ni el formulario', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openLogin(page);
  const panel = page.getByTestId('login-brand-panel');
  const silk = panel.getByTestId('login-silk');

  await expect(panel).toBeVisible();
  await expect(silk).toBeVisible();
  await expect(silk).toHaveAttribute('aria-hidden', 'true');
  await expect(silk).toHaveAttribute('data-motion', 'full');
  await expect(silk).toHaveAttribute('data-color', '#9b2247');
  const canvas = silk.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveCSS('pointer-events', 'none');
  await expect(page.getByRole('heading', { name: 'Cada paciente, a su tiempo.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await page.getByLabel('Usuario o correo electrónico').fill('personal@institucion.gob.mx');
  await page.getByLabel('Usuario o correo electrónico').press('Tab');
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Entrar al sistema' })).toBeEnabled();
  const first = await canvas.screenshot();
  await page.waitForTimeout(1200);
  expect(first.equals(await canvas.screenshot())).toBe(false);
  await page.getByLabel('Usuario o correo electrónico').fill('');
  expect(errors).toEqual([]);
  await capture(page, 'login-silk-desktop');
});

test('login conserva fondo estático cuando se prefiere movimiento reducido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLogin(page);
  const silk = page.getByTestId('login-brand-panel').getByTestId('login-silk');

  await expect(silk).toBeVisible();
  await expect(silk).toHaveAttribute('data-motion', 'reduced');
  await expect(silk.locator('canvas')).toHaveCount(0);
  expect(await silk.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe('none');
  await capture(page, 'login-silk-reduced');
});

test('login adapta la seda al cambiar la preferencia de movimiento', async ({ page }) => {
  await openLogin(page);
  const silk = page.getByTestId('login-silk');
  await expect(silk).toHaveAttribute('data-motion', 'full');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(silk).toHaveAttribute('data-motion', 'reduced');
  await expect(silk.locator('canvas')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(silk).toHaveAttribute('data-motion', 'full');
  await expect(silk.locator('canvas')).toHaveCount(1);
});

test('login móvil no anima un panel oculto y conserva el formulario sin desbordamiento', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const panel = page.getByTestId('login-brand-panel');
  const silk = page.getByTestId('login-silk');
  await expect(panel).toBeHidden();
  await expect(silk).toHaveAttribute('data-motion', 'idle');
  await expect(silk.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByLabel('Usuario o correo electrónico')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, 'login-silk-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(silk).toHaveAttribute('data-motion', 'full');
  await expect(silk.locator('canvas')).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(silk).toHaveAttribute('data-motion', 'idle');
  await expect(silk.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('login sin WebGL conserva el fondo estático y el acceso al formulario', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // An anonymous login legitimately receives 401 from the session check.
    const expectedSessionCheck = message.location().url.includes('/api/auth/me') && message.text().includes('401 (Unauthorized)');
    if (message.type() === 'error' && !expectedSessionCheck) errors.push(message.text());
  });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
  });
  await openLogin(page);
  const silk = page.getByTestId('login-silk');
  await expect(silk).toHaveAttribute('data-motion', 'fallback');
  await expect(silk.locator('canvas')).toHaveCount(0);
  expect(await silk.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe('none');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar al sistema' })).toBeEnabled();
  expect(errors).toEqual([]);
});
