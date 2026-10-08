'use client';

import { useEffect, useState } from 'react';
import { cn } from 'cn';
import { Table, Thead, Tbody, Tr, Th, Td } from 'react-super-responsive-table';
import { Check, ChevronLeft, ChevronRight, Eye, LoaderCircle, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Modal from '@/components/app-modal';
import PredictiveSearch from '@/components/predictive-search';
import { api, can } from '@/lib/api';

const selectClass = 'h-11 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus:ring-2 focus:ring-ring/20 md:text-sm';
const ErrorNotice = ({ children }) => <p role="alert" className="rounded-lg border border-[#d4e4d9] bg-[#edf5ee] p-3 text-sm leading-relaxed text-[#1e5b4f]">{children}</p>;
function Permissions({ modules, selected, onChange, admin, actor, disabled = false }) {
  function toggle(module, action, checked) {
    const key = `${module.key}.${action.key}`;
    let next = new Set(selected);
    if (checked) { next.add(key); next.add(`${module.key}.read`); }
    else if (action.key === 'read') next = new Set([...next].filter(value => !value.startsWith(`${module.key}.`)));
    else next.delete(key);
    onChange([...next]);
  }
  return <div className="space-y-3">{modules.map(module => <fieldset key={module.key} className="min-w-0 rounded-xl border bg-background/50 p-4"><legend className="px-1 text-sm font-bold text-[#611232]">{module.label}</legend><div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">{module.actions.map(action => {
    const key = `${module.key}.${action.key}`;
    return <label key={key} className={cn('flex min-h-9 items-center gap-3 text-sm leading-relaxed', (!can(actor, key) || disabled || admin) && 'text-muted-foreground')}><input type="checkbox" className="size-4 shrink-0 accent-primary" checked={admin || selected.includes(key)} disabled={admin || disabled || !can(actor, key)} onChange={event => toggle(module, action, event.target.checked)} />{action.label}</label>;
  })}</div></fieldset>)}</div>;
}
function UserForm({ record, modules, actor, onClose, onSaved }) {
  const [form, setForm] = useState(record ? { ...record, password: '' } : { name: '', email: '', password: '', active: true, is_admin: false, permissions: [] });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const self = record?.id === actor.id;
  const field = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api(record ? `/users/${record.id}` : '/users', { method: record ? 'PUT' : 'POST', body: JSON.stringify({ name: form.name, email: form.email, password: form.password, is_admin: form.is_admin, active: form.active, permissions: form.permissions }) });
      onSaved(record ? 'Usuario actualizado.' : 'Usuario creado.', result.user, Boolean(form.password));
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return <Modal title={record ? 'Editar usuario' : 'Crear usuario'} eyebrow="CUENTAS Y PERMISOS" onClose={() => !busy && onClose()} wide><form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
    <p className="text-sm leading-relaxed text-muted-foreground">Asigna los módulos y las acciones que podrá usar esta persona.</p>
    <div className="space-y-2"><Label htmlFor="user-name">Nombre completo *</Label><Input id="user-name" name="name" className="h-11" required minLength={2} maxLength={100} autoComplete="off" autoFocus value={form.name} onChange={field} /></div>
    <div className="space-y-2"><Label htmlFor="user-email">Correo electrónico *</Label><Input id="user-email" name="email" className="h-11" type="email" required maxLength={200} autoComplete="off" value={form.email} onChange={field} /></div>
    <div className="space-y-2"><Label htmlFor="user-password">{record ? 'Nueva contraseña' : 'Contraseña inicial *'}</Label><Input id="user-password" name="password" className="h-11" type="password" autoComplete="new-password" required={!record} minLength={12} maxLength={200} value={form.password} onChange={field} /><p className="text-xs leading-relaxed text-muted-foreground">{record ? 'Déjala vacía para conservar la actual. Si la cambias, se cerrarán las sesiones de este usuario.' : 'Al menos 12 caracteres. El usuario puede cambiarla desde Mi cuenta.'}</p></div>
    {actor.is_admin && <div className="space-y-2"><Label htmlFor="user-profile">Perfil</Label><select id="user-profile" className={selectClass} disabled={self} value={form.is_admin ? 'admin' : 'custom'} onChange={event => setForm(previous => ({ ...previous, is_admin: event.target.value === 'admin' }))}><option value="custom">Permisos personalizados</option><option value="admin">Administrador</option></select></div>}
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-primary" disabled={self} checked={form.active} onChange={event => setForm(previous => ({ ...previous, active: event.target.checked }))} />Usuario activo</label>
    <div className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-bold text-[#611232]"><ShieldCheck className="size-4 text-[#a57f2c]" />Permisos por módulo</h3><p className="text-xs leading-relaxed text-muted-foreground">{form.is_admin ? 'El administrador tiene acceso a todos los módulos y acciones.' : self ? 'Tus permisos deben ser modificados por otro administrador.' : 'Consultar se activa al seleccionar cualquier acción del módulo. Sin permisos, la cuenta solo podrá acceder a Mi cuenta.'}</p><Permissions modules={modules} selected={form.permissions} admin={form.is_admin} actor={actor} disabled={self} onChange={permissions => setForm(previous => ({ ...previous, permissions }))} /></div>
    {error && <ErrorNotice>{error}</ErrorNotice>}<div className="flex flex-wrap justify-end gap-3 border-t pt-5"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Check />}{record ? 'Guardar usuario' : 'Crear cuenta'}</Button></div>
  </form></Modal>;
}
function DeleteUser({ record, onClose, onSaved }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function remove() { setBusy(true); setError(''); try { await api(`/users/${record.id}`, { method: 'DELETE' }); onSaved('Usuario eliminado.'); } catch (e) { setError(e.message); setBusy(false); } }
  return <Modal title="Eliminar usuario" eyebrow="GESTIÓN DE USUARIOS" onClose={() => !busy && onClose()}><div className="space-y-5 p-5 sm:p-6"><p className="text-sm leading-relaxed">Se eliminará la cuenta de <strong className="break-words">{record.name}</strong> y se cerrarán sus sesiones.</p><p className="text-sm text-muted-foreground">Si tiene registros de radioterapia, desactiva su cuenta desde Editar para conservar el historial.</p>{error && <ErrorNotice>{error}</ErrorNotice>}<div className="flex flex-wrap justify-end gap-3 border-t pt-5"><Button variant="outline" onClick={onClose} disabled={busy} autoFocus>Conservar usuario</Button><Button variant="destructive" onClick={remove} disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}Sí, eliminar usuario</Button></div></div></Modal>;
}
export default function UsersPanel({ user, notify, onSelfUpdated }) {
  const [users, setUsers] = useState([]), [modules, setModules] = useState([]), [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [page, setPage] = useState(1), [pages, setPages] = useState(1), [total, setTotal] = useState(0), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [modal, setModal] = useState(null);
  useEffect(() => { const timer = setTimeout(() => { setSearch(query); setPage(1); }, 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    Promise.all([api(`/users?${new URLSearchParams({ q: search, page: String(page) })}`, { signal: controller.signal }), api('/permissions', { signal: controller.signal })]).then(([data, catalog]) => {
      if (controller.signal.aborted) return;
      if (page > data.pages) { setPage(data.pages); return; }
      setUsers(data.users); setTotal(data.total); setPages(data.pages); setModules(catalog.modules);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, page, revision, user]);
  function saved(message, savedUser, resetPassword) {
    setModal(null); setRevision(previous => previous + 1); notify(message);
    if (savedUser?.id === user.id) { if (resetPassword) window.dispatchEvent(new Event('session-expired')); else onSelfUpdated(savedUser); }
  }
  return <>
    <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><span className="text-[10px] font-bold tracking-[.16em] text-[#86651e]">ACCESO Y PERMISOS</span><h1 className="mt-2 text-3xl font-bold text-[#611232]">Usuarios</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Administra las cuentas y define qué puede hacer cada persona.</p></div>{can(user, 'users.create') && <Button className="h-11 w-fit" disabled={loading || !modules.length} onClick={() => setModal({ type: 'form' })}><Plus />Crear usuario</Button>}</div>
    <Card className="gap-0 border-[#e8ddcc] py-0"><div className="space-y-4 p-5 sm:p-6"><h2 className="flex items-center gap-2 text-base font-bold text-[#611232]"><Users className="size-5 text-[#a57f2c]" />Cuentas registradas<Badge variant="secondary">{total}</Badge></h2><PredictiveSearch label="Buscar usuarios" placeholder="Buscar por nombre o correo…" value={query} onChange={setQuery} endpoint="/users?limit=6" kind="users" /></div>
      {error ? <div className="space-y-4 p-5"><ErrorNotice>{error}</ErrorNotice><Button variant="outline" onClick={() => setRevision(previous => previous + 1)}>Volver a intentar</Button></div> : loading ? <div role="status" className="flex min-h-48 items-center justify-center gap-3 border-t text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" />Cargando usuarios…</div> : !users.length ? <p className="border-t p-8 text-center text-sm text-muted-foreground">No encontramos usuarios con esa búsqueda.</p> : <div className="@container/patient-table min-w-0 border-t"><Table className="radiotherapy-table w-full text-sm" aria-label="Usuarios y permisos"><Thead><Tr className="bg-[#f9f2e4]">{['Nombre', 'Correo', 'Perfil', 'Estado', 'Acciones'].map(label => <Th key={label} className="h-12 px-4 text-left text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{label}</Th>)}</Tr></Thead><Tbody>{users.map(record => {
        const manage = user.is_admin || !record.is_admin;
        return <Tr key={record.id} className="border-b last:border-b-0 hover:bg-background" data-user-id={record.id}><Td className="max-w-60 px-4 py-5"><Button variant="link" className="h-auto max-w-full p-0 text-left whitespace-normal break-words [overflow-wrap:anywhere]" onClick={() => setModal({ type: 'detail', record })}>{record.name}</Button>{record.id === user.id && <small className="mt-1 block text-xs text-muted-foreground">Tu cuenta</small>}</Td><Td className="max-w-64 px-4 py-5 break-all">{record.email}</Td><Td className="px-4 py-5 text-xs">{record.is_admin ? 'Administrador' : 'Personalizado'}</Td><Td className="px-4 py-5"><Badge variant="outline" className={record.active ? 'border-[#d4e4d9] bg-[#edf5ee] text-[#1e5b4f]' : 'bg-muted text-muted-foreground'}>{record.active ? 'Activo' : 'Inactivo'}</Badge></Td><Td className="px-4 py-4"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" className="size-9" aria-label={`Ver usuario ${record.name}`} onClick={() => setModal({ type: 'detail', record })}><Eye /></Button>{can(user, 'users.update') && manage && <Button variant="ghost" size="icon" className="size-9" aria-label={`Editar usuario ${record.name}`} onClick={() => setModal({ type: 'form', record })}><Pencil /></Button>}{can(user, 'users.delete') && manage && record.id !== user.id && <Button variant="ghost" size="icon" className="size-9" aria-label={`Eliminar usuario ${record.name}`} onClick={() => setModal({ type: 'delete', record })}><Trash2 /></Button>}</div></Td></Tr>;
      })}</Tbody></Table></div>}
      {!loading && !error && <div className="flex flex-wrap items-center justify-between gap-3 border-t p-5 text-xs text-muted-foreground"><span>{total} usuarios</span><div className="flex items-center gap-3"><Button variant="outline" size="icon" className="size-8" aria-label="Página anterior de usuarios" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button><span>Página {page} de {pages}</span><Button variant="outline" size="icon" className="size-8" aria-label="Página siguiente de usuarios" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight /></Button></div></div>}
    </Card>
    {modal?.type === 'form' && <UserForm record={modal.record} modules={modules} actor={user} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.type === 'delete' && <DeleteUser record={modal.record} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.type === 'detail' && <Modal title="Detalle del usuario" eyebrow="CUENTA Y PERMISOS" onClose={() => setModal(null)} wide><div className="space-y-5 p-5 sm:p-6"><div><h3 className="text-lg font-bold break-words text-primary">{modal.record.name}</h3><p className="mt-1 text-sm break-all text-muted-foreground">{modal.record.email}</p><p className="mt-3 text-sm">{modal.record.is_admin ? 'Administrador' : 'Permisos personalizados'} · {modal.record.active ? 'Activo' : 'Inactivo'}</p></div><Permissions modules={modules} selected={modal.record.permissions} admin={modal.record.is_admin} actor={user} disabled onChange={() => {}} /><div className="flex justify-end gap-3 border-t pt-4"><Button variant="outline" onClick={() => setModal(null)}>Cerrar</Button>{can(user, 'users.update') && (user.is_admin || !modal.record.is_admin) && <Button onClick={() => setModal({ type: 'form', record: modal.record })}><Pencil />Editar usuario</Button>}</div></div></Modal>}
  </>;
}
