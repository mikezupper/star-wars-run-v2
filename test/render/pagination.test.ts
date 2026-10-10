import { describe, expect, it } from 'vitest';
import { buildArchive, LETTER_PAGE_SIZE } from '../../src/domain/archive.js';
import { linkGraph } from '../../src/domain/links.js';
import { createSite, sitemaps } from '../../src/render/site.js';
import type { ArticleRecord } from '../../src/domain/article.js';

// More than two pages, with both continuities and a one-letter article owning the old URL.
const articles = new Map<string, ArticleRecord>();
for (let n = 0; n < LETTER_PAGE_SIZE * 2 + 3; n++) {
  const title = n === 0 ? 'U' : `Unknown pilot ${String(n).padStart(4, '0')}`;
  articles.set(title, {
    title,
    era: n % 2 === 0 ? 'canon' : 'legends',
    kind: 'Character',
    fields: [],
    lead: [],
  });
}
const archive = buildArchive(articles.values());
const site = createSite(
  { stylesheet: '/site.css', page: '/page.js' },
  { archive, articles, links: linkGraph(articles.values()) },
);
const get = (path: string) => site.fetch(new Request(`https://starwars.run${path}`));

describe('letter pagination', () => {
  it('lists every article exactly once, with bounded pages and crawlable navigation', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const path = `/characters/letters/u/${page === 1 ? '' : `${String(page)}/`}`;
      const response = await get(path);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(Buffer.byteLength(body)).toBeLessThan(200_000);
      const list = /<ul aria-labelledby="a-to-z">([\s\S]*?)<\/ul>/.exec(body)?.[1] ?? '';
      const paths = [...list.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '');
      expect(paths).toHaveLength(page === 3 ? 3 : LETTER_PAGE_SIZE);
      seen.push(...paths);
      expect(body).toContain('href="/characters/letters/u/3/"');
      expect(body).toContain(`Page ${String(page)} of 3`);
      if (page > 1) expect(body).toContain('rel="prev"');
      if (page < 3) expect(body).toContain('rel="next"');
      expect(site.sitemapPaths).toContain(path);
    }
    expect(seen).toEqual([...archive.byTitle.values()].map((e) => e.path));
    expect(new Set(seen).size).toBe(articles.size);
    expect((await get('/characters/letters/u/4/')).status).toBe(404);
    expect((await get('/characters/u/')).status).toBe(200);
    expect([...sitemaps(site.sitemapPaths).values()].join('')).toContain(
      '/characters/letters/u/3/',
    );
  });

  it('carries each continuity choice without JavaScript or changing canonical page paths', async () => {
    const body = await (await get('/characters/letters/u/2/?era=legends')).text();
    expect(body).toMatch(/<input[^>]*value="legends"[^>]*checked/);
    expect(body).toContain('href="/characters/letters/u/3/?era=legends"');
    expect(body).toContain('href="/characters/letters/u/3/?era=canon"');
    expect(body).toContain('data-pagination-era="both"');
    expect(body).toContain('data-era="canon"');
    expect(body).toContain('data-era="legends"');
    expect(body).toContain('href="https://starwars.run/characters/letters/u/2/"');
    expect(await (await get('/characters/letters/u/?era=bogus')).text()).toMatch(
      /<input[^>]*value="both"[^>]*checked/,
    );
  });
});
