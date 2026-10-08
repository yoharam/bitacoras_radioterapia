import { createApp } from './app.js';
import { fileURLToPath } from 'node:url';

const databasePath = process.env.DB_PATH || fileURLToPath(new URL('../data/bitacoras.sqlite', import.meta.url));
const { app, db } = await createApp({ databasePath });
const port = Number(process.env.API_PORT || 4100);
const server = app.listen(port, '127.0.0.1', () => console.log(`API de bitácoras: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { db.close(); process.exit(0); }));
