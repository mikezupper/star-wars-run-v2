/// <reference types="node" />
// `pnpm build:api`: bundles the API service (scripts/api.ts) into one file, .server/api.mjs, for
// its container. DuckDB's native module stays external; the image installs it. The Dockerfile
// copies that one file, so a split chunk (Gyral's renderer loads parts of itself lazily) would
// crash the container on start (swr-59p): code splitting is off, and anything else written fails
// the build here instead.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { siteAssets } from './lib/assets.js';

const root = fileURLToPath(new URL('..', import.meta.url));
// The site's CSS and JS, from the client build beside it (`vite build` first): the API links
// these, not the names stamped in the data, which may come from another build (ADR 0003).
const dist = join(root, process.env['DIST_DIR'] ?? 'dist');
const assets = existsSync(join(dist, '.vite', 'manifest.json'))
  ? await siteAssets(dist)
  : undefined;
// `pnpm check` builds the bundle without one, to check it stays one file (swr-smn); the image
// build runs `vite build` first.
if (assets === undefined)
  console.log("build:api: no client build in dist/, so pages link the data's assets");
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
  define: { __SITE_ASSETS__: JSON.stringify(assets ?? null) },
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
