/// <reference types="node" />
// `pnpm build:api`: bundles the API service (scripts/api.ts) into one file, .server/api.mjs, for
// its container. DuckDB's native module stays external; the image installs it. The Dockerfile
// copies that one file, so a split chunk (Gyral's renderer loads parts of itself lazily) would
// crash the container on start (swr-59p): code splitting is off, and anything else written fails
// the build here instead.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  configFile: false,
  root,
  logLevel: 'warn',
  publicDir: false,
  build: {
    ssr: 'scripts/api.ts',
    outDir: '.server',
    emptyOutDir: true,
    target: 'node24',
    rollupOptions: { output: { entryFileNames: 'api.mjs', codeSplitting: false } },
  },
  ssr: { target: 'node', noExternal: true, external: ['@duckdb/node-api'] },
});
const written = readdirSync(new URL('../.server/', import.meta.url), { recursive: true });
if (written.length !== 1 || written[0] !== 'api.mjs') {
  console.error(
    `build:api wrote ${written.join(', ')}, but the image copies only api.mjs. Keep the bundle one file.`,
  );
  process.exit(1);
}
console.log('wrote .server/api.mjs');
