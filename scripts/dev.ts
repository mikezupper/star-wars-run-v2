/// <reference types="node" />
// `pnpm dev`: Vite serves the client modules, the stylesheet and public/; every other request is rendered by the
// same code the build prerenders, reloaded per request so edits show up.
// The search index is the exception: Pagefind builds it from the finished pages during
// `pnpm build`, so dev serves /pagefind/ from the last build's dist/pagefind/
// (docs/lessons-learned.md).
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import type * as LoadModule from '../src/data/load.js';
import type * as SiteModule from '../src/render/site.js';

const port = Number(process.env['PORT'] ?? 5500);
const vite = await createViteServer({
  server: { middlewareMode: true, ws: { port: Number(process.env['HMR_PORT'] ?? 24800) } },
  appType: 'custom',
});

const DEV_ASSETS = {
  stylesheet: '/src/styles/site.css',
  clientEntry: '/src/entry-client.ts',
  page: '/src/page.ts',
};

const PAGEFIND_DIR = fileURLToPath(new URL('../dist/pagefind', import.meta.url));

/** Serves /pagefind/* from dist/; without a build, a 404 that says how to make one. */
async function servePagefind(pathname: string, res: http.ServerResponse): Promise<void> {
  const file = normalize(join(PAGEFIND_DIR, pathname.slice('/pagefind/'.length)));
  try {
    if (!file.startsWith(PAGEFIND_DIR)) throw new Error('outside dist/pagefind');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      `No search index at dist/pagefind${pathname.slice('/pagefind'.length)}. ` +
        'Search needs one: run `pnpm build` once (and again after `pnpm ingest`), then reload.\n',
    );
  }
}

async function render(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  try {
    const mod = (await vite.ssrLoadModule('/src/render/site.ts')) as typeof SiteModule;
    const load = (await vite.ssrLoadModule('/src/data/load.ts')) as typeof LoadModule;
    const response = await mod
      .createSite(DEV_ASSETS, await load.loadDataset())
      .fetch(new Request(new URL(req.url ?? '/', `http://localhost:${String(port)}`)));
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
    if (pathname.startsWith('/pagefind/')) {
      void servePagefind(pathname, res);
      return;
    }
    vite.middlewares(req, res, () => void render(req, res));
  })
  .listen(port, () => {
    console.log(`starwars.run: http://localhost:${String(port)}`);
  });
