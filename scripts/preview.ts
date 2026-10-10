/// <reference types="node" />
// Preview matches Caddy: built files first, then pages and /api/ from the app, with the same
// header policy. Gyral handles files, ranges and Node streams; the site owns routing and policy.
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { toNodeListener } from '@gyral/ssr/node';
import { assetHandler } from '@gyral/ssr/static';
import { headersFor, NAVIGATION, SECURITY, SPECULATION_RULES } from '../src/hosting/headers.js';
import { handleApi, isApi } from './lib/api.js';

export function createPreview(dist: string): http.Server {
  // Root files (especially sw.js) can change at the same URL between builds.
  const assets = assetHandler({ dir: dist, prefix: '/', cache: false });
  return http.createServer(
    toNodeListener(async (request) => {
      const { pathname } = new URL(request.url);
      if (!isApi(pathname)) {
        const response = await assets(request);
        // A missing file is often a page the app renders. Keep malformed requests and method
        // errors from the asset handler; let the app give page misses their HTML 404.
        if (response !== undefined && response.status !== 404) {
          const headers = new Headers(response.headers);
          for (const [name, value] of Object.entries(headersFor(pathname, response.status))) {
            headers.set(name, value);
          }
          // Gyral's asset types cover client files; Caddy also serves these site documents.
          if (pathname === SPECULATION_RULES.path)
            headers.set('content-type', SPECULATION_RULES.type);
          else if (pathname.endsWith('.html'))
            headers.set('content-type', 'text/html; charset=utf-8');
          else if (pathname.endsWith('.xml')) headers.set('content-type', 'application/xml');
          return new Response(response.body, { status: response.status, headers });
        }
      }
      return handleApi(request, { ...SECURITY, ...NAVIGATION });
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 5501);
  const dist = fileURLToPath(new URL(`../${process.env['DIST_DIR'] ?? 'dist'}/`, import.meta.url));
  createPreview(dist).listen(port, () => {
    console.log(`starwars.run preview (dist/): http://localhost:${String(port)}`);
  });
}
