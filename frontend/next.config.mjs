import { fileURLToPath } from 'node:url';

export default {
  allowedDevOrigins: [new URL(process.env.APP_ORIGIN || 'http://192.168.38.250:3100').hostname],
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  turbopack: { root: fileURLToPath(new URL('../', import.meta.url)) }
};
