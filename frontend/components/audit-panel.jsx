'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, History, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';

const labels = {
  'auth.login_succeeded': 'Inicio de sesión',
  'auth.login_failed': 'Intento de acceso fallido',
  'auth.login_blocked': 'Acceso bloqueado por intentos',
  'auth.logout': 'Cierre de sesión',
  'auth.password_changed': 'Cambio de contraseña',
  'record.created': 'Registro creado',
  'record.updated': 'Registro actualizado',
  'record.status_changed': 'Estado de atención cambiado',
  'record.arrival_recorded': 'Llegada registrada',
  'record.deleted': 'Registro eliminado',
  'network.requested': 'Asistencia de Redes solicitada',
  'network.assigned': 'Solicitud de Redes asignada',
  'network.completed': 'Solicitud de Redes atendida',
  'user.created': 'Usuario creado',
  'user.updated': 'Usuario actualizado',
  'user.deleted': 'Usuario eliminado'
};

export default function AuditPanel() {
  const [events, setEvents] = useState([]), [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/audit?page=${page}&limit=20`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setEvents(data.events); setPages(data.pages); setTotal(data.total);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);
  return <section aria-label="Auditoría del sistema">
    <div className="mb-7"><span className="text-[10px] font-bold tracking-widest text-[#86651e]">SEGURIDAD Y TRAZABILIDAD</span><h1 className="mt-2 text-3xl font-bold text-[#611232]">Auditoría</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Accesos y cambios registrados. No se muestran nombres, RFC ni observaciones de pacientes.</p></div>
    <Card className="gap-0 overflow-hidden border-[#e8ddcc] p-0">
      {error ? <p role="alert" className="p-6 text-sm text-destructive">{error}</p> : loading ? <p role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Cargando auditoría…</p> : !events.length ? <div className="flex flex-col items-center gap-3 p-10 text-center"><History className="size-8 text-[#a57f2c]" /><p className="text-sm text-muted-foreground">Todavía no hay eventos registrados.</p></div> : <ol className="divide-y" aria-label="Eventos recientes">
        {events.map(event => <li key={event.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5"><div className="min-w-0"><p className="font-medium text-[#611232]">{labels[event.action] || 'Actividad del sistema'}</p><p className="mt-1 text-xs text-muted-foreground">{event.actor_name} · {event.entity}{event.entity_id ? ` #${event.entity_id}` : ''}</p></div><time className="shrink-0 text-xs tabular-nums text-muted-foreground" dateTime={event.created_at}>{new Date(event.created_at).toLocaleString('es-MX')}</time></li>)}
      </ol>}
      {!loading && !error && <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-[#faf5ea] px-5 py-4 text-xs text-muted-foreground"><span>{total} eventos de auditoría</span><div className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Página anterior de auditoría" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft /></Button><span>Página {page} de {pages}</span><Button variant="outline" size="icon" aria-label="Página siguiente de auditoría" disabled={page >= pages} onClick={() => setPage(value => value + 1)}><ChevronRight /></Button></div></div>}
    </Card>
  </section>;
}
