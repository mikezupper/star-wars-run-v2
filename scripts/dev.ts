/// <reference types="node" />
// `pnpm dev`: Vite serves the client modules, the stylesheet and public/; every other request is rendered by the
// same code the build prerenders, reloaded per request so edits show up.
// The search indexes are the exception: the build writes them (Pagefind from the finished
// pages, the title index from the archive), so dev serves /pagefind/ and /search-titles/ from
// the last build's dist/ (docs/lessons-learned.md).
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { handleAsk, isAsk } from './lib/ask.js';
import { loadSiteData } from '../src/data/archive.js';
import type * as SiteModule from '../src/render/site.js';
import { ranged } from './lib/range.js';

const port = Number(process.env['PORT'] ?? 5500);
const vite = await createViteServer({
  server: {
    middlewareMode: true,
    ws: { port: Number(process.env['HMR_PORT'] ?? 24800) },
    // Generated folders, whatever DIST_DIR says: the full build alone is 456k files, and
    // watching them stalled startup for minutes (docs/lessons-learned.md).
    watch: {
      ignored: ['**/dist/**', '**/.sample/**', '**/data/**', '**/coverage/**', '**/.smoke/**'],
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

const DIST = fileURLToPath(
  new URL(`../${process.env['DIST_DIR'] ?? 'dist'}/`, import.meta.url),
).replace(/\/$/, '');
/** Build outputs the dev server serves from dist/: the search indexes, Explore's data and engine. */
const FROM_BUILD = ['/pagefind/', '/search-titles/', '/data/', '/duckdb/'];

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.parquet': 'application/octet-stream',
};

/** Serves build outputs from dist/; without a build, a 404 that says how to make one. */
async function serveFromBuild(
  pathname: string,
  res: http.ServerResponse,
  range: string | undefined,
  head: boolean,
): Promise<void> {
  const file = normalize(join(DIST, pathname));
  try {
    if (!file.startsWith(DIST)) throw new Error('outside dist');
    const answer = ranged(await readFile(file), range);
    res.writeHead(answer.status, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
      ...answer.headers,
    });
    res.end(head ? undefined : answer.body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      `No dist${pathname}. Search and Explore read files that \`pnpm build\` writes: ` +
        'run it once (and again after the snapshot changes), then reload.\n',
    );
  }
}

const sites = new WeakMap<object, SiteModule.Site>();

async function render(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const mod = (await vite.ssrLoadModule('/src/render/site.ts')) as typeof SiteModule;
    // The route table has an entry per article: build it once per version of the module
    // (Vite hands back a new module object after an edit), not on every request.
    let site = sites.get(mod);
    if (site === undefined) {
      site = mod.createSite(DEV_ASSETS, data);
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
    if (isAsk(pathname)) {
      void handleAsk(req, res);
      return;
    }
    if (FROM_BUILD.some((prefix) => pathname.startsWith(prefix))) {
      void serveFromBuild(pathname, res, req.headers.range, req.method === 'HEAD');
      return;
    }
    vite.middlewares(req, res, () => void render(req, res));
  })
  .listen(port, () => {
    console.log(`starwars.run: http://localhost:${String(port)}`);
  });
