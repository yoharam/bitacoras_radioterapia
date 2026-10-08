import { fileURLToPath } from 'node:url';

const api = process.env.API_URL || 'http://127.0.0.1:4100';
export default {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL('../', import.meta.url)) },
  async rewrites() { return [{ source: '/api/:path*', destination: `${api}/api/:path*` }]; }
};
