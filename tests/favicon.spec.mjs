import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('la pestaña usa el favicon institucional y sirve un ICO multirresolución válido', async ({ page }) => {
  await page.goto('/');
  const icon = page.locator('head link[rel="icon"]');
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute('href', /^\/favicon\.ico(?:\?.*)?$/);
  const response = await page.request.get(await icon.getAttribute('href'));
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/^image\/(?:x-icon|vnd\.microsoft\.icon)(?:;|$)/);
  const bytes = await response.body();
  const generated = await readFile(new URL('../frontend/app/favicon.ico', import.meta.url));
  expect(bytes.equals(generated)).toBe(true);
  expect(bytes.readUInt16LE(0)).toBe(0);
  expect(bytes.readUInt16LE(2)).toBe(1);
  const count = bytes.readUInt16LE(4);
  expect(count).toBe(7);
  const sizes = [];
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16;
    const width = bytes[entry] || 256, height = bytes[entry + 1] || 256;
    expect(height).toBe(width);
    expect(bytes.readUInt16LE(entry + 6)).toBe(32);
    const length = bytes.readUInt32LE(entry + 8), offset = bytes.readUInt32LE(entry + 12);
    expect(offset).toBeGreaterThanOrEqual(6 + count * 16);
    expect(offset + length).toBeLessThanOrEqual(bytes.length);
    expect(bytes.subarray(offset, offset + 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    expect(bytes.readUInt32BE(offset + 16)).toBe(width);
    expect(bytes.readUInt32BE(offset + 20)).toBe(height);
    expect(bytes[offset + 25]).toBe(6); // Cada imagen conserva RGBA y transparencia.
    sizes.push(width);
  }
  expect(sizes.sort((a, b) => a - b)).toEqual([16, 24, 32, 48, 64, 128, 256]);
  await page.goto(await icon.getAttribute('href'));
  await expect(page.locator('img')).toBeVisible();
  expect(await page.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: 'test-results/favicon-institucional.png', fullPage: false });
});
