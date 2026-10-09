import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodSelection } from '../../frontend/lib/record-filters.mjs';
import { reportHtml } from '../../frontend/lib/record-report.mjs';

test('períodos locales: semanas de lunes a domingo y cambios de mes y año', () => {
  const sunday = new Date(2027, 0, 3, 23, 30);
  assert.deepEqual(periodSelection('week', sunday), { period: 'week', date: '', from: '2026-12-28', to: '2027-01-03' });
  assert.equal(periodSelection('last-week', sunday).from, '2026-12-21');
  assert.equal(periodSelection('yesterday', new Date(2027, 0, 1)).date, '2026-12-31');
  assert.equal(periodSelection('month', new Date(2028, 1, 12)).to, '2028-02-29');
  assert.equal(periodSelection('week', new Date(2026, 9, 5)).from, '2026-10-05');
  assert.deepEqual(periodSelection('all', sunday), { period: 'all', date: '', from: '', to: '' });
});

test('reporte imprimible escapa texto de pacientes y filtros y repite encabezados', () => {
  const html = reportHtml([{ id: 1, date: '2026-10-08', patient_name: '<script>alert(1)</script>', entitlement_type: '95', status: 'Pendiente', observations: 'A & B' }], { selection: periodSelection('all'), query: '<img src=x>', status: '' });
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x&gt;'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('display:table-header-group'));
  assert.ok(html.includes('A4 landscape'));
  assert.ok(html.includes('Tipo de derechohabiencia'));
  assert.ok(html.includes('95 · IMSS BIENESTAR Hombre'));
});
