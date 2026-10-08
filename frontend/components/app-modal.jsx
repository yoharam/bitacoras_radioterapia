'use client';

import { useRef } from 'react';
import { cn } from 'cn';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export default function Modal({ title, eyebrow, children, onClose, wide = false }) {
  const returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent showCloseButton={false} className={cn('max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-2xl border-[#e9dabe] bg-card p-0 sm:max-w-md', wide && 'sm:max-w-xl')} onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
    <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-[#fffaf0] px-5 py-5 sm:px-6"><div><span className="text-[10px] font-bold tracking-[.16em] text-[#916e24]">{eyebrow}</span><DialogTitle className="mt-2 text-2xl leading-snug font-bold tracking-tight text-[#611232]">{title}</DialogTitle><DialogDescription className="sr-only">Información y acciones de {title.toLowerCase()}.</DialogDescription></div><Button type="button" variant="ghost" size="icon" aria-label="Cerrar ventana" onClick={onClose}><X /></Button></div>{children}
  </DialogContent></Dialog>;
}
