'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, History, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api } from '@/lib/api';

const labels = {
  'auth.login_succeeded': 'Inicio de sesión', 'auth.login_failed': 'Intento de acceso fallido',
  'auth.login_blocked': 'Acceso bloqueado por intentos', 'auth.logout': 'Cierre de sesión',
  'auth.password_changed': 'Cambio de contraseña', 'record.created': 'Registro creado',
  'record.updated': 'Registro actualizado', 'record.status_changed': 'Estado de atención cambiado',
  'record.arrival_recorded': 'Llegada registrada', 'record.deleted': 'Registro eliminado',
  'network.requested': 'Asistencia de Redes solicitada', 'network.assigned': 'Solicitud de Redes asignada',
  'network.completed': 'Solicitud de Redes atendida', 'user.created': 'Usuario creado',
  'user.updated': 'Usuario actualizado', 'user.deleted': 'Usuario eliminado',
  'security.permission_denied': 'Acción denegada por permisos'
};
const entities = { auth: 'Sesión', user: 'Usuario', record: 'Atención', network_assistance: 'Solicitud de Redes', security: 'Seguridad' };
const dateLabel = value => new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'medium' });

export default function AuditPanel() {
  const [events, setEvents] = useState([]), [actions, setActions] = useState([]);
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [action, setAction] = useState('');
  const [revision, setRevision] = useState(0), [selected, setSelected] = useState(null), [updatedAt, setUpdatedAt] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setQuery(search.trim()); }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    async function load(showLoading = false) {
      if (running) return;
      running = true;
      if (showLoading) setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '20', q: query, action });
        const data = await api(`/audit?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setEvents(data.events); setPages(data.pages); setTotal(data.total); setActions(data.actions || []); setError(''); setUpdatedAt(new Date());
        if (page > data.pages) setPage(data.pages);
      } catch (e) { if (!controller.signal.aborted) setError(e.message); }
      finally { running = false; if (!controller.signal.aborted) setLoading(false); }
    }
    load(true);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [page, query, action, revision]);
  const clear = () => { setSearch(''); setQuery(''); setAction(''); setPage(1); };
  return <section aria-label="Auditoría del sistema">
    <div className="mb-7"><span className="text-[10px] font-bold tracking-widest text-[#86651e]">SEGURIDAD Y TRAZABILIDAD</span><h1 className="mt-2 text-3xl font-bold text-[#611232]">Auditoría</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Consulta quién realizó cada acción, desde qué IP y cuándo. La identidad queda guardada como estaba al realizarla.</p><p className="mt-1 text-xs text-muted-foreground">Los eventos anteriores pueden no tener usuario o IP registrados. Los accesos fallidos no acreditan una identidad.</p></div>
    <Card className="gap-0 overflow-hidden border-[#e8ddcc] p-0">
      <div className="grid gap-4 border-b bg-[#faf5ea] p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-2"><Label htmlFor="audit-search">Buscar persona, usuario, correo o IP</Label><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input id="audit-search" className="pl-9" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre de usuario o 192.168…" /></div></div>
        <div className="space-y-2"><Label htmlFor="audit-action">Tipo de actividad</Label><select id="audit-action" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={action} onChange={event => { setAction(event.target.value); setPage(1); }}><option value="">Todas las actividades</option>{actions.map(value => <option key={value} value={value}>{labels[value] || value}</option>)}</select></div>
        <div className="flex gap-2"><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw className={loading ? 'animate-spin' : ''} />Actualizar</Button>{(search || action) && <Button variant="ghost" onClick={clear}>Limpiar</Button>}</div>
      </div>
      {error ? <p role="alert" className="p-6 text-sm text-destructive">{error}</p> : loading ? <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Cargando auditoría…</p> : !events.length ? <div className="flex flex-col items-center gap-3 p-10 text-center"><History className="size-8 text-[#a57f2c]" /><p className="text-sm text-muted-foreground">{query || action ? 'No hay eventos que coincidan con estos filtros.' : 'Todavía no hay eventos registrados.'}</p></div> : <ol className="divide-y" aria-label="Eventos recientes">
        {events.map(event => <li key={event.id}><button type="button" className="flex w-full flex-col gap-3 px-5 py-4 text-left transition hover:bg-[#faf5ea] focus-visible:outline-2 focus-visible:outline-[#a57f2c] sm:flex-row sm:items-center sm:justify-between sm:gap-5" onClick={() => setSelected(event)} aria-label={`Ver detalle: ${labels[event.action] || event.action}, evento ${event.id}`}><div className="min-w-0"><p className="font-medium text-[#611232]">{labels[event.action] || 'Actividad del sistema'}</p><p className="mt-1 break-words text-sm">{event.actor_name} <span className="text-muted-foreground">{event.actor_username ? `· @${event.actor_username}` : '· Usuario no registrado'}</span></p><p className="mt-1 break-all text-xs text-muted-foreground">IP: <span className="font-mono">{event.ip_address || 'No registrada'}</span> · {entities[event.entity] || event.entity}{event.entity_id ? ` #${event.entity_id}` : ''}</p></div><div className="shrink-0 text-xs text-muted-foreground"><time className="tabular-nums" dateTime={event.created_at}>{dateLabel(event.created_at)}</time><p className="mt-1 text-[#86651e]">Ver detalles →</p></div></button></li>)}
      </ol>}
      {!loading && !error && <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-[#faf5ea] px-5 py-4 text-xs text-muted-foreground"><div><p>{total} eventos de auditoría</p>{updatedAt && <p className="mt-1">Actualizado a las {updatedAt.toLocaleTimeString('es-MX')} · cada 15 segundos</p>}</div><div className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Página anterior de auditoría" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft /></Button><span>Página {page} de {pages}</span><Button variant="outline" size="icon" aria-label="Página siguiente de auditoría" disabled={page >= pages} onClick={() => setPage(value => value + 1)}><ChevronRight /></Button></div></div>}
    </Card>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Detalle del evento #{selected?.id}</DialogTitle><DialogDescription>{labels[selected?.action] || selected?.action}</DialogDescription></DialogHeader>{selected && <dl className="grid gap-3 text-sm">{[
      ['Nombre', selected.actor_name], ['Nombre de usuario', selected.actor_username || 'No registrado en este evento'],
      ['Correo electrónico', selected.actor_email || 'Sin correo registrado'], ['ID de usuario', selected.actor_user_id ?? 'Sin sesión autenticada'],
      ['IP de origen', selected.ip_address || 'No registrada en este evento'], ['Fecha y hora', dateLabel(selected.created_at)],
      ['Recurso', `${entities[selected.entity] || selected.entity}${selected.entity_id ? ` #${selected.entity_id}` : ''}`],
      ['Solicitud', selected.request_method ? `${selected.request_method} ${selected.request_path}` : 'No registrada en este evento'],
      ...(selected.details?.permission ? [['Permiso requerido', selected.details.permission]] : []),
      ...(selected.details?.attempted_identifier ? [['Identificador intentado (sin verificar)', selected.details.attempted_identifier]] : []),
      ...(selected.details?.reason ? [['Motivo', selected.details.reason === 'invalid_credentials' ? 'Credenciales inválidas o cuenta inactiva' : selected.details.reason === 'rate_limited' ? 'Límite de intentos superado' : selected.details.reason]] : [])
    ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>}</DialogContent></Dialog>
  </section>;
}
