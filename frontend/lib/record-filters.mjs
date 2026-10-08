export const PERIODS = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'week', label: 'Esta semana' },
  { value: 'last-week', label: 'Semana pasada' },
  { value: 'month', label: 'Este mes' },
  { value: 'all', label: 'Todo el historial' }
];

const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function periodSelection(period, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const end = new Date(start);
  if (period === 'all') return { period, date: '', from: '', to: '' };
  if (period === 'yesterday') start.setDate(start.getDate() - 1);
  if (period === 'today' || period === 'yesterday') return { period, date: localDate(start), from: '', to: '' };
  if (period === 'week' || period === 'last-week') {
    start.setDate(start.getDate() - (start.getDay() + 6) % 7 - (period === 'last-week' ? 7 : 0));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 6);
  }
  if (period === 'month') {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  }
  return { period, date: '', from: localDate(start), to: localDate(end) };
}

export function dateParams(selection) {
  return selection.date ? { date: selection.date } : { from: selection.from, to: selection.to };
}

export function periodDescription(selection) {
  const display = value => new Date(`${value}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  if (selection.date) return display(selection.date);
  if (selection.from && selection.to) return `${display(selection.from)} al ${display(selection.to)}`;
  return 'Todos los días del historial';
}
