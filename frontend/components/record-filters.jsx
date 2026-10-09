'use client';

import { useState } from 'react';
import { Calendar, CalendarDays, CalendarRange, Check, ChevronDown, ChevronUp, History, RotateCcw, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PredictiveSearch from '@/components/predictive-search';
import { PERIODS, periodSelection, periodDescription, dateParams } from '@/lib/record-filters.mjs';

const selectClass = 'h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 md:text-sm';
const periodIcons = { today: Sun, yesterday: History, week: CalendarDays, 'last-week': CalendarRange, month: Calendar, all: History };
const quickPeriods = ['today', 'yesterday', 'week'];

function PeriodButtons({ periods, selection, custom, choose }) {
  return periods.map(period => {
    const selected = selection.period === period.value && !custom;
    const Icon = selected ? Check : periodIcons[period.value];
    return <Button key={period.value} type="button" variant={selected ? 'default' : 'outline'} aria-pressed={selected} className="h-11 w-full gap-1.5 rounded-lg px-2 text-[11px] motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[.98] focus-visible:ring-2 focus-visible:ring-[#a57f2c]/40 sm:w-auto sm:gap-2 sm:px-4 sm:text-xs" onClick={() => choose(period.value)}><Icon className="size-3.5 sm:size-4" aria-hidden="true" strokeWidth={1.75} />{period.label}</Button>;
  });
}

function DateSelection({ mode, custom, setCustom, draft, setDraft, selection, onPeriodChange, applyRange, invalidRange, suffix = '' }) {
  return <div className="grid items-start gap-3 lg:grid-cols-[200px_1fr]">
    <div className="space-y-2"><Label htmlFor={`custom-period${suffix}`} className="text-xs">O elige tus fechas{suffix ? ' (móvil)' : ''}</Label><select id={`custom-period${suffix}`} className={selectClass} value={mode} onChange={event => { setCustom(event.target.value || null); setDraft({ from: selection.from || selection.date || periodSelection('today').date, to: selection.to || selection.date || periodSelection('today').date }); }}><option value="">Seleccionar fechas…</option><option value="day">Día específico</option><option value="range">Rango de fechas</option></select></div>
    {mode === 'day' && <div className="max-w-xs space-y-2"><Label htmlFor={`consult-date${suffix}`} className="text-xs">Fecha de consulta{suffix ? ' (móvil)' : ''}</Label><Input id={`consult-date${suffix}`} type="date" className="h-11 w-full bg-card" min="1900-01-01" max="2100-12-31" value={selection.date || ''} onChange={event => { if (event.target.value && event.target.validity.valid) { onPeriodChange({ period: 'day', date: event.target.value, from: '', to: '' }); setCustom(null); } }} /></div>}
    {mode === 'range' && <form onSubmit={applyRange} className="space-y-2"><div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"><div className="min-w-0 space-y-2"><Label htmlFor={`filter-from${suffix}`} className="text-xs">Desde{suffix ? ' (móvil)' : ''}</Label><Input id={`filter-from${suffix}`} type="date" required min="1900-01-01" max="2100-12-31" className="h-11 w-full bg-card" value={draft.from} onChange={event => setDraft(previous => ({ ...previous, from: event.target.value }))} aria-describedby={`range-hint${suffix}`} aria-invalid={invalidRange} /></div><div className="min-w-0 space-y-2"><Label htmlFor={`filter-to${suffix}`} className="text-xs">Hasta{suffix ? ' (móvil)' : ''}</Label><Input id={`filter-to${suffix}`} type="date" required min="1900-01-01" max="2100-12-31" className="h-11 w-full bg-card" value={draft.to} onChange={event => setDraft(previous => ({ ...previous, to: event.target.value }))} aria-describedby={`range-hint${suffix}`} aria-invalid={invalidRange} /></div><Button type="submit" className="h-11 rounded-lg" disabled={!draft.from || !draft.to || invalidRange}>Aplicar rango</Button></div><p id={`range-hint${suffix}`} className={`text-xs ${invalidRange ? 'text-primary' : 'text-muted-foreground'}`} role={invalidRange ? 'alert' : undefined}>{invalidRange ? 'La fecha «Hasta» debe ser igual o posterior a «Desde».' : 'Incluye ambos días. Pulsa «Aplicar rango» para consultar.'}</p></form>}
  </div>;
}

export default function RecordFilters({ selection, onPeriodChange, query, onQueryChange, status, onStatusChange, states, overview, onReset, loading, total }) {
  const [custom, setCustom] = useState(null), [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(() => ({ from: selection.from || selection.date || periodSelection('today').date, to: selection.to || selection.date || periodSelection('today').date }));
  const mode = custom || (['day', 'range'].includes(selection.period) ? selection.period : '');
  const invalidRange = Boolean(draft.from && draft.to && draft.from > draft.to);
  const hasExtraFilters = Boolean(query.trim() || status);
  const extraPeriods = PERIODS.filter(period => !quickPeriods.includes(period.value));
  function choose(period) { setCustom(null); onPeriodChange(periodSelection(period)); }
  function applyRange(event) { event.preventDefault(); if (!draft.from || !draft.to || invalidRange) return; onPeriodChange({ period: 'range', date: '', ...draft }); setCustom(null); }
  function reset() { setCustom(null); setExpanded(false); onReset(); }
  const selectionProps = { mode, custom, setCustom, draft, setDraft, selection, onPeriodChange, applyRange, invalidRange };
  return <section aria-label="Filtros de consulta" className="mb-6 rounded-xl border border-[#e8ddcc] bg-card/90 shadow-xs">
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#faf0d8] text-[#a57f2c]"><CalendarDays className="size-5" /></span><div><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h2 className="text-sm font-bold text-[#611232]">¿Qué período quieres consultar?</h2><span key={`${selection.period}-${selection.date}-${selection.from}-${selection.to}`} className="inline-flex max-w-full items-center rounded-full border border-[#eadbb6] bg-[#fffaf0] px-2.5 py-1 text-[11px] font-medium text-[#765b20] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-reduce:animate-none">{periodDescription(selection)}</span></div><p className="mt-1 text-xs text-muted-foreground">Filtra por la fecha de atención del paciente.</p></div></div>
        {(selection.period !== 'today' || hasExtraFilters || custom) && <Button variant="ghost" className="h-10 text-xs text-muted-foreground" onClick={reset}><RotateCcw />Restablecer filtros</Button>}
      </div>
      <div role="group" aria-label="Períodos rápidos" className="hidden flex-wrap gap-2 sm:flex"><PeriodButtons periods={PERIODS} selection={selection} custom={custom} choose={choose} /></div>
      <div role="group" aria-label="Períodos rápidos" className="grid grid-cols-2 gap-2 sm:hidden"><PeriodButtons periods={PERIODS.filter(period => quickPeriods.includes(period.value))} selection={selection} custom={custom} choose={choose} /><Button type="button" variant="outline" aria-expanded={expanded} aria-controls="mobile-extra-filters" className="h-11 w-full gap-2 rounded-lg px-2 text-[11px] motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[.98] focus-visible:ring-2 focus-visible:ring-[#a57f2c]/40" onClick={() => setExpanded(value => !value)}>{expanded ? 'Menos filtros' : 'Más filtros'}{expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</Button></div>
      <div className="hidden sm:block"><DateSelection {...selectionProps} /></div>
      <div id="mobile-extra-filters" className={`space-y-4 sm:hidden ${expanded ? '' : 'hidden'}`}>
        <div role="group" aria-label="Más períodos" className="grid grid-cols-2 gap-2"><PeriodButtons periods={extraPeriods} selection={selection} custom={custom} choose={choose} /></div>
        <DateSelection {...selectionProps} suffix="-mobile" />
      </div>
      {!overview && <div className={`grid gap-3 border-t pt-4 sm:grid-cols-[1fr_210px] ${expanded ? '' : 'hidden'} sm:grid`}><div className="min-w-0 space-y-2"><Label htmlFor="patient-search" className="text-xs">Nombre del paciente</Label><PredictiveSearch id="patient-search" label="Buscar pacientes" placeholder="Escribe un nombre o apellido…" value={query} onChange={onQueryChange} endpoint={`/records/suggestions?${new URLSearchParams({ ...dateParams(selection), status })}`} /></div><div className="space-y-2"><Label htmlFor="filter-status" className="text-xs">Estado de atención</Label><select id="filter-status" className={selectClass} aria-label="Filtrar por estado" value={status} onChange={event => onStatusChange(event.target.value)}><option value="">Todos los estados</option>{states.map(state => <option key={state.value} value={state.value}>{state.label}</option>)}</select></div></div>}
    </div>
  </section>;
}
