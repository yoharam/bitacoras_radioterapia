const failure = (message, status = 503, retryAfter) => Object.assign(new Error(message), { status, retryAfter });
const text = (value, limit = 150) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export function createPersonnelService({ baseUrl = process.env.PERSONAL_API_BASE_URL, apiKey = process.env.PERSONAL_API_KEY, fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  let blockedUntil = 0, failures = 0;
  let base;
  try { base = new URL(`${baseUrl?.replace(/\/+$/, '')}/`); } catch { /* La configuración se valida antes de consultar. */ }
  const configured = Boolean(apiKey && base && ['http:', 'https:'].includes(base.protocol));

  function person(data) {
    if (!data || typeof data.numero_empleado !== 'string' || !/^[A-Za-z0-9-]{1,20}$/.test(data.numero_empleado)) throw failure('La consulta institucional devolvió datos incompletos. Puedes capturar el usuario manualmente.');
    const given_names = text(data.nombre, 100), surnames = text(data.apellidos, 100);
    return { employee_number: data.numero_empleado, name: text(data.nombre_completo || `${given_names} ${surnames}`, 100), given_names, surnames, status: text(data.status_laboral, 30), service: text(data.fm1?.servicio), position: text(data.fm1?.puesto) };
  }
  async function get(path, query, convert) {
    if (!configured) throw failure('La consulta de personal institucional no está configurada. Puedes capturar el usuario manualmente.');
    const url = new URL(path, base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const key = url.pathname + url.search;
    const cached = cache.get(key);
    if (cached?.until > now()) return cached.data;
    if (blockedUntil > now()) throw failure('La consulta institucional está temporalmente ocupada. Intenta más tarde o captura el usuario manualmente.', 503, Math.ceil((blockedUntil - now()) / 1000));
    let response;
    try { response = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error' }); }
    catch {
      failures++;
      blockedUntil = now() + Math.min(60000, 1000 * 2 ** Math.min(failures, 6));
      throw failure('No se pudo conectar con personal institucional. Puedes capturar el usuario manualmente.');
    }
    if (!response.ok) {
      if (response.status === 404) throw failure('No se encontró a la persona en el catálogo institucional.', 404);
      if ([401, 403].includes(response.status)) throw failure('La consulta institucional no está autorizada. Puedes capturar el usuario manualmente.');
      failures++;
      const header = Number(response.headers.get('retry-after'));
      const delay = response.status === 429 ? (Number.isFinite(header) && header > 0 ? Math.min(header, 3600) : 60) : Math.min(60, 2 ** Math.min(failures, 6));
      blockedUntil = now() + delay * 1000;
      throw failure(response.status === 429 ? 'La consulta institucional alcanzó su límite. Intenta más tarde o captura el usuario manualmente.' : 'Personal institucional no está disponible. Puedes capturar el usuario manualmente.', 503, delay);
    }
    let data;
    try { data = convert(await response.json()); }
    catch { throw failure('La consulta institucional devolvió una respuesta incompleta. Puedes capturar el usuario manualmente.'); }
    failures = 0;
    cache.set(key, { data, until: now() + 60000 });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return data;
  }
  return {
    configured,
    search: query => get('v1/personal', { buscar: query, por_pagina: '6', pagina: '1' }, data => {
      if (!Array.isArray(data.datos)) throw failure('Respuesta incompleta.');
      return data.datos.slice(0, 6).map(person);
    }),
    find: number => get(`v1/personal/${encodeURIComponent(number)}`, {}, person)
  };
}
