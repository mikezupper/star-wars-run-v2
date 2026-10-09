/// <reference types="node" />
// `pnpm preview`: serves a build the way production does (ADR 0011): the files in dist/ as Caddy
// serves them, with the headers from src/hosting/headers.ts, and everything else from the app
// (src/server): /api/, and every page, rendered from <dist>-api/pages.sqlite. The smoke test runs
// against this server.
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersFor, NAVIGATION, SECURITY, SPECULATION_RULES } from '../src/hosting/headers.js';
import { handleApi, isApi } from './lib/api.js';
import { ranged } from './lib/range.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.parquet': 'application/octet-stream',
};

const isFile = async (path: string): Promise<boolean> =>
  stat(path).then(
    (s) => s.isFile(),
    () => false,
  );

export function createPreview(dist: string): http.Server {
  return http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      const local = normalize(join(dist, path));
      // A file in dist/ is served as Caddy serves it; everything else is the app's (ADR 0011):
      // /api/, and every page, rendered on request with its own Cache-Control.
      if (!isApi(path) && local.startsWith(dist) && (await isFile(local))) {
        const answer = ranged(await readFile(local), req.headers.range);
        res.writeHead(answer.status, {
          'content-type':
            path === SPECULATION_RULES.path
              ? SPECULATION_RULES.type
              : (TYPES[extname(local)] ?? 'application/octet-stream'),
          ...headersFor(path, 200),
          ...answer.headers,
        });
        res.end(req.method === 'HEAD' ? undefined : answer.body);
        return;
      }
      await handleApi(req, res, { ...SECURITY, ...NAVIGATION });
    })();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 5501);
  const dist = fileURLToPath(
    new URL(`../${process.env['DIST_DIR'] ?? 'dist'}/`, import.meta.url),
  ).replace(/\/$/, '');
  createPreview(dist).listen(port, () => {
    console.log(`starwars.run preview (dist/): http://localhost:${String(port)}`);
  });
}
