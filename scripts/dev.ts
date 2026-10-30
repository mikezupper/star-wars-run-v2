/// <reference types="node" />
// `pnpm dev`: Vite serves the client modules, the stylesheet and public/; every other request is
// rendered by the same code the app runs, with the snapshot in memory. Vite reloads the server
// modules after an edit, so edits show up on the next request. Search is the exception: its index
// is in the last full build's pages.sqlite (<DIST_DIR>-api/), so /search/ answers from there when
// it exists (docs/lessons-learned.md).
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { gyralDevServer } from '@gyral/ssr/node';
import { storeComponents } from '../src/render/assets.js';
import { handleApi, isApi } from './lib/api.js';
import { loadSiteData } from '../src/data/archive.js';
import type { Section } from '../src/domain/sections.js';
import type * as SiteModule from '../src/render/site.js';
import { createSearch } from '../src/server/search.js';

const port = Number(process.env['PORT'] ?? 5500);
// The archive is loaded once, here, not per request: the full snapshot takes seconds and GBs.
// SITE_SAMPLE=N loads a sample instead, for a quicker start.
const sample = Number(process.env['SITE_SAMPLE']);
console.log('starwars.run: loading the archive…');
const started = Date.now();
const data = await loadSiteData(Number.isInteger(sample) && sample > 0 ? { sample } : {});
console.log(
  `starwars.run: ${String(data.archive.byTitle.size)} articles loaded in ${String(Math.round((Date.now() - started) / 1000))}s`,
);

const DEV_ASSETS = {
  stylesheet: '/src/styles/site.css',
  page: '/src/page.ts',
};

// Search from the last full build's pages file, read-only, beside the in-memory archive.
const pagesFile = fileURLToPath(
  new URL(`../${process.env['DIST_DIR'] ?? 'dist'}-api/pages.sqlite`, import.meta.url),
);
const search = existsSync(pagesFile)
  ? createSearch(new DatabaseSync(pagesFile, { readOnly: true }), data.archive, data.links.counts)
  : undefined;
if (search === undefined)
  console.log('starwars.run: no pages.sqlite yet, so no search (pnpm build)');
const siteData = {
  ...data,
  ...(search === undefined
    ? {}
    : {
        search: (query: string, section?: Section) =>
          search.search(query, section === undefined ? {} : { section }),
      }),
};

const dev = await gyralDevServer({
  entry: '/src/render/site.ts',
  port,
  hmrPort: Number(process.env['HMR_PORT'] ?? 24800),
  state: () => siteData,
  // Gyral calls this once per server-module version (after an edit, or when the client
  // components change), so the 227k-entry route table is built then, not per request. The
  // archive survives reloads as state.
  app: (mod: typeof SiteModule, { components, state }) => {
    const site = mod.createSite(
      {
        ...DEV_ASSETS,
        ...(components === undefined ? {} : { components: storeComponents(components) }),
      },
      state,
    );
    return {
      fetch: (request) =>
        isApi(new URL(request.url).pathname) ? handleApi(request) : site.fetch(request),
    };
  },
  vite: {
    server: {
      // A full build used to stall startup while Vite watched hundreds of thousands of files.
      watch: {
        ignored: [
          '**/dist/**',
          '**/dist-api/**',
          '**/.sample/**',
          '**/.sample-api/**',
          '**/.spike/**',
          '**/data/**',
          '**/coverage/**',
          '**/.smoke/**',
          '**/.gyral/**',
        ],
      },
    },
  },
});
console.log(`starwars.run: ${dev.url}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void dev.close().finally(() => process.exit(0));
  });
}
