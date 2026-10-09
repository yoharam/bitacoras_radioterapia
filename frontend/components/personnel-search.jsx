'use client';

import { useEffect, useId, useState } from 'react';
import { LoaderCircle, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function PersonnelSearch({ onSelect }) {
  const id = useId();
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const [people, setPeople] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const expanded = open && query.trim().length >= 2;
  useEffect(() => {
    setPeople([]); setActive(-1); setError('');
    if (!expanded) { setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/users/personnel?${new URLSearchParams({ q: query.trim() })}`, { signal: controller.signal });
        if (!controller.signal.aborted) setPeople(data.people);
      } catch (e) { if (!controller.signal.aborted) setError(e.message); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, expanded]);
  useEffect(() => { if (expanded && active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [expanded, active, id]);
  function choose(person) {
    if (!person.name || person.registered) return;
    onSelect(person); setQuery(person.name); setOpen(false); setActive(-1);
  }
  function keyDown(event) {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); setOpen(true);
      const available = people.map((person, index) => person.name && !person.registered ? index : -1).filter(index => index >= 0);
      if (available.length) {
        const current = available.indexOf(active);
        setActive(available[event.key === 'ArrowDown' ? (current + 1) % available.length : (current <= 0 ? available.length : current) - 1]);
      }
    }
    if (event.key === 'Enter' && expanded) { event.preventDefault(); if (people[active]) choose(people[active]); }
  }
  return <div className="min-w-0 space-y-2 rounded-xl border border-[#e8ddcc] bg-[#faf5ea] p-4">
    <Label htmlFor={id}>Buscar personal institucional (opcional)</Label>
    <p className="text-xs leading-relaxed text-muted-foreground">Busca por nombre o número de empleado para completar sus datos. También puedes capturarlos manualmente.</p>
    <div className="relative min-w-0">
      <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
      <Input id={id} role="combobox" aria-label="Buscar personal institucional" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined} aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined} autoComplete="off" maxLength={120} className="h-11 bg-card pr-10 pl-10" placeholder="Nombre o número de empleado…" value={query} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={keyDown} />
      {query && <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 size-9" aria-label="Limpiar búsqueda de personal" onClick={() => { setQuery(''); setOpen(false); }}><X /></Button>}
      {expanded && <div className="absolute top-full right-0 left-0 z-30 mt-2 overflow-hidden rounded-xl border bg-card shadow-lg">
        <ul id={`${id}-list`} role="listbox" aria-label="Personal institucional sugerido" className="max-h-64 overflow-y-auto">{people.map((person, index) => <li key={person.employee_number} id={`${id}-option-${index}`} role="option" aria-selected={active === index} aria-disabled={person.registered || !person.name} className={`px-3 py-3 text-sm ${person.registered || !person.name ? 'text-muted-foreground' : `cursor-pointer ${active === index ? 'bg-accent' : 'hover:bg-background'}`}`} onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(person)}>
          <strong className="block break-words font-medium">{person.name || 'Nombre no disponible para este sistema'}</strong><small className="mt-1 block break-words">Empleado {person.employee_number}{person.service ? ` · ${person.service}` : ''}</small><small className="mt-1 block break-words">{person.registered ? 'Cuenta ya registrada; consulta su usuario existente.' : person.username ? `Usuario sugerido: ${person.username}` : ''}</small>
        </li>)}</ul>
        {busy ? <p role="status" className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Consultando personal…</p> : error ? <p role="status" className="p-3 text-xs leading-relaxed text-primary">{error}</p> : !people.length && <p role="status" className="p-3 text-xs text-muted-foreground">No se encontraron coincidencias. Puedes continuar con la captura manual.</p>}
      </div>}
    </div>
  </div>;
}
