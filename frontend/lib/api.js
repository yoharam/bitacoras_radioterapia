export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', 'X-Bitacoras-Request': '1', ...options.headers } });
  let data;
  try { data = await response.json(); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new Error('No se pudo leer la respuesta del servidor. Inténtalo de nuevo.'); }
  if (!response.ok) {
    if (response.status === 403) window.dispatchEvent(new Event('permissions-changed'));
    if (response.status === 401 && !path.endsWith('/login')) window.dispatchEvent(new Event('session-expired'));
    throw new Error(data.message || 'No se pudo conectar con el servidor. Inténtalo de nuevo.');
  }
  return data;
}

export const can = (user, permission) => Boolean(user?.is_admin || user?.permissions?.includes(permission));
