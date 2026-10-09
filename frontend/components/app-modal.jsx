'use client';

import { useEffect, useRef } from 'react';
import { cn } from 'cn';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export default function Modal({ title, eyebrow, children, onClose, open = true, onAfterClose, wide = false }) {
  const returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const afterClose = useRef(onAfterClose);
  afterClose.current = onAfterClose;
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => afterClose.current?.(), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
    return () => clearTimeout(timer);
  }, [open]);
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}><DialogContent inert={!open} showCloseButton={false} className={cn('app-modal max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-2xl border-[#e9dabe] bg-card p-0 sm:max-w-md', wide && 'sm:max-w-xl')} onEscapeKeyDown={event => { if (event.target.closest?.('[role="combobox"][aria-expanded="true"]')) event.preventDefault(); }} onCloseAutoFocus={event => { event.preventDefault(); const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector('[data-testid="workspace-content"]'); target?.focus(); }}>
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-[#fffaf0] px-5 py-5 sm:px-6"><div><span className="text-[10px] font-bold tracking-[.16em] text-[#916e24]">{eyebrow}</span><DialogTitle className="mt-2 text-2xl leading-snug font-bold tracking-tight text-[#611232]">{title}</DialogTitle><DialogDescription className="sr-only">Información y acciones de {title.toLowerCase()}.</DialogDescription></div><Button type="button" variant="ghost" size="icon" aria-label="Cerrar ventana" onClick={onClose}><X /></Button></div>{children}
  </DialogContent></Dialog>;
}
