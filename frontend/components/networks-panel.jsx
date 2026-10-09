'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, LoaderCircle, RefreshCw, Trophy, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api, can } from '@/lib/api';
import { notifySuccess, notifyError } from '@/lib/notifications';
import { networkRecognitionFill, notifyNetworkRecognition } from '@/components/notifications';

function localMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function elapsedLabel(timestamp, now) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 60000));
  if (!Number.isFinite(minutes) || minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export default function NetworksPanel({ user }) {
  const [requests, setRequests] = useState([]), [assignees, setAssignees] = useState([]), [status, setStatus] = useState('Solicitada');
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(null), [revision, setRevision] = useState(0);
  const [month, setMonth] = useState(localMonth), [recognition, setRecognition] = useState(null);
  const [recognitionLoading, setRecognitionLoading] = useState(true), [recognitionError, setRecognitionError] = useState('');
  const [historyEngineer, setHistoryEngineer] = useState(null), [historyPage, setHistoryPage] = useState(1);
  const [celebration, setCelebration] = useState(null);
  const lastRequestQuery = useRef(null), operation = useRef(null);
  const requestKey = `${user.id}:${status}:${page}`;
  const matchingRequests = lastRequestQuery.current === requestKey;
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 900);
    return () => clearTimeout(timer);
  }, [celebration]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
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
      lastRequestQuery.current = requestKey;
      setRequests(data.requests); setAssignees(data.assignees || []); setTotal(data.total); setPages(data.pages);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, page, revision, user]);
  useEffect(() => {
    const controller = new AbortController(); setRecognitionLoading(true); setRecognitionError('');
    const params = new URLSearchParams({ month, page: String(historyPage) });
    if (historyEngineer !== null) params.set('engineer', String(historyEngineer));
    api(`/network-assistance/recognition?${params}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (historyPage > data.pages) { setHistoryPage(data.pages); return; }
      setRecognition(data);
    }).catch(e => { if (e.name !== 'AbortError') setRecognitionError(e.message); }).finally(() => { if (!controller.signal.aborted) setRecognitionLoading(false); });
    return () => controller.abort();
  }, [month, historyEngineer, historyPage, revision, user]);
  async function complete(id) {
    if (operation.current !== null) return;
    operation.current = id; setBusy(id);
    try {
      const result = await api(`/network-assistance/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'Atendida' }) });
      if (result.newly_completed && result.recognition) {
        notifyNetworkRecognition(result.recognition);
        setCelebration({ engineerId: result.recognition.engineer_id, month: result.recognition.month });
      }
      else notifySuccess(result.message);
      setRevision(value => value + 1);
    } catch (e) { notifyError(e.message); } finally { operation.current = null; setBusy(null); }
  }
  async function assign(id, assignedTo) {
    if (operation.current !== null) return;
    operation.current = id; setBusy(id);
    try {
      const result = await api(`/network-assistance/${id}`, { method: 'PATCH', body: JSON.stringify({ assigned_to: assignedTo }) });
      notifySuccess(result.message); setRevision(value => value + 1);
    } catch (e) { notifyError(e.message); } finally { operation.current = null; setBusy(null); }
  }
  return <section aria-label="Asistencia de Redes">
    <div className="mb-7"><span className="text-[10px] font-bold tracking-widest text-[#86651e]">INTERNET PARA PACIENTES</span><h1 className="mt-2 text-3xl font-bold text-[#611232]">Asistencia de Redes</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Consulta las solicitudes de internet y márcalas como atendidas después de conectar al paciente.</p></div>
    <Card className="mb-5 gap-4 border-[#e8ddcc] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 className="flex items-center gap-2 text-lg font-bold text-[#611232]"><Trophy className="size-5 shrink-0 text-[#86651e]" />Rachas de Redes</h2><p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">Cada atención suma a la cuenta que la completa. El dorado se alcanza con más de 10 atenciones al mes.</p></div><label className="block min-w-0 space-y-1 text-xs font-medium text-[#611232]" htmlFor="recognition-month">Mes de reconocimiento<input id="recognition-month" type="month" min="1900-01" max="2100-12" value={month} onChange={event => { if (event.target.value) { setMonth(event.target.value); setHistoryPage(1); setRecognition(null); } }} className="block h-10 max-w-full rounded-lg border border-input bg-card px-3 text-sm font-normal text-foreground" /></label></div>
      {recognitionError ? <p role="alert" className="rounded-lg border p-3 text-sm text-[#611232]">{recognitionError}</p> : !recognition ? <p role="status" className="flex items-center gap-2 py-3 text-sm"><LoaderCircle className="size-4 animate-spin" />Cargando rachas…</p> : !recognition.engineers.length ? <p className="text-sm text-muted-foreground">Las cuentas con permiso para atender Redes aparecerán aquí con su contador mensual.</p> : <div className="grid gap-3 lg:grid-cols-2">{recognition.engineers.map(engineer => <div key={engineer.engineer_id} data-testid={`engineer-recognition-${engineer.engineer_id}`} data-count={engineer.completed} data-level={engineer.gold ? 'gold' : 'building'} data-celebrating={celebration?.engineerId === engineer.engineer_id && celebration.month === month ? 'true' : undefined} className={`recognition-card min-w-0 space-y-3 rounded-xl border p-4 ${engineer.gold ? 'border-[#a57f2c] bg-[#fbf0d5]' : 'border-[#e8ddcc] bg-[#faf8f3]'}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold tracking-wide text-[#86651e]">{engineer.engineer_id === user.id ? 'TU AVANCE' : 'EQUIPO DE REDES'}{!engineer.active && ' · CUENTA INACTIVA'}</p><h3 className="mt-1 text-sm font-semibold break-words text-[#611232]">{engineer.engineer_name}</h3></div><strong className="recognition-count shrink-0 rounded-lg px-3 py-2 text-xl text-white" style={{ backgroundColor: networkRecognitionFill(engineer.completed) }}>x{engineer.completed}</strong></div>
        <div role="progressbar" aria-label={`Progreso dorado de ${engineer.engineer_name}`} aria-valuemin={0} aria-valuemax={11} aria-valuenow={Math.min(11, engineer.completed)} aria-valuetext={`${engineer.completed} atenciones este mes${engineer.gold ? ', dorado completo' : ''}`} className="h-2 overflow-hidden rounded-full bg-[#e9e0cd]"><div className="recognition-progress h-full rounded-full" style={{ width: `${Math.min(11, engineer.completed) / 11 * 100}%`, backgroundColor: networkRecognitionFill(engineer.completed) }} /></div>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[#695324]">{engineer.gold ? '¡Dorado del mes alcanzado!' : `${engineer.completed} atenciones completadas este mes`}</p><Button variant="outline" size="sm" aria-label={`Ver historial de ${engineer.engineer_name}`} onClick={() => { if (historyEngineer !== engineer.engineer_id || historyPage !== 1) setRecognitionLoading(true); setHistoryEngineer(engineer.engineer_id); setHistoryPage(1); }}>Ver historial</Button></div>
      </div>)}</div>}
      {historyEngineer !== null && recognition && !recognitionError && <section aria-label="Historial de reconocimiento" className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold break-words text-[#611232]">Historial de {recognition.engineers.find(engineer => engineer.engineer_id === historyEngineer)?.engineer_name || 'Redes'}</h3><Button variant="ghost" size="sm" onClick={() => { setHistoryEngineer(null); setHistoryPage(1); }}>Cerrar historial</Button></div>{recognitionLoading ? <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 animate-spin" />Cargando historial…</p> : !recognition.history.length ? <p className="text-xs text-muted-foreground">No hay atenciones completadas en este mes.</p> : <ul className="divide-y">{recognition.history.map(event => <li key={event.id} className="flex flex-wrap justify-between gap-1 py-2 text-xs"><div className="min-w-0"><p className="font-medium text-[#611232]">{event.record_id ? `RT-${String(event.record_id).padStart(4, '0')}` : `Solicitud ${event.assistance_id}`} · Atención completada</p><p className="mt-1 break-words text-muted-foreground">{event.engineer_name}</p></div><time className="text-muted-foreground" dateTime={event.handled_at}>{new Date(event.handled_at).toLocaleString('es-MX')}</time></li>)}</ul>}<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{recognition.total} atenciones en el mes</span><div className="flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Página anterior de reconocimientos" disabled={recognitionLoading || historyPage <= 1} onClick={() => setHistoryPage(value => value - 1)}><ChevronLeft /></Button><span>Página {historyPage} de {recognition.pages}</span><Button variant="outline" size="icon" aria-label="Página siguiente de reconocimientos" disabled={recognitionLoading || historyPage >= recognition.pages} onClick={() => setHistoryPage(value => value + 1)}><ChevronRight /></Button></div></div></section>}
    </Card>
    <Card className="gap-5 border-[#e8ddcc] p-5 sm:p-6" aria-busy={loading || !matchingRequests}>
      <div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-2"><label htmlFor="assistance-status" className="text-sm font-medium">Estado de la solicitud</label><select id="assistance-status" className="block h-11 max-w-full rounded-lg border bg-card px-3 text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="Solicitada">Pendientes</option><option value="Atendida">Atendidas</option><option value="">Todas</option></select></div><Button variant="outline" onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw />Actualizar solicitudes</Button></div>
      {error ? <p role="alert" className="rounded-lg border border-[#d4e4d9] bg-[#edf5ee] p-4 text-sm text-[#1e5b4f]">{error}</p> : !matchingRequests ? <div role="status" aria-label="Cargando solicitudes" className="grid gap-4 lg:grid-cols-2"><span className="sr-only">Cargando solicitudes…</span>{[0, 1].map(index => <div key={index} aria-hidden="true" className="min-h-48 space-y-5 rounded-xl border p-4">{['w-1/3', 'w-3/4', 'w-1/2', 'w-2/3'].map(width => <span key={width} className={`records-skeleton-line block h-3 rounded-full bg-[#eee5d7] ${width}`} />)}</div>)}</div> : !requests.length ? <p className="py-6 text-center text-sm text-muted-foreground">No hay solicitudes en este estado.</p> : <div className="grid gap-4 lg:grid-cols-2">{requests.map(request => <article key={request.id} data-assistance-id={request.id} className="min-w-0 space-y-4 rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><span className="flex items-center gap-2 text-sm font-medium text-[#1e5b4f]"><Wifi className="size-4" />Internet para paciente</span><Badge variant="outline" className="border-[#d4e4d9] bg-[#edf5ee] text-[#1e5b4f]">{request.status}</Badge></div>
        <h2 className="font-bold break-words text-[#611232]">{request.patient_name}</h2>
        <dl className="space-y-2 text-xs leading-relaxed text-muted-foreground"><div><dt className="inline font-medium">Folio: </dt><dd className="inline">RT-{String(request.record_id).padStart(4, '0')}</dd></div><div><dt className="inline font-medium">Día de atención: </dt><dd className="inline">{new Date(`${request.date}T12:00:00`).toLocaleDateString('es-MX')}</dd></div><div><dt className="inline font-medium">Solicitó: </dt><dd className="inline break-words">{request.requester_name}</dd></div><div><dt className="inline font-medium">Solicitud: </dt><dd className="inline"><time dateTime={request.requested_at}>{new Date(request.requested_at).toLocaleString('es-MX')}</time>{request.status === 'Solicitada' && <strong className="ml-2 text-[#8a3518]">Pendiente {elapsedLabel(request.requested_at, now)}</strong>}</dd></div><div><dt className="inline font-medium">Asignada a: </dt><dd className="inline">{request.assigned_name || 'Sin asignar'}</dd></div>{request.handled_at && <div><dt className="inline font-medium">Atendida: </dt><dd className="inline break-words">{new Date(request.handled_at).toLocaleString('es-MX')} · {request.engineer_name || 'Redes'}</dd></div>}</dl>
        {request.status === 'Solicitada' && can(user, 'networks.update') && <div className="space-y-3 border-t pt-3"><label className="block space-y-1.5 text-xs font-medium text-[#611232]" htmlFor={`assignee-${request.id}`}>Responsable de Redes<select id={`assignee-${request.id}`} aria-label={`Asignar solicitud RT-${String(request.record_id).padStart(4, '0')}`} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm font-normal text-foreground" value={request.assigned_to ?? ''} disabled={loading || busy !== null} onChange={event => assign(request.id, event.target.value ? Number(event.target.value) : null)}><option value="">Sin asignar</option>{assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><Button className="h-11 w-full bg-[#1e5b4f] hover:bg-[#002f2a]" disabled={loading || busy !== null} onClick={() => complete(request.id)}>{busy === request.id ? <LoaderCircle className="animate-spin" /> : <Check />}Marcar como atendida</Button></div>}
      </article>)}</div>}
      {loading && matchingRequests && !error && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Actualizando solicitudes…</p>}
      {matchingRequests && !error && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"><span>{total} solicitudes</span><div className="flex items-center gap-3"><Button variant="outline" size="icon" aria-label="Página anterior de solicitudes" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft /></Button><span>Página {page} de {pages}</span><Button variant="outline" size="icon" aria-label="Página siguiente de solicitudes" disabled={loading || page >= pages} onClick={() => setPage(value => value + 1)}><ChevronRight /></Button></div></div>}
    </Card>
  </section>;
}
