import { createServer } from 'node:http';
const person = { numero_empleado: '004321', nombre: 'JOSÉ', apellidos: 'GONZÁLEZ PÉREZ', nombre_completo: 'JOSÉ GONZÁLEZ PÉREZ', status_laboral: 'ACTIVO', fm1: { servicio: 'RADIOTERAPIA', puesto: 'TÉCNICO' } };
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') return res.end('{"status":"ok"}');
  if (req.headers.authorization !== 'Bearer llave-de-prueba') { res.statusCode = 401; return res.end('{}'); }
  if (url.pathname === '/v1/personal/004321') return res.end(JSON.stringify(person));
  if (url.pathname === '/v1/personal') {
    if (url.searchParams.get('buscar') === 'error') { res.statusCode = 503; return res.end('{}'); }
    return res.end(JSON.stringify({ datos: [person], total: 1, pagina: 1, por_pagina: 6 }));
  }
  res.statusCode = 404; res.end('{}');
});
server.listen(Number(process.env.E2E_PERSONNEL_PORT), '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
