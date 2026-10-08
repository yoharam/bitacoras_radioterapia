'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, can } from '@/lib/api';
import { notifySuccess, notifyError } from '@/lib/notifications';

export default function NetworksPanel({ user }) {
  const [requests, setRequests] = useState([]), [status, setStatus] = useState('Solicitada');
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(null), [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/network-assistance?${new URLSearchParams({ status, page: String(page) })}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (page > data.pages) { setPage(data.pages); return; }
      setRequests(data.requests); setTotal(data.total); setPages(data.pages);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, page, revision, user]);
  async function complete(id) {
    setBusy(id);
    try {
      const result = await api(`/network-assistance/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Atendida' }) });
      notifySuccess(result.message); setRevision(value => value + 1);
    } catch (e) { notifyError(e.message); } finally { setBusy(null); }
  }
  return <section aria-label="Asistencia de Redes">
    <div className="mb-7"><span className="text-[10px] font-bold tracking-widest text-[#86651e]">INTERNET PARA PACIENTES</span><h1 className="mt-2 text-3xl font-bold text-[#611232]">Asistencia de Redes</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Consulta las solicitudes de internet y márcalas como atendidas después de conectar al paciente.</p></div>
    <Card className="gap-5 border-[#e8ddcc] p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-2"><label htmlFor="assistance-status" className="text-sm font-medium">Estado de la solicitud</label><select id="assistance-status" className="block h-11 max-w-full rounded-lg border bg-card px-3 text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="Solicitada">Pendientes</option><option value="Atendida">Atendidas</option><option value="">Todas</option></select></div><Button variant="outline" onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw />Actualizar solicitudes</Button></div>
      {error ? <p role="alert" className="rounded-lg border border-[#d4e4d9] bg-[#edf5ee] p-4 text-sm text-[#1e5b4f]">{error}</p> : loading ? <p role="status" className="flex items-center gap-2 py-6 text-sm"><LoaderCircle className="size-4 animate-spin" />Cargando solicitudes…</p> : !requests.length ? <p className="py-6 text-center text-sm text-muted-foreground">No hay solicitudes en este estado.</p> : <div className="grid gap-4 lg:grid-cols-2">{requests.map(request => <article key={request.id} data-assistance-id={request.id} className="min-w-0 space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><span className="flex items-center gap-2 text-sm font-medium text-[#1e5b4f]"><Wifi className="size-4" />Internet para paciente</span><Badge variant="outline" className="border-[#d4e4d9] bg-[#edf5ee] text-[#1e5b4f]">{request.status}</Badge></div>
        <h2 className="font-bold break-words text-[#611232]">{request.patient_name}</h2><dl className="space-y-2 text-xs leading-relaxed text-muted-foreground"><div><dt className="inline font-medium">Folio: </dt><dd className="inline">RT-{String(request.record_id).padStart(4, '0')}</dd></div><div><dt className="inline font-medium">Día de atención: </dt><dd className="inline">{new Date(`${request.date}T12:00:00`).toLocaleDateString('es-MX')}</dd></div><div><dt className="inline font-medium">Solicitó: </dt><dd className="inline break-words">{request.requester_name}</dd></div><div><dt className="inline font-medium">Solicitud: </dt><dd className="inline">{new Date(request.requested_at).toLocaleString('es-MX')}</dd></div>{request.handled_at && <div><dt className="inline font-medium">Atendida: </dt><dd className="inline break-words">{new Date(request.handled_at).toLocaleString('es-MX')} · {request.engineer_name || 'Redes'}</dd></div>}</dl>
        {request.status === 'Solicitada' && can(user, 'networks.update') && <Button className="h-11 w-full bg-[#1e5b4f] hover:bg-[#002f2a]" disabled={busy !== null} onClick={() => complete(request.id)}>{busy === request.id ? <LoaderCircle className="animate-spin" /> : <Check />}Marcar como atendida</Button>}
      </article>)}</div>}
      {!loading && !error && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"><span>{total} solicitudes</span><div className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Página anterior de solicitudes" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft /></Button><span>Página {page} de {pages}</span><Button variant="outline" size="icon" aria-label="Página siguiente de solicitudes" disabled={page >= pages} onClick={() => setPage(value => value + 1)}><ChevronRight /></Button></div></div>}
    </Card>
  </section>;
}
