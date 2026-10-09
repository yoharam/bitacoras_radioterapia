'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { entitlementLabel, searchEntitlementTypes } from '../../shared/entitlement-types.mjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function EntitlementSelect({ id, value, onChange }) {
  const listId = useId();
  const input = useRef(null);
  const [search, setSearch] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const items = searchEntitlementTypes(search ?? '');
  const invalid = Boolean(search?.trim() && !value);

  useEffect(() => {
    input.current?.setCustomValidity(invalid ? 'Selecciona una opción de las sugerencias o limpia la búsqueda para dejar el campo sin registrar.' : '');
  }, [invalid]);
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, listId]);

  function choose(code) { onChange(code); setSearch(null); setOpen(false); setActive(-1); }
  function keyDown(event) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true);
      if (items.length) setActive(previous => event.key === 'ArrowDown' ? (previous + 1) % items.length : (previous <= 0 ? items.length : previous) - 1);
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (items[active]) choose(items[active].code);
      else if (items.length === 1) choose(items[0].code);
      else if (items.length) setActive(0);
    }
  }

  return <div className="relative min-w-0">
    <Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-[#a18a74]" />
    <Input ref={input} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined} aria-describedby={`${listId}-hint`} autoComplete="off" maxLength={100} placeholder="Busca por código o nombre…" className="h-11 rounded-lg bg-card pr-10 pl-10" value={search ?? (value ? entitlementLabel(value) : '')} onChange={event => { setSearch(event.target.value); onChange(''); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} onKeyDown={keyDown} />
    {(value || search) && <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 size-9" aria-label="Limpiar tipo de derechohabiencia" onClick={() => { choose(''); input.current?.focus(); }}><X /></Button>}
    <p id={`${listId}-hint`} className="mt-2 text-xs leading-relaxed text-muted-foreground">{invalid ? 'Selecciona una sugerencia para guardar su código.' : 'Opcional. Busca por código o nombre; usa ↑ ↓ y Enter para elegir.'}</p>
    {open && <div className="absolute top-11 right-0 left-0 z-30 mt-2 overflow-hidden rounded-xl border border-[#e8ddcc] bg-card shadow-lg">
      <p role="status" className="border-b bg-[#faf5ea] px-3 py-2 text-[11px] text-muted-foreground">{items.length ? `${items.length} ${items.length === 1 ? 'opción disponible' : 'opciones disponibles'}` : 'Sin coincidencias. Prueba otro código o nombre.'}</p>
      <ul id={listId} role="listbox" aria-label="Tipos de derechohabiencia" className="max-h-56 overflow-y-auto">{items.map((type, index) => <li id={`${listId}-${index}`} key={type.code} role="option" aria-selected={value === type.code} className={`flex cursor-pointer items-center gap-3 px-3 py-3 text-sm ${active === index ? 'bg-accent' : 'hover:bg-background'}`} onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(type.code)}>
        <span className="shrink-0 rounded-md border border-[#e8ddcc] bg-[#faf5ea] px-2 py-1 font-semibold tabular-nums text-primary">{type.code}</span><span className="min-w-0 flex-1 break-words text-[#611232]">{type.name}</span>{value === type.code && <Check className="size-4 shrink-0 text-[#1e5b4f]" aria-hidden="true" />}
      </li>)}</ul>
    </div>}
  </div>;
}
