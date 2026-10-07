/// <reference types="node" />
// `pnpm build:api`: bundles the API service (scripts/api.ts) into one file, .server/api.mjs, for
// its container. DuckDB's native module stays external; the image installs it.
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
    rollupOptions: { output: { entryFileNames: 'api.mjs' } },
  },
  ssr: { target: 'node', noExternal: true, external: ['@duckdb/node-api'] },
});
console.log('wrote .server/api.mjs');
