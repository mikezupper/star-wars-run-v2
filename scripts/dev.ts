/// <reference types="node" />
// `pnpm dev`: Vite serves the client modules, the stylesheet and public/; every other request is
// rendered by the same code the app runs, with the snapshot in memory and reloaded per request
// so edits show up. Search is the exception: its index is in the last full build's pages.sqlite
// (<DIST_DIR>-api/), so /search/ answers from there when it exists (docs/lessons-learned.md).
import { existsSync } from 'node:fs';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { handleApi, isApi } from './lib/api.js';
import { loadSiteData } from '../src/data/archive.js';
import type { Section } from '../src/domain/sections.js';
import type * as SiteModule from '../src/render/site.js';
import { createSearch } from '../src/server/search.js';

const port = Number(process.env['PORT'] ?? 5500);
const vite = await createViteServer({
  server: {
    middlewareMode: true,
    ws: { port: Number(process.env['HMR_PORT'] ?? 24800) },
    // Generated folders, whatever DIST_DIR says: the full build alone is 456k files, and
    // watching them stalled startup for minutes (docs/lessons-learned.md).
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
      ],
    },
  },
  appType: 'custom',
});

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
  clientEntry: '/src/entry-client.ts',
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

const sites = new WeakMap<object, SiteModule.Site>();

async function render(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const mod = (await vite.ssrLoadModule('/src/render/site.ts')) as typeof SiteModule;
    // The route table has an entry per article: build it once per version of the module
    // (Vite hands back a new module object after an edit), not on every request.
    let site = sites.get(mod);
    if (site === undefined) {
      site = mod.createSite(DEV_ASSETS, siteData);
      sites.set(mod, site);
    }
    const response = await site.fetch(
      new Request(new URL(req.url ?? '/', `http://localhost:${String(port)}`)),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch (error) {
    vite.ssrFixStacktrace(error as Error);
    console.error(error);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String((error as Error).stack ?? error));
  }
}

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (isApi(pathname)) {
      void handleApi(req, res);
      return;
    }
    vite.middlewares(req, res, () => void render(req, res));
  })
  .listen(port, () => {
    console.log(`starwars.run: http://localhost:${String(port)}`);
  });
