import { test, expect } from '@playwright/test';
import { openRowActions } from './helpers/row-actions.mjs';

async function login(page, email = 'admin@bitacoras.local', password = 'Bitacoras2026!') {
  await page.goto('/');
  await page.getByLabel('Usuario o correo electrónico', { exact: true }).fill(email);
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
    const arrival = await page.request.post(`/api/records/${id}/arrival`, { headers: { 'X-Bitacoras-Request': '1' }, data: { arrival_time: '08:00' } });
    expect(arrival.status()).toBe(200);
    const email = `redes-${width}-${Date.now()}@bitacoras.local`, password = 'IngenieroPrueba2026!';
    const engineer = await page.request.post('/api/users', { headers: { 'X-Bitacoras-Request': '1' }, data: { name: 'Ingeniero de prueba', username: email.split('@')[0], email, password, active: true, is_admin: false, permissions: ['networks.read', 'networks.update'] } });
    expect(engineer.status()).toBe(201);
    const engineerId = (await engineer.json()).user.id;
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    try {
      if (width < 640) await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
      await page.getByRole('button', { name: 'Todo el historial', exact: true }).click();
      await page.getByRole('combobox', { name: 'Buscar pacientes' }).fill(patient);
      const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: patient, exact: true }) });
      await openRowActions(page, row);
      const hand = page.getByRole('menuitem', { name: 'Solicitar internet', exact: true });
      await expect(hand).toBeVisible();
      await expect(hand.locator('svg.lucide-wifi')).toBeVisible();
      await expect(hand.locator('svg.lucide-hospital')).toHaveCount(0);
      // Un fallo de servidor debe mostrar error y permitir reintentar.
      const endpoint = `**/api/records/${id}/network-assistance`;
      await page.route(endpoint, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Redes temporalmente no disponible.' }) }));
      await hand.click();
      await expect(page.locator('[data-sileo-toast][data-state="error"]')).toContainText('No se pudo completar la acción');
      await openRowActions(page, row);
      await expect(hand).toBeEnabled();
      await expect(row).not.toContainText('Asistencia de Redes solicitada');
      await page.unroute(endpoint);
      await hand.click();
      const toast = page.locator('[data-sileo-toast][data-state="success"]').filter({ hasText: 'Tu ingeniero va en camino' });
      await expect(toast).toBeVisible();
      await expect(toast.locator('svg rect').first()).toHaveAttribute('fill', '#1e5b4f');
      await expect(toast.locator('[data-sileo-title]').last()).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(toast.locator('[data-sileo-title]').last()).toHaveCSS('text-transform', 'none');
      await openRowActions(page, row);
      await expect(page.getByRole('menuitem', { name: 'Solicitar internet', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/asistencia-sileo-${width}.png`, fullPage: true });
      await page.reload();
      if (width < 640) await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
      await page.getByRole('button', { name: 'Todo el historial', exact: true }).click();
      await page.getByRole('combobox', { name: 'Buscar pacientes' }).fill(patient);
      await openRowActions(page, row);
      await expect(page.getByRole('menuitem', { name: 'Solicitar internet', exact: true })).toBeDisabled();
      await page.keyboard.press('Escape');
      const networks = await context.newPage();
      await login(networks, email, password);
      await expect(networks.getByRole('heading', { name: 'Asistencia de Redes', exact: true })).toBeVisible();
      await expect(networks.getByRole('navigation').getByRole('button', { name: 'Pacientes', exact: true })).toHaveCount(0);
      const request = networks.getByRole('article').filter({ hasText: patient });
      await expect(request).toBeVisible();
      await request.getByRole('combobox', { name: /^Asignar solicitud RT-/ }).selectOption(String(engineerId));
      await expect(request).toContainText('Ingeniero de prueba');
      expect(await networks.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await networks.screenshot({ path: `test-results/redes-${width}.png`, fullPage: true });
      await request.getByRole('button', { name: 'Marcar como atendida', exact: true }).click();
      await expect(request).toHaveCount(0);
      await networks.getByLabel('Estado de la solicitud', { exact: true }).selectOption('Atendida');
      await expect(request).toContainText('Ingeniero de prueba');
      await page.reload();
      if (width < 640) await page.getByRole('button', { name: 'Más filtros', exact: true }).click();
      await page.getByRole('button', { name: 'Todo el historial', exact: true }).click();
      await page.getByRole('combobox', { name: 'Buscar pacientes' }).fill(patient);
      await openRowActions(page, row);
      await expect(hand).toBeEnabled();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await page.request.delete(`/api/records/${id}`, { headers: { 'X-Bitacoras-Request': '1' } });
      await page.request.delete(`/api/users/${engineerId}`, { headers: { 'X-Bitacoras-Request': '1' } });
    }
  });
}

for (const width of [320, 1440]) {
  test(`racha mensual personal de Redes y reconocimiento dorado a ${width}px`, async ({ page, browser }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    await expect(page.getByRole('heading', { name: 'Bitácora de radioterapia', exact: true })).toBeVisible();
    const headers = { 'X-Bitacoras-Request': '1' };
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const date = `${month}-${String(today.getDate()).padStart(2, '0')}`;
    const patient = `Paciente ficticio de reconocimiento ${width} ${Date.now()}`;
    const createdRecord = await page.request.post('/api/records', { headers, data: { patient_name: patient, date, arrival_time: '08:00', treatment_time: '08:30' } });
    expect(createdRecord.status()).toBe(201);
    const recordId = (await createdRecord.json()).record.id;
    const arrival = await page.request.post(`/api/records/${recordId}/arrival`, { headers, data: { arrival_time: '08:00' } });
    expect(arrival.status()).toBe(200);
    const engineers = [], contexts = [];
    try {
      for (const [index, name] of ['Ingeniera de prueba A', 'Ingeniero de prueba B'].entries()) {
        const email = `racha-${width}-${index}-${Date.now()}@bitacoras.local`, password = 'ReconocimientoPrueba2026!';
        const created = await page.request.post('/api/users', { headers, data: { name, username: email.split('@')[0].toLowerCase(), email, password, active: true, is_admin: false, permissions: ['networks.read', 'networks.update'] } });
        expect(created.status()).toBe(201);
        engineers.push({ id: (await created.json()).user.id, name, email, password });
      }
      async function createRequest() {
        const response = await page.request.post(`/api/records/${recordId}/network-assistance`, { headers });
        expect(response.status()).toBe(201);
        return (await response.json()).request.id;
      }
      async function completeOnScreen(networks, id) {
        const article = networks.locator(`article[data-assistance-id="${id}"]`);
        await expect(article).toBeVisible();
        const [response] = await Promise.all([networks.waitForResponse(response => response.url().endsWith(`/api/network-assistance/${id}`) && response.request().method() === 'PATCH'), article.getByRole('button', { name: 'Marcar como atendida', exact: true }).click()]);
        expect(response.status()).toBe(200);
        return response.json();
      }
      async function celebration(networks, engineer, count) {
        const content = networks.locator(`[data-testid="network-recognition-toast"][data-count="${count}"]`);
        const toast = networks.locator('[data-sileo-toast][data-state="success"]').filter({ has: content });
        await expect(content).toBeVisible();
        await expect(content).toHaveAttribute('data-engineer-id', String(engineer.id));
        await expect(toast).toContainText('¡Gran trabajo, inge!');
        await expect(content).toContainText(engineer.name);
        await expect(content).toContainText(`x${count}`);
        await expect(toast.locator('[data-sileo-title]').last()).toHaveCSS('color', 'rgb(255, 255, 255)');
        await toast.hover();
        return toast;
      }
      const firstId = await createRequest();
      const firstContext = await browser.newContext({ viewport: { width, height: 1000 } }); contexts.push(firstContext);
      const firstPage = await firstContext.newPage(); firstPage.on('pageerror', error => errors.push(error.message));
      await login(firstPage, engineers[0].email, engineers[0].password);
      await expect(firstPage.getByRole('heading', { name: 'Rachas de Redes', exact: true })).toBeVisible();
      const firstCard = firstPage.getByTestId(`engineer-recognition-${engineers[0].id}`);
      const secondCard = firstPage.getByTestId(`engineer-recognition-${engineers[1].id}`);
      await expect(firstCard).toHaveAttribute('data-count', '0');
      expect((await completeOnScreen(firstPage, firstId)).recognition.completed).toBe(1);
      const firstToast = await celebration(firstPage, engineers[0], 1);
      const initialFill = await firstToast.locator('svg rect').first().getAttribute('fill');
      expect(initialFill).not.toBe('#1e5b4f');
      expect(initialFill).not.toBe('#956d20');
      await expect(firstCard).toHaveAttribute('data-count', '1');
      await expect(secondCard).toHaveAttribute('data-count', '0');
      await firstPage.screenshot({ path: `test-results/redes-racha-inicial-${width}.png`, fullPage: false, style: 'nextjs-portal { display: none !important; }' });
      const secondId = await createRequest();
      const secondContext = await browser.newContext({ viewport: { width, height: 1000 } }); contexts.push(secondContext);
      const secondPage = await secondContext.newPage(); secondPage.on('pageerror', error => errors.push(error.message));
      await login(secondPage, engineers[1].email, engineers[1].password);
      expect((await completeOnScreen(secondPage, secondId)).recognition.completed).toBe(1);
      await celebration(secondPage, engineers[1], 1);
      await expect(secondPage.getByTestId(`engineer-recognition-${engineers[0].id}`)).toHaveAttribute('data-count', '1');
      await expect(secondPage.getByTestId(`engineer-recognition-${engineers[1].id}`)).toHaveAttribute('data-count', '1');
      for (let count = 2; count <= 9; count++) {
        const id = await createRequest();
        const response = await firstPage.request.patch(`/api/network-assistance/${id}`, { headers, data: { status: 'Atendida' } });
        expect(response.status()).toBe(200);
        expect((await response.json()).recognition.completed).toBe(count);
      }
      const tenthId = await createRequest();
      await firstPage.getByRole('button', { name: 'Actualizar solicitudes', exact: true }).click();
      const tenth = await completeOnScreen(firstPage, tenthId);
      expect(tenth.recognition.completed).toBe(10);
      expect(tenth.recognition.gold).toBe(false);
      const tenthToast = await celebration(firstPage, engineers[0], 10);
      const tenthFill = await tenthToast.locator('svg rect').first().getAttribute('fill');
      expect(tenthFill).not.toBe(initialFill);
      expect(tenthFill).not.toBe('#956d20');
      await firstPage.screenshot({ path: `test-results/redes-racha-x10-${width}.png`, fullPage: false, style: 'nextjs-portal { display: none !important; }' });
      const eleventhId = await createRequest();
      await firstPage.getByRole('button', { name: 'Actualizar solicitudes', exact: true }).click();
      const eleventh = await completeOnScreen(firstPage, eleventhId);
      expect(eleventh.recognition.completed).toBe(11);
      expect(eleventh.recognition.gold).toBe(true);
      const goldToast = await celebration(firstPage, engineers[0], 11);
      await expect(goldToast.locator('svg rect').first()).toHaveAttribute('fill', '#956d20');
      await expect(firstCard).toHaveAttribute('data-count', '11');
      await expect(firstCard).toHaveAttribute('data-level', 'gold');
      await expect(secondCard).toHaveAttribute('data-count', '1');
      await expect(firstCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '11');
      await firstPage.evaluate(() => window.scrollTo(0, 0));
      await goldToast.hover();
      expect(await firstPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await firstPage.screenshot({ path: `test-results/redes-racha-dorada-${width}.png`, fullPage: false, style: 'nextjs-portal { display: none !important; }' });
      const repeated = await firstPage.request.patch(`/api/network-assistance/${eleventhId}`, { headers, data: { status: 'Atendida' } });
      const duplicate = await repeated.json();
      expect(duplicate.newly_completed).toBe(false);
      expect(duplicate.recognition.completed).toBe(11);
      await firstPage.reload();
      await expect(firstCard).toHaveAttribute('data-count', '11');
      const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
      await firstPage.getByLabel('Mes de reconocimiento', { exact: true }).fill(previousMonth);
      await expect(firstCard).toHaveAttribute('data-count', '0');
      await expect(secondCard).toHaveAttribute('data-count', '0');
      await firstPage.getByLabel('Mes de reconocimiento', { exact: true }).fill(month);
      await expect(firstCard).toHaveAttribute('data-count', '11');
      await expect(secondCard).toHaveAttribute('data-count', '1');
      await firstCard.getByRole('button', { name: `Ver historial de ${engineers[0].name}`, exact: true }).click();
      const history = firstPage.getByRole('region', { name: 'Historial de reconocimiento', exact: true });
      await expect(history.getByRole('listitem')).toHaveCount(8);
      await expect(history).not.toContainText(engineers[1].name);
      await firstCard.getByRole('button', { name: `Ver historial de ${engineers[0].name}`, exact: true }).click();
      await expect(history.getByRole('listitem')).toHaveCount(8);
      await history.getByRole('button', { name: 'Página siguiente de reconocimientos' }).click();
      await expect(history.getByRole('listitem')).toHaveCount(3);
      await secondCard.getByRole('button', { name: `Ver historial de ${engineers[1].name}`, exact: true }).click();
      await expect(history.getByRole('listitem')).toHaveCount(1);
      await expect(history).toContainText(engineers[1].name);
      expect(errors).toEqual([]);
    } finally {
      for (const context of contexts) await context.close();
      await page.request.delete(`/api/records/${recordId}`, { headers });
      for (const engineer of engineers) await page.request.delete(`/api/users/${engineer.id}`, { headers });
    }
  });
}
