'use client';

import { useEffect } from 'react';
import { ArrowRight, CalendarDays, ChevronRight, CircleHelp, ClipboardCheck, ClipboardList, LayoutDashboard, LoaderCircle, LogOut, Menu, Users, Wifi, X } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { can } from '@/lib/api';

const navigationGroups = [
  { label: 'Atención', items: [
    { key: 'overview', label: 'Resumen', Icon: LayoutDashboard, permission: 'radiotherapy.read' },
    { key: 'records', label: 'Pacientes', Icon: ClipboardList, permission: 'radiotherapy.read' },
    { key: 'networks', label: 'Redes', Icon: Wifi, permission: 'networks.read' }
  ] },
  { label: 'Administración', items: [
    { key: 'users', label: 'Usuarios', Icon: Users, permission: 'users.read' },
    { key: 'audit', label: 'Auditoría', Icon: ClipboardCheck, adminOnly: true }
  ] }
];
const moduleNames = { overview: 'Resumen', records: 'Pacientes', networks: 'Redes', users: 'Usuarios', audit: 'Auditoría', none: 'Mi cuenta' };
const sidebarAction = 'h-11 justify-start gap-3 rounded-lg px-3 text-sm text-[#f3e4e9] transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-[#e6d194]';

function SidebarContent({ user, view, total, brand, onNavigate, onHelp, onAccount, onLogout, loggingOut }) {
  const groups = navigationGroups.map(group => ({ ...group, items: group.items.filter(item => item.adminOnly ? user.is_admin : can(user, item.permission)) })).filter(group => group.items.length);

  return <>
    <div className="shrink-0 px-5 pt-7 pb-6">{brand}</div>
    <nav aria-label="Navegación principal" className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {groups.map(group => <div key={group.label} className="space-y-2">
        <p className="px-3 pb-1 text-[10px] font-semibold tracking-[.16em] text-[#e6d194] uppercase">{group.label}</p>
        {group.items.map(({ key, label, Icon }) => {
          const active = view === key;
          return <Button key={key} variant="ghost" aria-current={active ? 'page' : undefined} onClick={() => onNavigate(key)} className={cn('h-12 w-full justify-start gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-[#e6d194]', active ? 'bg-[#fff8eb] text-[#611232] shadow-sm hover:bg-[#fff8eb] hover:text-[#611232]' : 'text-[#ead7de] hover:bg-white/10 hover:text-white')}>
            <Icon className={cn('size-[18px] shrink-0', active ? 'text-[#9b2247]' : 'text-[#e6d194]')} aria-hidden="true" />
            <span>{label}</span>
            {key === 'records' && <span className={cn('ml-auto min-w-6 rounded-md px-1.5 py-0.5 text-center text-[10px] tabular-nums', active ? 'bg-[#9b224710] text-[#611232]' : 'bg-white/10 text-[#f3e4e9]')}>{total}</span>}
            {active && key !== 'records' && <ChevronRight className="ml-auto size-3.5" aria-hidden="true" />}
          </Button>;
        })}
      </div>)}
      {!groups.length && <p className="px-3 text-sm leading-6 text-[#ead7de]">Sin módulos disponibles.</p>}
    </nav>
    <div className="shrink-0 border-t border-white/10 px-3 pt-3 pb-4">
      <Button variant="ghost" className={cn(sidebarAction, 'w-full')} onClick={onHelp}><CircleHelp className="size-[18px] text-[#e6d194]" aria-hidden="true" />Guía rápida<ArrowRight className="ml-auto size-3.5 text-[#e6d194]" aria-hidden="true" /></Button>
      <div className="mt-3 hidden border-t border-white/10 pt-4 md:block">
        <Button variant="ghost" aria-label="Abrir mi cuenta" title={user.name} onClick={onAccount} className="h-auto w-full justify-start gap-3 rounded-xl border border-white/10 bg-black/10 p-3 text-white hover:bg-white/10 hover:text-white focus-visible:ring-[#e6d194]">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e6d194] text-sm font-bold text-[#611232]" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1 text-left"><strong className="block truncate text-xs font-semibold">{user.name}</strong><small className="mt-1 block text-[10px] text-[#dcc4cd]">{user.is_admin ? 'Administrador' : 'Personal'}</small></span>
          <ChevronRight className="size-3.5 shrink-0 text-[#e6d194]" aria-hidden="true" />
        </Button>
        <Button variant="ghost" aria-label="Cerrar sesión" onClick={onLogout} disabled={loggingOut} className={cn(sidebarAction, 'mt-2 w-full text-[#e6d194]')}>
          {loggingOut ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}Cerrar sesión
        </Button>
      </div>
      <p className="mt-3 px-3 text-[8px] tracking-[.12em] text-[#c9acb8]">BITÁCORAS INSTITUCIONALES</p>
    </div>
  </>;
}

export default function InstitutionalNavigation({ user, view, total, brand, mobileOpen, onMobileChange, onNavigate, onHelp, onAccount, onLogout, loggingOut }) {
  const sidebarProps = { user, view, total, brand, onNavigate, onHelp, onAccount, onLogout, loggingOut };

  useEffect(() => {
    if (!mobileOpen) return;
    const desktop = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = () => { if (desktop.matches) onMobileChange(false); };
    desktop.addEventListener('change', closeOnDesktop);
    closeOnDesktop();
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, [mobileOpen, onMobileChange]);

  return <Dialog open={mobileOpen} onOpenChange={onMobileChange}>
    <aside data-testid="institutional-sidebar" aria-label="Menú institucional" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-t-[3px] border-[#a57f2c] bg-[linear-gradient(165deg,#611232_0%,#4a1028_100%)] text-white md:flex">
      <SidebarContent {...sidebarProps} />
    </aside>
    <header data-testid="workspace-header" className="sticky top-0 z-20 flex h-20 min-w-0 items-center justify-between gap-3 border-b border-[#e9e1d4] bg-[#fffefa] px-4 sm:px-6 md:ml-64 lg:px-9">
      <div className="flex min-w-0 items-center gap-3">
        <DialogTrigger asChild><Button data-testid="mobile-menu-trigger" variant="ghost" size="icon" className="size-11 shrink-0 text-[#611232] md:hidden" aria-label="Abrir menú"><Menu aria-hidden="true" /></Button></DialogTrigger>
        <div className="min-w-0"><span className="mb-1 hidden text-[9px] font-semibold tracking-[.13em] text-[#86651e] uppercase sm:block">Servicio de radioterapia</span><span className="block truncate text-base font-semibold tracking-tight text-[#611232]">{moduleNames[view] || 'Pacientes'}</span></div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-2.5 rounded-lg border border-[#eedec0] bg-[#fbf5e7] px-3 py-2.5 text-[11px] text-[#806017] lg:flex"><CalendarDays className="size-4" aria-hidden="true" /><time>{new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</time></div>
        <div className="flex items-center gap-1 md:hidden">
          <Button variant="ghost" size="icon" className="size-11 rounded-lg text-[#611232]" aria-label="Abrir mi cuenta" title={`Mi cuenta: ${user.name}`} onClick={onAccount}><span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold" aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span></Button>
          <Button variant="ghost" size="icon" className="size-11 text-[#611232]" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={onLogout} disabled={loggingOut}>{loggingOut ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}</Button>
        </div>
      </div>
    </header>
    <DialogContent data-testid="mobile-sidebar" showCloseButton={false} className="top-0 left-0 flex h-dvh w-[min(18rem,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 border-t-[3px] border-[#a57f2c] bg-[linear-gradient(165deg,#611232_0%,#4a1028_100%)] p-0 text-white sm:max-w-none data-[state=open]:slide-in-from-left-4 data-[state=closed]:slide-out-to-left-4 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100">
      <DialogTitle className="sr-only">Navegación de Bitácoras</DialogTitle>
      <DialogDescription className="sr-only">Selecciona un módulo o consulta la guía rápida.</DialogDescription>
      <DialogClose asChild><Button variant="ghost" size="icon" aria-label="Cerrar menú" className="absolute top-3 right-3 size-9 text-[#ead7de] hover:bg-white/10 hover:text-white focus-visible:ring-[#e6d194]"><X className="size-4" aria-hidden="true" /></Button></DialogClose>
      <SidebarContent {...sidebarProps} />
    </DialogContent>
  </Dialog>;
}
