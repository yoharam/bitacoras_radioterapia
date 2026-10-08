'use client';

import { useEffect, useId, useState } from 'react';
import { LoaderCircle, Search, UserRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function PredictiveSearch({ id, label, value, onChange, endpoint, kind = 'patients', placeholder }) {
  const listId = useId();
  const [open, setOpen] = useState(false), [items, setItems] = useState([]), [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const expanded = open && value.trim().length >= 2;
  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, expanded, listId]);
  useEffect(() => {
    setItems([]); setActive(-1); setError('');
    if (!expanded) { setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api(`${endpoint}${endpoint.includes('?') ? '&' : '?'}${new URLSearchParams({ q: value.trim() })}`, { signal: controller.signal });
        if (!controller.signal.aborted) setItems(kind === 'users' ? data.users.map(user => ({ key: user.id, label: user.name, value: user.email, detail: user.email })) : data.suggestions.map(item => ({ key: item.name, label: item.name, value: item.name, detail: `${item.count} ${item.count === 1 ? 'atención en este período' : 'atenciones en este período'}` })));
      } catch (e) { if (!controller.signal.aborted) setError('No se pudieron cargar las sugerencias. Puedes continuar escribiendo para buscar.'); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, endpoint, kind, expanded]);
  function choose(item) { onChange(item.value); setOpen(false); setActive(-1); }
  function keyDown(event) {
    if (event.key === 'Escape') { setOpen(false); setActive(-1); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      if (items.length) setActive(previous => event.key === 'ArrowDown' ? (previous + 1) % items.length : (previous <= 0 ? items.length : previous) - 1);
    }
    if (event.key === 'Enter' && expanded && active >= 0 && items[active]) { event.preventDefault(); choose(items[active]); }
  }
  return <div className="relative min-w-0">
    <Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-[#a18a74]" />
    <Input id={id} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined} autoComplete="off" className="h-11 rounded-lg bg-card pr-10 pl-10" placeholder={placeholder} value={value} maxLength={200} onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} onKeyDown={keyDown} />
    {value && <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 size-9" aria-label={kind === 'users' ? 'Limpiar búsqueda de usuarios' : 'Limpiar búsqueda'} onClick={() => { onChange(''); setOpen(false); }}><X /></Button>}
    {expanded && <div className="absolute top-full right-0 left-0 z-30 mt-2 overflow-hidden rounded-xl border border-[#e8ddcc] bg-card shadow-lg"><p className="border-b bg-[#faf5ea] px-3 py-2 text-[11px] text-muted-foreground">Sugerencias · Usa ↑ ↓ y Enter para seleccionar</p><ul id={listId} role="listbox" aria-label={kind === 'users' ? 'Usuarios sugeridos' : 'Pacientes sugeridos'} className="max-h-72 overflow-y-auto">{!busy && !error && items.map((item, index) => <li id={`${listId}-${index}`} key={item.key} role="option" aria-selected={active === index} className={`flex cursor-pointer items-start gap-3 px-3 py-3 text-sm ${active === index ? 'bg-accent' : 'hover:bg-background'}`} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)} onMouseMove={() => setActive(index)}><UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" /><span className="min-w-0"><strong className="block font-medium break-words text-[#611232]">{item.label}</strong><small className="mt-1 block break-all text-muted-foreground">{item.detail}</small></span></li>)}</ul>{busy ? <p role="status" className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Buscando sugerencias…</p> : error ? <p role="status" className="p-3 text-xs text-primary">{error}</p> : !items.length && <p role="status" className="p-3 text-xs text-muted-foreground">Sin sugerencias para esta búsqueda.</p>}</div>}
  </div>;
}
