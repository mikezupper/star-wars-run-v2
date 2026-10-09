/// <reference types="node" />
// `pnpm build:image`, inside the Docker build (ADR 0003): finishes dist/ for the site's image
// from the client build alone, with no archive. It adds the 404 page Caddy serves for a missing
// file and the service worker; then drops Vite's manifest, which the API's bundle has read by
// now. The data (pages.sqlite, archive.duckdb, ask-schema.json) comes from `pnpm build` on your
// machine and reaches the API through a volume (docs/deploy.md). Run after `vite build` and
// `pnpm build:api`.
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notFoundPage } from '../src/render/site.js';
import { SHELL_PATHS } from '../src/offline/precache.js';
import { buildServiceWorker } from './build-sw.js';
import { siteAssets } from './lib/assets.js';

const dist = fileURLToPath(new URL(`../${process.env['DIST_DIR'] ?? 'dist'}/`, import.meta.url));
const manifest = join(dist, '.vite', 'manifest.json');
const assets = await siteAssets(dist);
await writeFile(join(dist, '404.html'), await notFoundPage(assets));
// The precached pages' revision: the client build's, so a new image refreshes them. Pages are
// fetched from the network first anyway (src/offline/sw.ts), so new data shows without one.
const build = createHash('sha256')
  .update(await readFile(manifest))
  .digest('hex')
  .slice(0, 12);
const sw = await buildServiceWorker(dist, { shell: SHELL_PATHS, build });
await rm(join(dist, '.vite'), { recursive: true, force: true });
console.log(`image: 404.html, sw.js (${String(sw.entries)} precached files, ${sw.kb} KB)`);
