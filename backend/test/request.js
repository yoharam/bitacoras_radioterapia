import { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';

// Ejercita Express y sus middlewares reales sin abrir puertos TCP.
export function request(app, path, { method = 'GET', body, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough();
    socket.remoteAddress = '127.0.0.1';
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = path;
    req.headers = { host: 'localhost:3100', 'x-bitacoras-request': '1', ...headers };
    if (cookie) req.headers.cookie = cookie;
    const payload = body === undefined ? '' : JSON.stringify(body);
    if (payload) { req.headers['content-type'] = 'application/json'; req.headers['content-length'] = String(Buffer.byteLength(payload)); }
    const res = new ServerResponse(req);
    const chunks = [];
    res.write = chunk => { chunks.push(Buffer.from(chunk)); return true; };
    res.end = chunk => {
      if (chunk) chunks.push(Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString('utf8');
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      resolve({ status: res.statusCode, headers: res.getHeaders(), body: data });
      res.emit('finish');
      socket.destroy();
      return res;
    };
    req.on('error', reject);
    app.handle(req, res);
    req.push(payload || null);
    if (payload) req.push(null);
  });
}
