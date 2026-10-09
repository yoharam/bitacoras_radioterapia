import { fileURLToPath } from 'node:url';

export default {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL('../', import.meta.url)) }
};
