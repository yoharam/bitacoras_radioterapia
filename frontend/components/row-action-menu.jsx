'use client';

import { useId, useRef } from 'react';
import { DropdownMenu } from 'radix-ui';
import { EllipsisVertical, LoaderCircle } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';

export default function RowActionMenu({ label, caption, items, disabled = false, busy = false }) {
  const trigger = useRef(null), pending = useRef(null);

  const hintId = useId();
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild><Button ref={trigger} type="button" variant="ghost" size="icon" className="size-11 rounded-lg text-[#611232] hover:bg-[#f9f2e4]" aria-label={label} title={label} disabled={disabled || busy}>
      {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <EllipsisVertical className="size-5" aria-hidden="true" />}
    </Button></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content aria-label={label} align="end" sideOffset={6} collisionPadding={16} loop className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[#e8ddcc] bg-card p-1.5 shadow-lg outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95 motion-safe:duration-150" onCloseAutoFocus={event => {
      if (!pending.current) return;
      event.preventDefault();
      const action = pending.current; pending.current = null;
      trigger.current?.focus();

      action();
    }}>
      <DropdownMenu.Label className="break-words px-3 py-2 text-[10px] font-bold tracking-wider text-[#86651e] [overflow-wrap:anywhere]">{caption || 'ACCIONES'}</DropdownMenu.Label>
      {items.map(item => <div key={item.key}>
        {item.destructive && <DropdownMenu.Separator className="my-1 h-px bg-[#e8ddcc]" />}
        <DropdownMenu.Item textValue={item.label} aria-label={item.label} aria-describedby={item.hint ? `${hintId}-${item.key}` : undefined} disabled={item.disabled} className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-sm text-[#611232] outline-none select-none data-[highlighted]:bg-[#f9f2e4] data-[disabled]:cursor-default data-[disabled]:opacity-50', item.destructive && 'text-[#b42318] data-[highlighted]:bg-[#fff0ed]')} onSelect={() => { pending.current = item.onSelect; }}>
          <item.icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0"><span className="block">{item.label}</span>{item.hint && <span id={`${hintId}-${item.key}`} className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{item.hint}</span>}</span>
        </DropdownMenu.Item>
      </div>)}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
