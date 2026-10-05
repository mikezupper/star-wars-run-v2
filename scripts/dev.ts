/// <reference types="node" />
// `pnpm dev`: Vite serves the client modules, the stylesheet and public/; every other request is rendered by the
// same code the build prerenders, reloaded per request so edits show up.
import http from 'node:http';
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
    vite.middlewares(req, res, () => void render(req, res));
  })
  .listen(port, () => {
    console.log(`starwars.run: http://localhost:${String(port)}`);
  });
