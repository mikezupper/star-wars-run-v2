import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CACHE, CSP, SPECULATION_RULES } from '../../src/hosting/headers.js';
import { createPreview } from '../../scripts/preview.js';

vi.mock('../../scripts/lib/api.js', () => ({
  isApi: (path: string) => path.startsWith('/api/'),
  handleApi: async (request: Request, extra: Record<string, string>) => {
    const headers = { ...extra, 'cache-control': 'no-store', etag: 'W/"data-code"' };
    if (request.headers.get('if-none-match') === headers.etag)
      return new Response(null, { status: 304, headers });
    return new Response(request.method === 'POST' ? await request.text() : 'app page', { headers });
  },
}));

let dir: string;
let base: string;
let preview: ReturnType<typeof createPreview>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'swr-preview-'));
  await mkdir(join(dir, 'assets'));
  for (const [file, text] of [
    ['assets/file.js', '0123456789'],
    ['sw.js', 'old worker'],
    ['speculation-rules.json', '{}'],
    ['sitemap.xml', '<xml/>'],
    ['404.html', '<h1>Missing</h1>'],
  ] as const)
    await writeFile(join(dir, file), text);
  preview = createPreview(dir);
  await new Promise<void>((resolve) => {
    preview.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(preview.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    preview.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
    preview.closeAllConnections();
  });
  await rm(dir, { recursive: true, force: true });
});

describe('preview through Gyral Node and asset adapters', () => {
  it('serves ranges with the production security and cache policy', async () => {
    const res = await fetch(`${base}/assets/file.js`, { headers: { range: 'bytes=2-4' } });
    expect([res.status, await res.text()]).toEqual([206, '234']);
    expect(res.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(res.headers.get('cache-control')).toBe(CACHE.assets);
    expect(res.headers.get('content-security-policy')).toBe(CSP);
    expect(res.headers.get('speculation-rules')).toBe('"/speculation-rules.json"');
    const head = await fetch(`${base}/assets/file.js`, { method: 'HEAD' });
    expect(head.headers.get('content-length')).toBe('10');
    expect(await head.text()).toBe('');
  });

  it('serves suffix ranges, refuses unsatisfiable ranges and ignores multiple ranges', async () => {
    const get = (range: string) => fetch(`${base}/assets/file.js`, { headers: { range } });
    expect(await (await get('bytes=-3')).text()).toBe('789');
    expect((await get('bytes=10-')).status).toBe(416);
    expect(await (await get('bytes=0-1,4-5')).text()).toBe('0123456789');
  });

  it('keeps site document MIME types under nosniff', async () => {
    for (const [path, type] of [
      [SPECULATION_RULES.path, SPECULATION_RULES.type],
      ['/sitemap.xml', 'application/xml'],
      ['/404.html', 'text/html; charset=utf-8'],
    ] as const) {
      expect((await fetch(base + path)).headers.get('content-type')).toBe(type);
    }
  });

  it('revalidates the service worker and rereads it after a build', async () => {
    const res = await fetch(`${base}/sw.js`);
    expect(res.headers.get('cache-control')).toBe(CACHE.serviceWorker);
    expect(await res.text()).toBe('old worker');
    await writeFile(join(dir, 'sw.js'), 'new worker');
    expect(await (await fetch(`${base}/sw.js`)).text()).toBe('new worker');
  });

  it('routes file misses to the app, preserving ETags and POST bodies', async () => {
    expect(await (await fetch(`${base}/characters/luke/`)).text()).toBe('app page');
    const revisit = await fetch(`${base}/characters/luke/`, {
      headers: { 'if-none-match': 'W/"data-code"' },
    });
    expect(revisit.status).toBe(304);
    expect(await revisit.text()).toBe('');
    expect(revisit.headers.get('content-security-policy')).toBe(CSP);
    const body = JSON.stringify({ sql: 'SELECT 1' });
    const post = await fetch(`${base}/api/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(await post.text()).toBe(body);
  });

  it('answers malformed static URLs with 400 and unsupported methods with 405', async () => {
    expect((await fetch(`${base}/assets/%ZZ`)).status).toBe(400);
    expect((await fetch(`${base}/assets/file.js`, { method: 'POST', body: 'x' })).status).toBe(405);
  });
});
