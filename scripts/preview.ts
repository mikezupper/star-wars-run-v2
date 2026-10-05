/// <reference types="node" />
// `pnpm preview`: serves dist/ the way the production server will: `/x/` → `x/index.html`,
// `/x` → 308 to `/x/`, unknown paths → 404.html with status 404. Cache and security headers
// arrive with the Docker bead (swr-3mo.10).
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

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
      const send = async (file: string, status: number) => {
        res.writeHead(status, {
          'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        });
        res.end(await readFile(file));
      };
      if (!local.startsWith(dist)) {
        await send(join(dist, '404.html'), 404);
      } else if (path.endsWith('/') && (await isFile(join(local, 'index.html')))) {
        await send(join(local, 'index.html'), 200);
      } else if (!path.endsWith('/') && (await isFile(join(local, 'index.html')))) {
        res.writeHead(308, { location: `${path}/${url.search}` });
        res.end();
      } else if (await isFile(local)) {
        await send(local, 200);
      } else {
        await send(join(dist, '404.html'), 404);
      }
    })();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 5501);
  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  createPreview(dist).listen(port, () => {
    console.log(`starwars.run preview (dist/): http://localhost:${String(port)}`);
  });
}
