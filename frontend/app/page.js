'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from 'cn';
import { Activity, ArrowDownToLine, ArrowRight, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Clock3, Eye, EyeOff, Hand, Wifi, LoaderCircle, LockKeyhole, LogIn, Pencil, Plus, Printer, ShieldCheck, Stethoscope, Trash2, UserRound, Users } from 'lucide-react';
import AuditPanel from '@/components/audit-panel';
import InstitutionalNavigation from '@/components/institutional-navigation';
import RowActionMenu from '@/components/row-action-menu';
import Silk from '@/components/Silk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Modal from '@/components/app-modal';
import UsersPanel from '@/components/users-panel';
import NetworksPanel from '@/components/networks-panel';
import { notifyNetworkRequest } from '@/components/notifications';
import { notifySuccess, notifyError } from '@/lib/notifications';
import RecordFilters from '@/components/record-filters';
import EntitlementSelect from '@/components/entitlement-select';
import { entitlementLabel } from '../../shared/entitlement-types.mjs';
import { reportHtml } from '@/lib/record-report.mjs';
import { periodSelection, dateParams } from '@/lib/record-filters.mjs';
import { api, can } from '@/lib/api';
import { Table, Thead, Tbody, Tr, Th, Td } from 'react-super-responsive-table';

const STATES = [
  { value: 'Pendiente', label: 'En espera', className: 'border-[#e7d7af] bg-[#fbf3dd] text-[#88651b]' },
  { value: 'En proceso', label: 'En tratamiento', className: 'border-[#ead0db] bg-[#f8edf1] text-primary' },
  { value: 'Completada', label: 'Atendido', className: 'border-[#d4e4d9] bg-[#edf5ee] text-[#1e5b4f]' }
];
const SURGERY_TYPES = ['Hospitalizado', 'Ambulatorio'];
const blankStats = { total: 0, pending: 0, inProgress: 0, completed: 0 };
const controlClass = 'h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base text-foreground shadow-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 md:text-sm';
const formatDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const weekday = date => new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long' });
const folio = id => `RT-${String(id).padStart(4, '0')}`;
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function currentTime() { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
const patientLabel = record => record.patient_name || 'Registro anterior sin paciente';
const initialRecord = date => ({ patient_name: '', rfc: '', surgery_type: '', entitlement_type: '', date: date || today(), arrival_time: '', arrived_at: null, treatment_time: '', status: 'Pendiente', observations: '' });
function waitingTime(record, now) {
  if (!record.arrived_at || record.status === 'Completada') return null;
  const started = record.treatment_started_at ? Date.parse(record.treatment_started_at) : null;
  const elapsed = Math.max(0, Math.floor(((Number.isFinite(started) ? started : now) - Date.parse(record.arrived_at)) / 60000));
  const duration = elapsed < 60 ? `${elapsed} min` : `${Math.floor(elapsed / 60)} h ${elapsed % 60} min`;
  return record.treatment_started_at ? `Esperó ${duration}` : `${duration} esperando`;
}
function scheduleState(record, now) {
  if (!record.patient_name || !record.treatment_time || record.status === 'Completada') return null;
  const scheduled = new Date(`${record.date}T${record.treatment_time}:00`).getTime();
  if (!Number.isFinite(scheduled)) return null;
  const difference = Math.floor((now - scheduled) / 60000);
  if (record.status === 'En proceso') return { label: 'Tratamiento en curso', style: 'text-[#611232] bg-[#f8edf1]' };
  if (difference >= 0) return { label: `Horario vencido ${Math.floor(difference / 60)} h ${difference % 60} min`, style: 'text-[#8a3518] bg-[#fff1e8]' };
  if (difference >= -30) return { label: `Próximo en ${Math.abs(difference)} min`, style: 'text-[#1e5b4f] bg-[#edf5ee]' };
  return null;
}


function Brand({ light = false }) {
  return <div className="flex items-center gap-3"><span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl border', light ? 'border-[#e6d19445] bg-white/5 text-[#e6d194]' : 'border-[#ead9bc] bg-[#fbf3e8] text-primary')}><Stethoscope className="size-6" strokeWidth={1.6} /></span><div><strong className={cn('block text-xl font-bold tracking-tight', light ? 'text-white' : 'text-[#611232]')}>Radioterapia</strong><small className={cn('mt-1 block text-[8px] tracking-[.16em]', light ? 'text-[#e6d6c5]' : 'text-muted-foreground')}>BITÁCORA DE PACIENTES</small></div></div>;
}
function StatusBadge({ status }) {
  const state = STATES.find(item => item.value === status) || STATES[0];
  return <Badge variant="outline" className={cn('gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium', state.className)}><span className="size-1 rounded-full bg-current" />{state.label}</Badge>;
}
function StatusJourney({ status }) {
  const current = Math.max(0, STATES.findIndex(state => state.value === status));
  const steps = [
    { value: 'Pendiente', label: 'En espera', hint: 'Llegada registrada', Icon: Clock3 },
    { value: 'En proceso', label: 'En tratamiento', hint: 'Atención en curso', Icon: Stethoscope },
    { value: 'Completada', label: 'Atendido', hint: 'Atención concluida', Icon: CheckCheck }
  ];
  return <div aria-label={`Progreso de atención: ${steps[current].label}`} className="relative grid grid-cols-3 gap-2 py-2">
    <div aria-hidden="true" className="status-journey-rail"><div className="status-journey-progress" style={{ width: `${current * 50}%` }} /></div>
    {steps.map(({ value, label, hint, Icon }, index) => <div key={value} aria-current={current === index ? 'step' : undefined} className={cn('relative z-10 flex min-w-0 flex-col items-center gap-2 text-center', index <= current ? 'text-[#1e5b4f]' : 'text-muted-foreground')}>
      <span className={cn('flex size-8 items-center justify-center rounded-full border-2 bg-card', index <= current ? 'border-[#1e5b4f]' : 'border-[#e9e1d4]')}><Icon className="size-4" /></span>
      <span className="text-xs font-semibold leading-tight">{label}</span><span className="text-[10px] leading-tight text-muted-foreground">{hint}</span>
    </div>)}
  </div>;
}
function RecordTime({ value }) { return <span className={cn('font-medium tabular-nums', value ? 'text-[#611232]' : 'text-muted-foreground')}>{value || 'Sin registrar'}</span>; }
function Notice({ children }) { return <p role="alert" className="rounded-lg border border-[#d4e4d9] bg-[#edf5ee] p-3 text-sm leading-relaxed text-[#1e5b4f]">{children}</p>; }

function Login({ onLogin }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { onLogin((await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })).user); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="grid min-h-dvh bg-[#faf7ed] md:grid-cols-[1.08fr_1fr]">
    <section data-testid="login-brand-panel" className="relative hidden overflow-hidden border-t-4 border-[#a57f2c] bg-[radial-gradient(ellipse_at_5%_5%,#9b224745,transparent_55%),linear-gradient(145deg,#611232_0%,#4a1028_100%)] p-10 text-white md:flex md:flex-col lg:px-14">
      <Silk color="#9b2247" />
      <div className="relative z-10"><Brand light /></div><div aria-hidden="true" className="pointer-events-none absolute top-[18%] -right-72 size-[610px] rounded-full border border-[#e6d19416] shadow-[0_0_0_46px_#e6d19405,0_0_0_94px_#e6d19404]" />
      <div className="relative z-10 my-auto py-16"><span className="text-[10px] font-bold tracking-[.18em] text-[#e6d194]">LLEGADA. ATENCIÓN. SEGUIMIENTO.</span><h1 className="mt-7 mb-6 text-4xl leading-[1.17] font-bold tracking-[-.035em] lg:text-[56px]">Cada paciente,<br />a su <span className="text-[#e6d194]">tiempo.</span></h1><p className="max-w-[400px] text-sm leading-8 text-[#ead7de]">Registra la llegada de cada paciente y consulta su horario programado de radioterapia en un solo lugar.</p><div className="my-8 h-0.5 w-14 bg-[#e6d194]" /><div className="space-y-5 text-sm text-[#f0e1e6]"><p className="flex items-center gap-3"><Users className="size-5 text-[#e6d194]" />Identifica al paciente</p><p className="flex items-center gap-3"><LogIn className="size-5 text-[#e6d194]" />Registra su hora de llegada</p><p className="flex items-center gap-3"><Clock3 className="size-5 text-[#e6d194]" />Consulta su hora de tratamiento</p></div></div>
      <footer className="relative flex justify-between gap-4 text-[9px] tracking-wider text-[#d6bcc5]"><span>SERVICIO DE RADIOTERAPIA</span><span>REGISTRO Y SEGUIMIENTO</span></footer>
    </section>
    <section className="relative flex min-h-dvh items-center justify-center overflow-hidden border-t-4 border-[#611232] bg-[radial-gradient(ellipse_at_90%_8%,#e6d19470,transparent_48%),radial-gradient(ellipse_at_8%_95%,#e6d19440,transparent_45%)] px-5 pt-10 pb-20 md:border-t-0 md:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(#a57f2c19_0.8px,transparent_0.8px)] [background-size:18px_18px] [mask-image:linear-gradient(140deg,#000,transparent_65%)]" />
      <Card className="relative w-full max-w-[430px] gap-0 rounded-2xl border-[#e9dbc1] border-t-[3px] border-t-[#a57f2c] bg-[#fffefaef] p-6 shadow-[0_18px_60px_#a57f2c10] sm:p-9">
        <div className="mb-8 md:hidden"><Brand /></div><span className="text-[9px] font-bold tracking-[.14em] text-[#86651e]">BIENVENIDO AL SERVICIO DE RADIOTERAPIA</span><h2 className="mt-4 text-3xl font-bold tracking-tight text-[#611232]">Iniciar sesión</h2><p className="mt-2 text-sm text-muted-foreground">Ingresa tus credenciales para continuar.</p>
        <form onSubmit={submit} className="mt-7 space-y-5"><div className="space-y-2"><Label htmlFor="email">Correo electrónico</Label><div className="relative"><UserRound className="pointer-events-none absolute top-4 left-3 size-4 text-[#9b7c61]" /><Input id="email" type="email" autoComplete="username" className="h-12 rounded-lg bg-[#fffcf5] pl-10" placeholder="nombre@institucion.gob.mx" required maxLength={200} value={email} onChange={e => setEmail(e.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="password">Contraseña</Label><div className="relative"><LockKeyhole className="pointer-events-none absolute top-4 left-3 size-4 text-[#9b7c61]" /><Input id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" className="h-12 rounded-lg bg-[#fffcf5] pr-11 pl-10" placeholder="Tu contraseña" required maxLength={200} value={password} onChange={e => setPassword(e.target.value)} /><Button type="button" variant="ghost" size="icon" className="absolute top-1.5 right-1.5 text-muted-foreground" onClick={() => setVisible(!visible)} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{visible ? <EyeOff /> : <Eye />}</Button></div></div>{error && <Notice>{error}</Notice>}<Button className="h-12 w-full justify-between rounded-lg font-bold" disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" />Iniciando sesión…</> : <>Entrar al sistema<ArrowRight /></>}</Button></form><p className="mt-6 flex items-center justify-center gap-2 text-[10px] text-muted-foreground"><ShieldCheck className="size-4 text-[#a57f2c]" />Acceso para personal autorizado.</p>
      </Card><footer className="absolute right-0 bottom-6 left-0 text-center text-[10px] text-[#88745a]">Radioterapia <span className="mx-2">·</span> Bitácora de pacientes</footer>
    </section>
  </main>;
}
function Field({ id, label, required, children, hint }) { return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}{required && ' *'}</Label>{children}{hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}</div>; }
function RecordForm({ record, date, onClose, onSaved, ...modalProps }) {
  const [form, setForm] = useState(record ? { patient_name: record.patient_name || '', rfc: record.rfc || '', surgery_type: record.surgery_type || '', entitlement_type: record.entitlement_type || '', date: record.date, arrival_time: record.arrival_time || '', arrived_at: record.arrived_at || null, treatment_time: record.treatment_time || '', status: record.status, observations: record.observations } : initialRecord(date));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submitting = useRef(false);
  const update = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    if (submitting.current || modalProps.open === false) return;
    submitting.current = true; setBusy(true); setError('');
    try { const result = await api(record ? `/records/${record.id}` : '/records', { method: record ? 'PUT' : 'POST', body: JSON.stringify(form) }); onSaved(record ? 'Registro actualizado correctamente.' : 'Paciente registrado correctamente.', result.record); }
    catch (e) { submitting.current = false; setError(e.message); setBusy(false); }
  }
  return <Modal {...modalProps} title={record ? 'Editar registro' : 'Registrar paciente'} eyebrow={record ? folio(record.id) : 'BITÁCORA DE RADIOTERAPIA'} onClose={() => !busy && onClose()} wide>
    <form onSubmit={submit} aria-busy={busy} className="space-y-5 p-5 sm:p-6"><p className="text-sm leading-relaxed text-muted-foreground">Registra la llegada y el horario programado de tratamiento. Los campos con * son obligatorios.</p>{record && !record.patient_name && <div className="rounded-lg border border-[#eadbb6] bg-[#faf3df] p-3 text-sm text-[#81631e]">Este registro fue creado antes de la bitácora de radioterapia. Completa los datos del paciente; la información anterior se conservará.</div>}
      <Field id="patient_name" label="Nombre del paciente" required><Input id="patient_name" name="patient_name" className={controlClass} placeholder="Nombre completo del paciente" required minLength={2} maxLength={150} autoComplete="off" autoFocus value={form.patient_name} onChange={update} /></Field>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="rfc" label="RFC" hint="Opcional, con homoclave (12 o 13 caracteres)."><Input id="rfc" name="rfc" className={controlClass} placeholder="Ej. LOHM900101AB1" maxLength={13} pattern="[A-ZÑ&amp;]{3,4}[0-9]{6}[A-Z0-9]{3}" title="RFC de 12 o 13 caracteres con homoclave" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={form.rfc} onChange={event => setForm(previous => ({ ...previous, rfc: event.target.value.toUpperCase() }))} /></Field>
        <Field id="surgery_type" label="Tipo de cirugía" hint="Campo opcional."><select id="surgery_type" name="surgery_type" className={controlClass} value={form.surgery_type} onChange={update}><option value="">Sin registrar</option>{SURGERY_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></Field>
      </div>
      <Field id="entitlement_type" label="Tipo de derechohabiencia"><EntitlementSelect id="entitlement_type" value={form.entitlement_type} onChange={value => setForm(previous => ({ ...previous, entitlement_type: value }))} /></Field>
      <Field id="date" label="Día y fecha de atención" required hint={form.date ? formatDate(form.date) : 'Selecciona el día de atención.'}><Input id="date" name="date" className={controlClass} type="date" required min="1900-01-01" max="2100-12-31" value={form.date} onChange={update} /></Field>
      <div className="grid grid-cols-1 gap-5 min-[380px]:grid-cols-2"><Field id="arrival_time" label="Hora de llegada" hint={form.arrived_at ? `Llegada registrada: ${new Date(form.arrived_at).toLocaleString('es-MX')}.` : 'Al registrar al paciente, pulsa «Registrar llegada» cuando llegue.'}><Input id="arrival_time" name="arrival_time" type="time" step={60} className={controlClass} value={form.arrival_time} readOnly aria-readonly="true" placeholder="Pendiente de llegada" /></Field><Field id="treatment_time" label="Hora programada de tratamiento" required hint="Horario previsto para su tratamiento."><Input id="treatment_time" name="treatment_time" type="time" step={60} required className={controlClass} value={form.treatment_time} onChange={update} /></Field></div>
      <p className="-mt-2 text-xs text-muted-foreground">Las horas se guardan en formato de 24 horas. Si el paciente llegó tarde, puedes conservar la hora programada original.</p>
      <Field id="status" label="Estado de atención" required><select id="status" name="status" className={controlClass} value={form.status} onChange={update}>{STATES.map(state => <option key={state.value} value={state.value} disabled={state.value !== 'Pendiente' && !form.arrived_at}>{state.label}</option>)}</select></Field>
      <Field id="observations" label="Observaciones" hint="Campo opcional."><Textarea id="observations" name="observations" className="min-h-24 resize-y rounded-lg bg-card" rows={3} placeholder="Información adicional sobre el registro…" maxLength={3000} value={form.observations} onChange={update} /></Field>{error && <Notice>{error}</Notice>}
      <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-3 border-t bg-card py-4"><Button type="button" variant="outline" className="h-11 rounded-lg" onClick={onClose} disabled={busy}>Cancelar</Button><Button className="h-11 rounded-lg" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />}{busy ? 'Guardando…' : record ? 'Guardar cambios' : 'Guardar registro'}</Button></div>
    </form>
  </Modal>;
}
function RecordDetail({ record, onClose, onEdit, onAdvance, advancing, user, ...modalProps }) {
  return <Modal {...modalProps} title="Detalle del registro" eyebrow={folio(record.id)} onClose={onClose} wide><div className="space-y-5 p-5 sm:p-6"><StatusBadge status={record.status} /><StatusJourney status={record.status} /><h3 className="text-xl leading-snug font-bold break-words text-[#611232]">{patientLabel(record)}</h3><dl className="grid grid-cols-1 gap-5 rounded-xl border border-[#eee1c6] bg-[#faf4e6] p-5 min-[380px]:grid-cols-2">{[['RFC', record.rfc || 'Sin registrar'], ['Tipo de cirugía', record.surgery_type || 'Sin registrar'], ['Tipo de derechohabiencia', entitlementLabel(record.entitlement_type)], ['Día y fecha de atención', formatDate(record.date)], ['Registrado por', record.author], ['Hora de llegada', record.arrival_time || 'Sin registrar'], ['Tratamiento programado', record.treatment_time || 'Sin registrar'], ['Llegada registrada', record.arrived_at ? new Date(record.arrived_at).toLocaleString('es-MX') : 'Sin registrar'], ['Inicio real del tratamiento', record.treatment_started_at ? new Date(record.treatment_started_at).toLocaleString('es-MX') : 'Sin registrar'], ['Fin real del tratamiento', record.treatment_completed_at ? new Date(record.treatment_completed_at).toLocaleString('es-MX') : 'Sin registrar']].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-sm font-medium break-words text-[#611232]">{value}</dd></div>)}</dl><div><h4 className="mb-2 text-sm font-bold text-[#611232]">Observaciones</h4><p className="text-sm leading-7 whitespace-pre-wrap break-words text-muted-foreground">{record.observations || 'Sin observaciones adicionales.'}</p></div>
    {record.description && <div className="rounded-lg border bg-muted/50 p-4"><h4 className="text-sm font-medium">Información del registro anterior</h4><p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">{record.title}<br />{record.area} · {record.responsible}<br />{record.description}</p></div>}
    <p className="text-xs leading-6 text-muted-foreground">Registrado: {new Date(record.created_at).toLocaleString('es-MX')}<br />Última actualización: {new Date(record.updated_at).toLocaleString('es-MX')}</p><div className="flex flex-wrap justify-end gap-3 border-t pt-5"><Button variant="outline" onClick={onClose}>Cerrar</Button>{can(user, 'radiotherapy.update') && record.status !== 'Completada' && <Button className="bg-[#1e5b4f] hover:bg-[#002f2a]" disabled={advancing || !record.arrived_at || !record.patient_name || !record.arrival_time || !record.treatment_time} title={record.arrived_at && record.patient_name && record.arrival_time && record.treatment_time ? undefined : 'Registra la llegada y completa los horarios para avanzar'} onClick={() => onAdvance(record)}>{advancing ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}Siguiente: {record.status === 'Pendiente' ? 'En tratamiento' : 'Atendido'}</Button>}{can(user, 'radiotherapy.update') && <Button onClick={onEdit}><Pencil />Editar registro</Button>}</div></div></Modal>;
}
function DeleteDialog({ record, onClose, onDeleted, ...modalProps }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function remove() { setBusy(true); try { await api(`/records/${record.id}`, { method: 'DELETE' }); onDeleted('Registro eliminado.'); } catch (e) { setError(e.message); setBusy(false); } }
  return <Modal {...modalProps} title="Eliminar registro" eyebrow={folio(record.id)} onClose={() => !busy && onClose()}><div className="space-y-4 p-5 sm:p-6"><span className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary"><Trash2 className="size-6" /></span><p className="text-sm leading-relaxed">Vas a eliminar el registro de <strong className="break-words">{patientLabel(record)}</strong>, con fecha {formatDate(record.date)}.</p><p className="text-sm text-muted-foreground">Esta acción es permanente.</p>{error && <Notice>{error}</Notice>}<div className="flex flex-wrap justify-end gap-3 border-t pt-5"><Button variant="outline" onClick={onClose} disabled={busy} autoFocus>Conservar registro</Button><Button variant="destructive" onClick={remove} disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}Sí, eliminar</Button></div></div></Modal>;
}
function Account({ user, onClose, notify, ...modalProps }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (form.get('newPassword') !== form.get('confirmPassword')) return setError('Las contraseñas nuevas no coinciden.');
    setBusy(true); setError('');
    try { await api('/auth/password', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }); notify('Contraseña actualizada correctamente.'); onClose(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Modal {...modalProps} title="Mi cuenta" eyebrow="ACCESO AL SISTEMA" onClose={() => !busy && onClose()}><form onSubmit={submit} className="space-y-5 p-5 sm:p-6"><div className="border-b pb-5"><strong>{user.name}</strong><p className="mt-1 text-sm break-words text-muted-foreground">{user.email}</p></div><h3 className="font-bold text-[#611232]">Cambiar contraseña</h3><Field id="currentPassword" label="Contraseña actual"><Input id="currentPassword" name="currentPassword" className={controlClass} type="password" autoComplete="current-password" required maxLength={200} /></Field><Field id="newPassword" label="Nueva contraseña" hint="Utiliza al menos 12 caracteres."><Input id="newPassword" name="newPassword" className={controlClass} type="password" autoComplete="new-password" minLength={12} maxLength={200} required /></Field><Field id="confirmPassword" label="Confirmar nueva contraseña"><Input id="confirmPassword" name="confirmPassword" className={controlClass} type="password" autoComplete="new-password" minLength={12} maxLength={200} required /></Field>{error && <Notice>{error}</Notice>}<div className="flex justify-end gap-3 border-t pt-5"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cerrar</Button><Button disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}Actualizar contraseña</Button></div></form></Modal>;
}
function RecordActions({ record, onAction, user, onRequested, onArrived, refreshing }) {
  const [busy, setBusy] = useState(null);
  const operation = useRef(false);
  useEffect(() => {
    if ((busy === 'arrival' && record.arrived_at) || (busy === 'internet' && record.assistance_requested_at)) { operation.current = false; setBusy(null); }
  }, [busy, record.arrived_at, record.assistance_requested_at]);
  async function mutate(type) {
    if (operation.current || refreshing || !record.patient_name || (type === 'arrival' ? record.arrived_at : !record.arrived_at || record.assistance_requested_at)) return;
    operation.current = true; setBusy(type);
    try {
      if (type === 'arrival') {
        if (!await onArrived()) { operation.current = false; setBusy(null); }
      } else {
        await api(`/records/${record.id}/network-assistance`, { method: 'POST', body: '{}' });
        notifyNetworkRequest(); onRequested();
      }
    } catch (e) { operation.current = false; setBusy(null); notifyError(e.message); }
  }
  const items = [{ key: 'detail', label: 'Ver detalle', icon: Eye, onSelect: () => onAction('detail', record) }];
  if (can(user, 'radiotherapy.update')) items.push({ key: 'edit', label: 'Editar registro', icon: Pencil, onSelect: () => onAction('form', record) });
  if (can(user, 'radiotherapy.arrive')) items.push({ key: 'arrival', label: 'Registrar llegada', icon: Check, disabled: Boolean(record.arrived_at || !record.patient_name), hint: record.arrived_at ? 'Esta llegada ya está registrada.' : !record.patient_name ? 'Completa los datos del paciente.' : undefined, onSelect: () => mutate('arrival') });
  if (can(user, 'radiotherapy.assist')) items.push({ key: 'internet', label: 'Solicitar internet', icon: Wifi, disabled: Boolean(record.assistance_requested_at || !record.arrived_at || !record.patient_name), hint: record.assistance_requested_at ? 'Ya hay una solicitud pendiente.' : !record.arrived_at ? 'Registra primero la llegada.' : undefined, onSelect: () => mutate('internet') });
  if (can(user, 'radiotherapy.delete')) items.push({ key: 'delete', label: 'Eliminar registro', icon: Trash2, destructive: true, onSelect: () => onAction('delete', record) });
  return <div className="flex justify-end"><RowActionMenu label={`Acciones ${folio(record.id)}`} caption={folio(record.id)} items={items} disabled={refreshing} busy={busy !== null} /></div>;
}
function StatusControl({ record, user, onAdvance, advancing }) {
  const next = STATES[STATES.findIndex(state => state.value === record.status) + 1];
  const ready = Boolean(record.arrived_at && record.patient_name && record.arrival_time && record.treatment_time);
  return <div className="flex items-center gap-1.5"><StatusBadge status={record.status} />{next && can(user, 'radiotherapy.update') && <Button variant="ghost" size="icon-sm" className="text-[#1e5b4f] hover:bg-[#edf5ee]" title={ready ? `Avanzar a ${next.label}` : 'Registra primero la llegada del paciente'} aria-label={`Avanzar estado a ${next.label} ${folio(record.id)}`} disabled={advancing || !ready} onClick={event => { event.stopPropagation(); onAdvance(record); }}>{advancing ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}</Button>}</div>;
}

function RecordsSkeleton() {
  return <div role="status" aria-label="Cargando pacientes" data-testid="records-skeleton" className="min-h-72 border-t p-5 sm:p-6">
    <span className="sr-only">Cargando pacientes…</span>
    <div aria-hidden="true" className="grid gap-4 sm:gap-0">{[0, 1, 2, 3].map(index => <div key={index} className="grid gap-3 rounded-xl border border-[#eee5d7] p-4 sm:grid-cols-[1fr_2fr_1fr_1fr] sm:rounded-none sm:border-x-0 sm:border-t-0 sm:py-5">
      {[0, 1, 2, 3].map(column => <span key={column} className={cn('records-skeleton-line block h-3 rounded-full bg-[#eee5d7]', column === 1 ? 'w-4/5' : 'w-2/3')} />)}
    </div>)}</div>
  </div>;
}

export default function Page() {
  const [user, setUser] = useState(null), [checking, setChecking] = useState(true);
  const [clock, setClock] = useState(Date.now());
  const [view, setView] = useState('records'), [mobileOpen, setMobileOpen] = useState(false);
  const [records, setRecords] = useState([]), [stats, setStats] = useState(blankStats);
  const [query, setQuery] = useState(''), [debouncedQuery, setDebouncedQuery] = useState(''), [status, setStatus] = useState(''), [selection, setSelection] = useState(() => periodSelection('today'));
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [modal, setModal] = useState(null), [exporting, setExporting] = useState(false), [printing, setPrinting] = useState(false), [loggingOut, setLoggingOut] = useState(false), [advancing, setAdvancing] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const lastRecordsQuery = useRef(null), lastRecordsRevision = useRef(null), modalSequence = useRef(0);
  const recordsParams = new URLSearchParams({ q: view === 'overview' ? '' : debouncedQuery, status: view === 'overview' ? '' : status, ...dateParams(selection), page: String(view === 'overview' ? 1 : page) });
  const recordsKey = `${user?.id}:${view}:${recordsParams}`;
  const matchingRecords = lastRecordsQuery.current === recordsKey;
  const replacingRecords = !matchingRecords;
  const date = selection.date;
  const filtered = Boolean(query.trim() || status);
  const searchPending = query !== debouncedQuery;
  useEffect(() => {
    if (!user) return undefined;
    let timer, lastActivity = Date.now(), lastPing = lastActivity;
    const lockSession = () => { setUser(null); setModal(null); lastRecordsQuery.current = null; lastRecordsRevision.current = null; setFeedback(null); setRecords([]); setStats(blankStats); setError(''); };
    const resetIdleTimer = () => {
      lastActivity = Date.now(); clearTimeout(timer); timer = setTimeout(lockSession, 5 * 60 * 1000);
      if (lastActivity - lastPing >= 60000) { lastPing = lastActivity; api('/auth/activity', { method: 'POST' }).catch(() => {}); }
    };
    const checkAfterVisibility = () => { if (document.visibilityState === 'visible' && Date.now() - lastActivity >= 5 * 60 * 1000) lockSession(); };
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(event => window.addEventListener(event, resetIdleTimer, { passive: true }));
    document.addEventListener('visibilitychange', checkAfterVisibility);
    resetIdleTimer();
    return () => { clearTimeout(timer); activityEvents.forEach(event => window.removeEventListener(event, resetIdleTimer)); document.removeEventListener('visibilitychange', checkAfterVisibility); };
  }, [user]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const refresh = () => api('/auth/me').then(({ user: next }) => {
      setUser(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setView(previous => {
        if (previous === 'audit' && next.is_admin) return previous;
        if (previous === 'users' && can(next, 'users.read')) return previous;
        if (previous === 'networks' && can(next, 'networks.read')) return previous;
        if (!['users', 'networks', 'audit'].includes(previous) && can(next, 'radiotherapy.read')) return previous === 'none' ? 'records' : previous;
        return can(next, 'radiotherapy.read') ? 'records' : can(next, 'networks.read') ? 'networks' : can(next, 'users.read') ? 'users' : 'none';
      });
      if (!can(next, 'radiotherapy.read')) { lastRecordsQuery.current = null; lastRecordsRevision.current = null; setFeedback(null); setRecords([]); setStats(blankStats); }
    }).catch(() => {}).finally(() => setChecking(false));
    refresh();
    const expire = () => { setUser(null); setModal(null); lastRecordsQuery.current = null; lastRecordsRevision.current = null; setFeedback(null); setRecords([]); setStats(blankStats); };
    const permissionsChanged = () => { setModal(null); refresh(); };
    window.addEventListener('session-expired', expire);
    window.addEventListener('permissions-changed', permissionsChanged);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('session-expired', expire);
      window.removeEventListener('permissions-changed', permissionsChanged);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => { const timer = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!user || !can(user, 'radiotherapy.read') || ['users', 'networks', 'audit'].includes(view)) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    api(`/records?${recordsParams}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      if (view !== 'overview' && page > data.pages) { setPage(data.pages); return; }
      lastRecordsQuery.current = recordsKey; lastRecordsRevision.current = revision;
      setRecords(data.records); setStats(data.stats); setTotal(data.total); setPages(data.pages);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user, view, debouncedQuery, status, selection, page, revision]);
  useEffect(() => {
    if (!feedback || loading || !matchingRecords || lastRecordsRevision.current !== revision) return;
    if (!records.some(record => record.id === feedback.id)) { setFeedback(null); return; }
    const timer = setTimeout(() => setFeedback(null), 1800);
    return () => clearTimeout(timer);
  }, [feedback, loading, matchingRecords, records, revision]);
  const openRecord = (type, record) => { modalSequence.current++; setModal({ type, record, key: modalSequence.current }); };
  const closeModal = () => setModal(previous => previous ? { ...previous, closing: true } : null);
  const finishModalClose = () => setModal(previous => previous?.closing ? null : previous);
  function saved(message, record) { closeModal(); if (record) setFeedback({ id: record.id }); if (record) { setSelection({ period: record.date === today() ? 'today' : 'day', date: record.date, from: '', to: '' }); clearSearch(); } setPage(1); setRevision(value => value + 1); notifySuccess(message); }
  async function advanceStatus(record) {
    const current = STATES.findIndex(state => state.value === record.status);
    const next = STATES[current + 1];
    if (!next || advancing) return;
    setAdvancing(record.id);
    try {
      const updated = await api(`/records/${record.id}`, { method: 'PUT', body: JSON.stringify({ patient_name: record.patient_name, rfc: record.rfc || '', surgery_type: record.surgery_type || '', entitlement_type: record.entitlement_type || '', date: record.date, arrival_time: record.arrival_time, treatment_time: record.treatment_time, status: next.value, observations: record.observations || '' }) });
      setRevision(value => value + 1);
      setFeedback({ id: record.id });
      setModal(previous => previous?.type === 'detail' && previous.record.id === record.id ? { ...previous, record: updated.record } : previous);
      notifySuccess(`Atención actualizada: ${next.label}.`);
    } catch (e) { notifyError(e.message); } finally { setAdvancing(null); }
  }
  async function recordArrival(record) {
    try {
      const result = await api(`/records/${record.id}/arrival`, { method: 'POST', body: JSON.stringify({ arrival_time: currentTime() }) });
      setRevision(value => value + 1);
      setFeedback({ id: record.id });
      setModal(previous => previous?.type === 'detail' && previous.record.id === record.id ? { ...previous, record: result.record } : previous);
      notifySuccess(result.message);
      return result;
    } catch (e) { notifyError(e.message); return null; }
  }
  function clearSearch() { setQuery(''); setDebouncedQuery(''); setStatus(''); setPage(1); }
  function changePeriod(next) { setSelection(next); setPage(1); }
  function resetFilters() { clearSearch(); changePeriod(periodSelection('today')); }
  function showHistory() { clearSearch(); changePeriod(periodSelection('all')); }
  function navigate(next) { setView(next); setPage(1); setMobileOpen(false); }
  async function logout() { setLoggingOut(true); try { await api('/auth/logout', { method: 'POST' }); setUser(null); setModal(null); lastRecordsQuery.current = null; lastRecordsRevision.current = null; setFeedback(null); setRecords([]); setStats(blankStats); resetFilters(); } catch (e) { notifyError(e.message); } finally { setLoggingOut(false); } }
  async function filteredRows() {
    const rows = []; let next = 1, last = 1;
    do { const data = await api(`/records/export?${new URLSearchParams({ q: debouncedQuery, status, ...dateParams(selection), page: String(next), limit: '100' })}`); rows.push(...data.records); last = data.pages; next++; } while (next <= last);
    return rows;
  }
  async function printReport() {
    const report = window.open('', '_blank');
    if (!report) { notifyError('Permite las ventanas emergentes para abrir el reporte.'); return; }
    report.opener = null;
    report.document.body.textContent = 'Preparando el reporte…';
    setPrinting(true);
    try {
      const rows = await filteredRows();
      if (report.closed) return;
      report.document.open(); report.document.write(reportHtml(rows, { selection, query: debouncedQuery, status })); report.document.close();
      report.document.getElementById('print-report').addEventListener('click', () => report.print());
      report.focus();
      setTimeout(() => { if (!report.closed) report.print(); }, 300);
    } catch (e) { report.close(); notifyError(e.message); } finally { setPrinting(false); }
  }
  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await filteredRows();
      const cell = value => { let text = String(value ?? ''); if (/^\s*[=+@\-]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
      const csv = [['Folio', 'Día', 'Fecha de atención', 'Nombre del paciente', 'RFC', 'Tipo de cirugía', 'Tipo de derechohabiencia', 'Hora de llegada', 'Hora programada de tratamiento', 'Estado de atención', 'Observaciones'], ...rows.map(record => [folio(record.id), weekday(record.date), record.date, record.patient_name || '', record.rfc || '', record.surgery_type || '', entitlementLabel(record.entitlement_type), record.arrival_time || '', record.treatment_time || '', STATES.find(state => state.value === record.status)?.label || record.status, record.observations])].map(row => row.map(cell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `radioterapia-${date || (selection.from ? `${selection.from}-a-${selection.to}` : 'historico')}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notifySuccess(`${rows.length} registros exportados.`);
    } catch (e) { notifyError(e.message); } finally { setExporting(false); }
  }
  if (checking) return <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background"><Brand /><LoaderCircle className="size-6 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Preparando tu espacio de trabajo…</p></main>;
  if (!user) return <Login onLogin={next => { setUser(next); setView(can(next, 'radiotherapy.read') ? 'records' : can(next, 'networks.read') ? 'networks' : can(next, 'users.read') ? 'users' : 'none'); setError(''); }} />;
  const cards = [ { label: 'Registros', value: stats.total, icon: Users, style: 'bg-accent text-primary', caption: 'Según los filtros aplicados' }, { label: 'En espera', value: stats.pending, icon: Clock3, style: 'bg-[#faf0d8] text-[#a57f2c]', caption: 'Pendientes de atención' }, { label: 'En tratamiento', value: stats.inProgress, icon: Stethoscope, style: 'bg-accent text-primary', caption: 'Atención en proceso' }, { label: 'Atendidos', value: stats.completed, icon: CheckCheck, style: 'bg-[#edf4ef] text-[#1e5b4f]', caption: 'Atención registrada' } ];
  return <div className="min-h-dvh bg-[radial-gradient(ellipse_at_95%_0%,#e6d19435,transparent_47%)]">
    <InstitutionalNavigation user={user} view={view} total={stats.total} brand={<Brand light />} mobileOpen={mobileOpen} onMobileChange={setMobileOpen} onNavigate={navigate} onHelp={() => { openRecord('help'); setMobileOpen(false); }} onAccount={() => openRecord('account')} onLogout={logout} loggingOut={loggingOut} />
    <div className="min-w-0 md:ml-64">
      <main key={view} tabIndex={-1} data-testid="workspace-content" data-view={view} className="workspace-enter mx-auto max-w-[1560px] outline-none px-4 py-7 sm:px-6 lg:px-9 lg:py-9">{view === 'audit' && user.is_admin ? <AuditPanel /> : view === 'networks' && can(user, 'networks.read') ? <NetworksPanel user={user} /> : view === 'users' ? <UsersPanel user={user} notify={notifySuccess} onSelfUpdated={setUser} /> : !can(user, 'radiotherapy.read') ? <Card className="p-6"><h1 className="text-2xl font-bold text-primary">Bienvenido, {user.name}</h1><p className="text-sm leading-relaxed text-muted-foreground">Tu cuenta todavía no tiene acceso a ningún módulo. Solicita los permisos al administrador.</p><Button variant="outline" className="w-fit" onClick={() => openRecord('account')}>Mi cuenta</Button></Card> : <><div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><span className="text-[10px] font-bold tracking-[.16em] text-[#86651e]">LLEGADAS Y HORARIOS DE ATENCIÓN</span><h1 className="mt-2 text-[26px] leading-snug font-bold tracking-tight text-[#611232] sm:text-3xl">{view === 'overview' ? 'Resumen de radioterapia' : 'Bitácora de radioterapia'}</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Nombre del paciente, hora de llegada y tratamiento programado, en un solo registro.</p></div>{can(user, 'radiotherapy.create') && <Button className="h-11 w-fit rounded-lg" onClick={() => openRecord('form')}><Plus />Registrar paciente</Button>}</div>
        <RecordFilters key={view} selection={selection} onPeriodChange={changePeriod} query={query} onQueryChange={setQuery} status={status} onStatusChange={next => { setStatus(next); setPage(1); }} states={STATES} overview={view === 'overview'} onReset={resetFilters} loading={loading || (view === 'records' && searchPending)} total={error ? null : total} />
        <section className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Resumen de atención">{cards.map(({ label, value, icon: Icon, style, caption }) => <Card key={label} className="gap-0 rounded-xl border-[#e8ddcc] p-4 shadow-xs sm:p-5"><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', style)}><Icon className="size-4" /></span></div><strong className="my-3 text-3xl font-medium text-[#611232]">{replacingRecords || error ? '—' : value}</strong><small className="text-[10px] leading-relaxed text-muted-foreground sm:text-xs">{caption}</small></Card>)}</section>
        {view === 'overview' && <Card className="mb-6 gap-4 border-[#e8ddcc] p-5 sm:p-6"><div><span className="text-[10px] font-bold tracking-widest text-[#86651e]">SEGUIMIENTO DE ATENCIÓN</span><h2 className="mt-2 text-xl font-bold text-[#611232]">Estado de los registros</h2><p className="mt-2 text-sm text-muted-foreground">{replacingRecords || error ? 'Preparando el resumen…' : stats.total ? `${Math.round(stats.completed / stats.total * 100)}% de los registros están marcados como atendidos.` : 'Registra pacientes para consultar el resumen.'}</p></div><div className="flex h-2.5 overflow-hidden rounded-full bg-muted">{[[stats.pending, 'bg-[#e6d194]'], [stats.inProgress, 'bg-primary'], [stats.completed, 'bg-[#1e5b4f]']].map(([value, color], index) => <span key={index} className={color} style={{ width: `${matchingRecords && !error && stats.total ? value / stats.total * 100 : 0}%` }} />)}</div><div className="flex flex-wrap gap-3">{STATES.map(state => <StatusBadge key={state.value} status={state.value} />)}</div><Button variant="outline" className="mt-1 w-fit" onClick={() => navigate('records')}>Consultar pacientes<ArrowRight /></Button></Card>}
        <Card className="gap-0 overflow-hidden rounded-xl border-[#e8ddcc] py-0 shadow-xs" role="region" aria-label="Registros de radioterapia" aria-busy={loading || replacingRecords}><div className="flex items-start justify-between gap-3 p-5 sm:p-6"><div><h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-[#611232]">{view === 'overview' ? 'Pacientes registrados' : 'Registro de pacientes'}<span role="status" aria-label="Total de registros" data-testid="records-count" className="rounded bg-accent px-2 py-1 text-xs font-medium text-primary">{replacingRecords || error ? '—' : total}</span></h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Ordenados por fecha y hora programada de tratamiento.</p>{loading && matchingRecords && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-[#86651e]"><LoaderCircle className="size-3 animate-spin" />Actualizando pacientes…</p>}</div>{view === 'records' && can(user, 'radiotherapy.export') && <div className="flex shrink-0 flex-wrap justify-end gap-2"><Button variant="outline" className="h-10 shrink-0 rounded-lg px-3 text-xs" title="Exportar CSV" aria-label="Exportar CSV" disabled={exporting || printing || loading || searchPending || !total} onClick={exportCsv}>{exporting ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />}<span className="hidden sm:inline">Exportar CSV</span></Button><Button variant="outline" className="h-10 rounded-lg px-3 text-xs" aria-label="Imprimir / PDF" title="Imprimir o guardar como PDF" disabled={printing || exporting || loading || searchPending || !total} onClick={printReport}>{printing ? <LoaderCircle className="animate-spin" /> : <Printer />}<span className="hidden sm:inline">Imprimir / PDF</span></Button></div>}</div>

          {error ? <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-4 border-t px-5 text-center"><CircleHelp className="size-7 text-primary" /><h3 className="font-bold text-[#611232]">No se pudieron cargar los registros</h3><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Volver a intentar</Button></div> : replacingRecords ? <RecordsSkeleton /> : !records.length ? <div className="flex min-h-72 flex-col items-center justify-center border-t px-5 py-8 text-center"><span className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-[#eddfb9] bg-[#f8efd6] text-[#a57f2c]"><Users className="size-7" /></span><h3 className="text-xl font-medium text-[#611232]">{filtered && view === 'records' ? 'No encontramos coincidencias' : 'Sin pacientes registrados'}</h3><p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">{filtered && view === 'records' ? 'Prueba otro nombre, cambia el estado o amplía el período de consulta.' : selection.period !== 'all' ? 'No hay pacientes en el período seleccionado. Puedes consultar otras fechas o ver todo el historial.' : 'Registra la llegada del primer paciente para comenzar la bitácora.'}</p>{selection.period !== 'all' && <Button variant="outline" className="mt-5" onClick={showHistory}>Ver todo el historial<ArrowRight /></Button>}{(filtered || can(user, 'radiotherapy.create')) && <Button variant="outline" className="mt-5" onClick={() => filtered && view === 'records' ? resetFilters() : openRecord('form')}>{filtered && view === 'records' ? 'Restablecer filtros' : <><Plus />Registrar primer paciente</>}</Button>}</div> : <>
            <div className="@container/patient-table min-w-0 border-t">
              <Table className="radiotherapy-table w-full text-sm" aria-label="Pacientes y horarios de radioterapia">
                <Thead><Tr className="bg-[#f9f2e4]">{['Folio / día y fecha', 'Paciente', 'Tipo de derechohabiencia', 'Llegada', 'Tratamiento programado', 'Estado', 'Acciones'].map(label => <Th key={label} className={cn('h-12 px-4 text-left text-[10px] font-bold tracking-wider text-[#80675e] uppercase', label === 'Acciones' && 'text-right')}>{label}</Th>)}</Tr></Thead>
                <Tbody>{records.map(record => <Tr key={record.id} className="border-b last:border-b-0 hover:bg-[#fdf7ec]" data-record-id={record.id} data-highlighted={feedback?.id === record.id ? 'true' : undefined}>
                  <Td className="w-[175px] cursor-pointer px-4 py-5 align-top" title="Ver ficha del paciente" onClick={() => openRecord('detail', record)}><Button variant="link" className="h-auto p-0 text-xs" onClick={() => openRecord('detail', record)}>{folio(record.id)}</Button><small className="mt-2 block text-[11px] leading-relaxed text-muted-foreground">{formatDate(record.date)}</small></Td>
                  <Td className="max-w-[280px] cursor-pointer px-4 py-5 align-top whitespace-normal" title="Ver ficha del paciente" onClick={() => openRecord('detail', record)}><Button variant="link" className="h-auto max-w-full justify-start p-0 text-left text-sm leading-relaxed whitespace-normal break-words text-[#611232] [overflow-wrap:anywhere]" onClick={() => openRecord('detail', record)}>{patientLabel(record)}</Button><small className="mt-2 block text-[11px] leading-relaxed break-words text-muted-foreground">RFC: {record.rfc || 'Sin registrar'}</small><small className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">Tipo de cirugía: {record.surgery_type || 'Sin registrar'}</small>{record.assistance_requested_at && <small className="mt-2 flex items-center gap-1 text-[11px] text-[#1e5b4f]"><Hand className="size-3 shrink-0" />Asistencia de Redes solicitada</small>}{!record.patient_name && <small className="mt-1 block text-[11px] text-[#916e24]">Datos del paciente por completar</small>}</Td>
                  <Td className="max-w-[200px] cursor-pointer px-4 py-5 align-top whitespace-normal break-words" title="Ver ficha del paciente" onClick={() => openRecord('detail', record)}><span className="text-xs leading-relaxed text-[#611232]">{entitlementLabel(record.entitlement_type)}</span></Td>
                  <Td className="cursor-pointer px-4 py-5 align-top" title="Ver ficha del paciente" onClick={() => openRecord('detail', record)}><RecordTime value={record.arrival_time} />{record.arrived_at && <small className="mt-2 block text-[10px] text-[#1e5b4f]">Llegada registrada</small>}</Td>
                  <Td className="cursor-pointer px-4 py-5 align-top" title="Ver ficha del paciente" onClick={() => openRecord('detail', record)}><RecordTime value={record.treatment_time} /></Td>
                  <Td className="cursor-pointer px-4 py-5 align-top" title="Ver ficha del paciente" onClick={() => openRecord('detail', record)}><StatusControl record={record} user={user} onAdvance={advanceStatus} advancing={advancing === record.id} />{(waitingTime(record, clock) || scheduleState(record, clock)) && <div className="mt-2 flex flex-col items-start gap-1">{waitingTime(record, clock) && <small className="inline-flex items-center gap-1 rounded-md bg-[#faf0d8] px-2 py-1 text-[10px] font-medium text-[#806017]"><Clock3 className="size-3" aria-hidden="true" />{waitingTime(record, clock)}</small>}{scheduleState(record, clock) && <small className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold', scheduleState(record, clock).style)}><Activity className="size-3" aria-hidden="true" />{scheduleState(record, clock).label}</small>}</div>}</Td>
                  <Td className="px-4 py-4 align-top"><RecordActions record={record} onAction={openRecord} user={user} refreshing={loading || searchPending} onRequested={() => setRevision(value => value + 1)} onArrived={() => recordArrival(record)} /></Td>
                </Tr>)}</Tbody>
              </Table>
            </div>
          </>}
          {!error && matchingRecords && <div className="flex flex-col gap-3 border-t px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex flex-wrap items-center gap-3"><span>{total ? `Mostrando ${view === 'overview' ? 1 : (page - 1) * 8 + 1}–${Math.min((view === 'overview' ? 1 : page) * 8, total)} de ${total} registros` : 'Sin registros para mostrar'}</span>{filtered && view === 'records' && <Button variant="link" className="h-auto p-0 text-xs" onClick={resetFilters}>Restablecer filtros</Button>}</div>{view === 'records' && <div className="flex items-center justify-end gap-3"><Button variant="outline" size="icon" className="size-8" aria-label="Página anterior" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button><span>Página <strong className="font-medium text-[#611232]">{page}</strong> de {pages}</span><Button variant="outline" size="icon" className="size-8" aria-label="Página siguiente" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}><ChevronRight /></Button></div>}</div>}
        </Card><footer className="mt-6 flex flex-wrap justify-between gap-3 text-[10px] text-[#9c896e]"><span>Servicio de radioterapia · Bitácora de pacientes</span><span className="hidden sm:inline">Llegadas y horarios, en un solo lugar.</span></footer></>}
      </main>
    </div>
    {modal?.type === 'form' && <RecordForm key={modal.key} open={!modal.closing} onAfterClose={finishModalClose} record={modal.record} date={date} onClose={closeModal} onSaved={saved} />}
    {modal?.type === 'detail' && <RecordDetail key={modal.key} open={!modal.closing} onAfterClose={finishModalClose} record={modal.record} onClose={closeModal} onEdit={() => openRecord('form', modal.record)} onAdvance={advanceStatus} advancing={advancing === modal.record.id} user={user} />}
    {modal?.type === 'delete' && <DeleteDialog key={modal.key} open={!modal.closing} onAfterClose={finishModalClose} record={modal.record} onClose={closeModal} onDeleted={saved} />}
    {modal?.type === 'account' && <Account key={modal.key} open={!modal.closing} onAfterClose={finishModalClose} user={user} onClose={closeModal} notify={notifySuccess} />}
    {modal?.type === 'help' && <Modal key={modal.key} open={!modal.closing} onAfterClose={finishModalClose} title="Guía rápida" eyebrow="BITÁCORA DE RADIOTERAPIA" onClose={closeModal}><div className="space-y-5 p-5 sm:p-6"><ol className="list-decimal space-y-4 pl-5 text-sm leading-7 text-muted-foreground"><li><strong className="text-[#611232]">Registra la llegada.</strong> Captura el nombre del paciente, la fecha, la hora real de llegada y la hora programada de tratamiento.</li><li><strong className="text-[#611232]">Actualiza el estado.</strong> Cambia de “En espera” a “En tratamiento” o “Atendido” cuando corresponda.</li><li><strong className="text-[#611232]">Consulta por día.</strong> Selecciona una fecha, busca al paciente y exporta los resultados a CSV. “Ver todos los días” muestra el historial.</li></ol><p className="rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">Cada registro corresponde a una atención. Un paciente puede tener registros en distintas fechas. La hora programada no representa la hora real de inicio del tratamiento.</p><div className="flex justify-end border-t pt-4"><Button onClick={closeModal}>Entendido<Check /></Button></div></div></Modal>}
  </div>;
}
