import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CACHE } from '../../src/hosting/headers.js';
import { createPagesApp } from '../../src/server/app.js';
import { openPages, writePages, type Pages } from '../../src/server/pages.js';
import { fixtureSiteData } from '../fixtures/archive.js';

const data = fixtureSiteData();
const assets = {
  stylesheet: '/assets/site.css',
  clientEntry: '/assets/e.js',
  page: '/assets/p.js',
};
let dir: string;
let pages: Pages;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'swr-pages-'));
  writePages(join(dir, 'pages.sqlite'), data, { build: 'b42', assets });
  pages = openPages(join(dir, 'pages.sqlite'));
});

afterAll(async () => {
  pages.close();
  await rm(dir, { recursive: true, force: true });
});

describe('the pages file', () => {
  it('holds the address book, the records and the link graph', () => {
    expect([...pages.data.archive.byTitle.keys()].sort()).toEqual(
      [...data.archive.byTitle.keys()].sort(),
    );
    expect(pages.data.archive.byTitle.get('Luke Skywalker')?.twin).toBe('Luke Skywalker/Legends');
    expect(pages.data.articles.get('Tatooine')).toEqual(data.articles.get('Tatooine'));
    expect(pages.data.articles.get('Nobody')).toBeUndefined();
    expect(pages.data.articles.has('Tatooine')).toBe(true);
    expect(pages.data.links.counts.get('Luke Skywalker')).toBe(
      data.links.counts.get('Luke Skywalker'),
    );
    expect(pages.data.links.linkedFrom.get('Luke Skywalker')).toEqual(
      data.links.linkedFrom.get('Luke Skywalker'),
    );
    expect(pages.meta).toEqual({ build: 'b42', assets });
  });

  it('refuses to iterate the archive, which would read every row', () => {
    expect(() => [...pages.data.articles]).toThrow(/iterating/);
    expect(() => pages.data.articles.size).toThrow(/iterating/);
  });
});

describe('pages rendered on request', () => {
  const app = () => createPagesApp(pages);
  const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
    app()(new Request(`https://starwars.run${path}`, { method, headers }));

  it('render a page with the build as its ETag and a week at Cloudflare', async () => {
    const res = await get('/characters/luke-skywalker/');
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('W/"b42"');
    expect(res.headers.get('cache-control')).toBe(CACHE.pages);
    const html = await res.text();
    expect(html).toContain('Luke Skywalker');
    expect(html).toContain('href="/assets/site.css"');
  });

  it('answer a revisit with 304 and no body', async () => {
    const res = await get('/characters/luke-skywalker/', { 'if-none-match': 'W/"b42"' });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe('');
    expect((await get('/', { 'if-none-match': 'W/"old"' })).status).toBe(200);
  });

  it('add the slash with a 308, keeping the query', async () => {
    const res = await get('/characters/luke-skywalker?x=1');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('/characters/luke-skywalker/?x=1');
  });

  it('answer an unknown path with the 404 page, briefly cached', async () => {
    const res = await get('/no-such-page/');
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe(CACHE.notFound);
    expect(await res.text()).toContain('<meta name="robots" content="noindex"');
    expect((await get('/no-such-page')).status).toBe(404);
  });

  it('send /random/ to a random article, uncached', async () => {
    const res = await get('/random');
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('location')).toMatch(/^\/[a-z-]+\/[^/]+\/$/);
  });

  it('take GET and HEAD only; HEAD has no body', async () => {
    expect((await get('/', {}, 'POST')).status).toBe(405);
    const head = await get('/', {}, 'HEAD');
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});
