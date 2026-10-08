'use client';

import { useState } from 'react';
import { Calendar, CalendarDays, CalendarRange, Check, History, RotateCcw, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PredictiveSearch from '@/components/predictive-search';
import { PERIODS, periodSelection, periodDescription, dateParams } from '@/lib/record-filters.mjs';

const selectClass = 'h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 md:text-sm';
const periodIcons = { today: Sun, yesterday: History, week: CalendarDays, 'last-week': CalendarRange, month: Calendar, all: History };

export default function RecordFilters({ selection, onPeriodChange, query, onQueryChange, status, onStatusChange, states, overview, onReset, loading, total }) {
  const [custom, setCustom] = useState(null);
  const [draft, setDraft] = useState(() => ({ from: selection.from || selection.date || periodSelection('today').date, to: selection.to || selection.date || periodSelection('today').date }));
  const mode = custom || (['day', 'range'].includes(selection.period) ? selection.period : '');
  const invalidRange = Boolean(draft.from && draft.to && draft.from > draft.to);
  const hasExtraFilters = Boolean(query.trim() || status);
  function choose(period) {
    setCustom(null);
    onPeriodChange(periodSelection(period));
  }
  function customize(value) {
    setCustom(value || null);
    setDraft({ from: selection.from || selection.date || periodSelection('today').date, to: selection.to || selection.date || periodSelection('today').date });
  }
  function applyRange(event) {
    event.preventDefault();
    if (!draft.from || !draft.to || invalidRange) return;
    onPeriodChange({ period: 'range', date: '', ...draft });
    setCustom(null);
  }
  function reset() { setCustom(null); onReset(); }
  return <section aria-label="Filtros de consulta" className="mb-6 rounded-xl border border-[#e8ddcc] bg-card/90 shadow-xs">
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#faf0d8] text-[#a57f2c]"><CalendarDays className="size-5" /></span><div><h2 className="text-sm font-bold text-[#611232]">¿Qué período quieres consultar?</h2><p className="mt-1 text-xs text-muted-foreground">Filtra por la fecha de atención del paciente.</p></div></div>
        {(selection.period !== 'today' || hasExtraFilters || custom) && <Button variant="ghost" className="h-10 text-xs text-muted-foreground" onClick={reset}><RotateCcw />Restablecer filtros</Button>}
      </div>
      <div role="group" aria-label="Períodos rápidos" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{PERIODS.map(period => {
        const Icon = selection.period === period.value && !custom ? Check : periodIcons[period.value];
        return <Button key={period.value} variant={selection.period === period.value && !custom ? 'default' : 'outline'} aria-pressed={selection.period === period.value && !custom} className="h-11 w-full gap-1.5 rounded-lg px-2 text-[11px] sm:w-auto sm:gap-2 sm:px-4 sm:text-xs" onClick={() => choose(period.value)}><Icon className="size-3.5 sm:size-4" aria-hidden="true" strokeWidth={1.75} />{period.label}</Button>;
      })}</div>
      <div className="grid items-start gap-3 lg:grid-cols-[200px_1fr]">
        <div className="space-y-2"><Label htmlFor="custom-period" className="text-xs">O elige tus fechas</Label><select id="custom-period" className={selectClass} value={mode} onChange={event => customize(event.target.value)}><option value="">Seleccionar fechas…</option><option value="day">Día específico</option><option value="range">Rango de fechas</option></select></div>
        {mode === 'day' && <div className="max-w-xs space-y-2"><Label htmlFor="consult-date" className="text-xs">Fecha de consulta</Label><Input id="consult-date" type="date" className="h-11 w-full bg-card" min="1900-01-01" max="2100-12-31" value={selection.date || ''} onChange={event => { if (event.target.value && event.target.validity.valid) { onPeriodChange({ period: 'day', date: event.target.value, from: '', to: '' }); setCustom(null); } }} /></div>}
        {mode === 'range' && <form onSubmit={applyRange} className="space-y-2"><div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><div className="min-w-0 space-y-2"><Label htmlFor="filter-from" className="text-xs">Desde</Label><Input id="filter-from" type="date" required min="1900-01-01" max="2100-12-31" className="h-11 w-full bg-card" value={draft.from} onChange={event => setDraft(previous => ({ ...previous, from: event.target.value }))} aria-describedby="range-hint" aria-invalid={invalidRange} /></div><div className="min-w-0 space-y-2"><Label htmlFor="filter-to" className="text-xs">Hasta</Label><Input id="filter-to" type="date" required min="1900-01-01" max="2100-12-31" className="h-11 w-full bg-card" value={draft.to} onChange={event => setDraft(previous => ({ ...previous, to: event.target.value }))} aria-describedby="range-hint" aria-invalid={invalidRange} /></div><Button type="submit" className="h-11 rounded-lg" disabled={!draft.from || !draft.to || invalidRange}>Aplicar rango</Button></div><p id="range-hint" className={`text-xs ${invalidRange ? 'text-primary' : 'text-muted-foreground'}`} role={invalidRange ? 'alert' : undefined}>{invalidRange ? 'La fecha «Hasta» debe ser igual o posterior a «Desde».' : 'Incluye ambos días. Pulsa «Aplicar rango» para consultar.'}</p></form>}
      </div>
      {!overview && <div className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_210px]"><div className="min-w-0 space-y-2"><Label htmlFor="patient-search" className="text-xs">Nombre del paciente</Label><PredictiveSearch id="patient-search" label="Buscar pacientes" placeholder="Escribe un nombre o apellido…" value={query} onChange={onQueryChange} endpoint={`/records/suggestions?${new URLSearchParams({ ...dateParams(selection), status })}`} /></div><div className="space-y-2"><Label htmlFor="filter-status" className="text-xs">Estado de atención</Label><select id="filter-status" className={selectClass} aria-label="Filtrar por estado" value={status} onChange={event => onStatusChange(event.target.value)}><option value="">Todos los estados</option>{states.map(state => <option key={state.value} value={state.value}>{state.label}</option>)}</select></div></div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-[#faf5ea] px-4 py-3 text-xs sm:px-5"><p className="min-w-0 leading-relaxed text-muted-foreground"><strong className="font-medium text-[#611232]">{PERIODS.find(period => period.value === selection.period)?.label || (selection.period === 'day' ? 'Día específico' : 'Rango de fechas')}</strong><span className="mx-2">·</span>{periodDescription(selection)}{!overview && status && <span> · {states.find(state => state.value === status)?.label}</span>}{!overview && query.trim() && <span className="break-all"> · Búsqueda: «{query.trim()}»</span>}</p><span role="status" className="shrink-0 font-medium text-[#611232]">{loading ? 'Buscando…' : total === null ? 'Consulta no disponible' : `${total} ${total === 1 ? 'registro encontrado' : 'registros encontrados'}`}</span></div>
  </section>;
}
