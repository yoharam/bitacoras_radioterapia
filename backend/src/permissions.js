export const modules = [
  { key: 'radiotherapy', label: 'Bitácora de radioterapia', actions: [{ key: 'read', label: 'Consultar' }, { key: 'create', label: 'Registrar' }, { key: 'arrive', label: 'Registrar llegada del paciente' }, { key: 'update', label: 'Editar' }, { key: 'delete', label: 'Eliminar' }, { key: 'export', label: 'Exportar CSV' }, { key: 'assist', label: 'Solicitar asistencia de Redes' }] },
  { key: 'networks', label: 'Asistencia de Redes', actions: [{ key: 'read', label: 'Consultar solicitudes' }, { key: 'update', label: 'Marcar como atendida' }] },
  { key: 'users', label: 'Usuarios', actions: [{ key: 'read', label: 'Consultar' }, { key: 'create', label: 'Crear' }, { key: 'update', label: 'Editar y asignar permisos' }, { key: 'delete', label: 'Eliminar' }] }
];
export const permissionKeys = modules.flatMap(module => module.actions.map(action => `${module.key}.${action.key}`));
export const can = (user, permission) => Boolean(user?.is_admin || user?.permissions?.includes(permission));
export function validatePermissions(value) {
  if (!Array.isArray(value) || value.some(key => typeof key !== 'string' || !permissionKeys.includes(key))) throw Object.assign(new Error('Selecciona permisos válidos.'), { status: 400 });
  const selected = [...new Set(value)];
  for (const module of modules) if (selected.some(key => key.startsWith(`${module.key}.`)) && !selected.includes(`${module.key}.read`)) throw Object.assign(new Error(`El permiso Consultar es necesario para usar el módulo ${module.label}.`), { status: 400 });
  return selected;
}
