import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CACHE } from '../../src/hosting/headers.js';
import { createPagesApp } from '../../src/server/app.js';
import { openPages, writePages, type Pages } from '../../src/server/pages.js';
import type { Section } from '../../src/domain/sections.js';
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
  const redirects = new Map([
    ['Farmboy', 'Luke Skywalker'],
    ['Loop a', 'Loop b'],
    ['Loop b', 'Loop a'],
  ]);
  writePages(join(dir, 'pages.sqlite'), data, { build: 'b42', assets }, redirects);
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

describe('pages from data another build wrote (images carry no data, ADR 0003)', () => {
  const image = {
    assets: {
      stylesheet: '/assets/site-new.css',
      clientEntry: '/assets/e2.js',
      page: '/assets/p2.js',
    },
    id: 'code7',
  };
  const get = (path: string, headers: Record<string, string> = {}) =>
    createPagesApp(pages, image)(new Request(`https://starwars.run${path}`, { headers }));

  it("link the image's CSS and JS, not the ones stamped in the data", async () => {
    const html = await (await get('/characters/luke-skywalker/')).text();
    expect(html).toContain('href="/assets/site-new.css"');
    expect(html).not.toContain('/assets/site.css');
    expect(await (await get('/no-such-page/')).text()).toContain('/assets/site-new.css');
  });

  it("name both the data and the code in the ETag, so new code isn't a 304", async () => {
    const res = await get('/');
    expect(res.headers.get('etag')).toBe('W/"b42-code7"');
    expect((await get('/', { 'if-none-match': 'W/"b42"' })).status).toBe(200);
    expect((await get('/', { 'if-none-match': 'W/"b42-code7"' })).status).toBe(304);
  });

  it('serve the sitemaps from the data, cached like pages', async () => {
    const index = await get('/sitemap.xml');
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toBe('application/xml');
    expect(index.headers.get('cache-control')).toBe(CACHE.pages);
    expect(await index.text()).toContain('<loc>https://starwars.run/sitemap-1.xml</loc>');
    expect(await (await get('/sitemap-1.xml')).text()).toContain(
      '<loc>https://starwars.run/characters/luke-skywalker/</loc>',
    );
    expect((await get('/sitemap-99.xml')).status).toBe(404);
  });
});

describe('search', () => {
  const find = (query: string, section?: Section) =>
    pages.search.search(query, section === undefined ? {} : { section });

  it('finds an article by its name, by a redirect, and by a word of its story', () => {
    expect(find('luke').results[0]?.name).toBe('Luke Skywalker');
    expect(find('farmboy').results[0]?.path).toBe('/characters/luke-skywalker/');
    const story = find('legendary jedi').results.find((r) => r.name === 'Luke Skywalker');
    expect(story?.excerpt.some((run) => run.mark)).toBe(true);
  });

  it('keeps to one section when asked', () => {
    const planets = find('t', 'planets').results;
    expect(planets.length).toBeGreaterThan(0);
    expect(new Set(planets.map((r) => r.section))).toEqual(new Set(['planets']));
  });

  it('suggests a close name when nothing matches', () => {
    const typo = find('tatoine');
    expect(typo.results).toEqual([]);
    expect(typo.didYouMean).toBe('Tatooine');
    expect(find('qqqqzzzz').didYouMean).toBeUndefined();
  });
});

describe('the search page, rendered on request', () => {
  const page = async (query: string) =>
    (await createPagesApp(pages)(new Request(`https://starwars.run/search/${query}`))).text();

  it('lists results with their continuities, and offers Ask for a question', async () => {
    const luke = await page('?q=luke');
    expect(luke).toMatch(/<a href="\/characters\/luke-skywalker\/">Luke Skywalker<\/a>/);
    expect(luke).toContain('data-era="legends"');
    expect(luke).toMatch(/value="luke"/);
    expect(await page('?q=Who+trained+Luke%3F')).toContain(
      'href="/explore/?ask=Who+trained+Luke%3F"',
    );
  });

  it('says so when nothing matches, with a close name to try', async () => {
    const typo = await page('?q=tatoine&section=planets');
    expect(typo).toContain('Nothing in the archive matches');
    expect(typo).toContain('href="/search/?q=Tatooine&amp;section=planets"');
  });

  it('shows the form and a hint without a query', async () => {
    const empty = await page('');
    expect(empty).toContain('<form');
    expect(empty).not.toContain('role="status"');
  });
});
