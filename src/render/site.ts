// The route table and the request handler: one function renders every page, and it serves
// both the dev server (per request) and the build (prerendered to files). Pages come from the
// Wookieepedia archive (ADR 0008).
import { html, type ChildValue } from '@gyral/core';
import { renderToStream, renderToString } from '@gyral/ssr';
import type { ArticleRecord } from '../domain/article.js';
import type { Archive } from '../domain/archive.js';
import { SECTIONS } from '../domain/sections.js';
import { absolute } from '../site.js';
import { TEXT } from '../labels.js';
import { articleBody, articleMeta } from './article.js';
import { homeBody, homeMeta } from './home.js';
import { layout, type Assets, type PageMeta } from './layout.js';
import { offlineBody, offlineMeta } from './offline.js';
import { exploreBody, exploreMeta } from './explore.js';
import { sabaccBody, sabaccMeta } from './sabacc.js';
import { searchBody, searchMeta } from './search.js';
import { byLetter, letterBody, letterMeta, sectionBody, sectionMeta } from './section.js';

/** What the site renders: the archive's address book, and each article's content. */
export interface SiteData {
  readonly archive: Archive;
  readonly articles: ReadonlyMap<string, ArticleRecord>;
}

interface Route {
  readonly meta: PageMeta;
  readonly body: () => ChildValue;
}

export interface Site {
  /** Every page, for the prerender step. */
  readonly paths: readonly string[];
  /** The indexable pages (no `noindex`), for the sitemap. */
  readonly sitemapPaths: readonly string[];
  /** A full page Response for a GET; unknown paths get the 404 page. */
  readonly fetch: (request: Request) => Promise<Response>;
  /** The 404 document, written to 404.html. */
  readonly notFound: () => Promise<string>;
}

const notFoundMeta: PageMeta = {
  path: '/404.html',
  title: TEXT.notFoundTitle,
  description: TEXT.notFoundBody,
  noindex: true,
};

const notFoundBody = () => html`
  <h1>${TEXT.notFoundTitle}</h1>
  <p>${TEXT.notFoundBody}</p>
  <p><a href="/">${TEXT.notFoundHome}</a>, or <a href="/search/">${TEXT.notFoundSearch}</a>.</p>
`;

const HTML = { 'content-type': 'text/html; charset=utf-8' };

/** Paths always end with a slash; `/characters` and `/characters/` are the same page. */
export const normalise = (pathname: string): string =>
  pathname.endsWith('/') ? pathname : `${pathname}/`;

export function createSite(assets: Assets, { archive, articles }: SiteData): Site {
  const table = new Map<string, Route>([
    ['/', { meta: homeMeta, body: () => homeBody(archive) }],
    [searchMeta.path, { meta: searchMeta, body: searchBody }],
    [offlineMeta.path, { meta: offlineMeta, body: offlineBody }],
    [sabaccMeta.path, { meta: sabaccMeta, body: sabaccBody }],
    [exploreMeta.path, { meta: exploreMeta, body: exploreBody }],
  ]);
  for (const section of SECTIONS) {
    // Every section has a page, even an empty one: the header links to all of them.
    const entries = archive.bySection.get(section) ?? [];
    const letters = byLetter(entries);
    const meta = sectionMeta(section, entries.length);
    table.set(meta.path, { meta, body: () => sectionBody(section, letters) });
    for (const [letter, inLetter] of letters) {
      const lm = letterMeta(section, letter, inLetter.length);
      table.set(lm.path, { meta: lm, body: () => letterBody(section, letter, inLetter) });
    }
    for (const entry of entries) {
      const record = articles.get(entry.title);
      if (record === undefined) continue;
      table.set(entry.path, {
        meta: articleMeta(entry),
        body: () => articleBody(entry, record, archive),
      });
    }
  }

  const notFound = async () => renderToString(layout(notFoundMeta, notFoundBody(), assets));

  return {
    paths: [...table.keys()],
    sitemapPaths: [...table].filter(([, r]) => r.meta.noindex !== true).map(([path]) => path),
    notFound,
    async fetch(request) {
      const route = table.get(normalise(new URL(request.url).pathname));
      if (route === undefined) {
        return new Response(await notFound(), { status: 404, headers: HTML });
      }
      return new Response(renderToStream(layout(route.meta, route.body(), assets)), {
        headers: HTML,
      });
    },
  };
}

/** The sitemap protocol's limit: at most 50,000 URLs in one file. */
export const SITEMAP_MAX = 50_000;

/**
 * Every indexable path as sitemap files: `sitemap.xml` is an index of `sitemap-1.xml`,
 * `sitemap-2.xml`…, each holding up to `max` URLs. The full archive needs five; a sample build
 * has the same shape with one, so what the gate tests is what production ships.
 */
export function sitemaps(paths: readonly string[], max = SITEMAP_MAX): ReadonlyMap<string, string> {
  const files = new Map<string, string>();
  for (let i = 0; i === 0 || i * max < paths.length; i++) {
    files.set(
      `sitemap-${String(i + 1)}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths
  .slice(i * max, (i + 1) * max)
  .map((p) => `  <url><loc>${absolute(p)}</loc></url>`)
  .join('\n')}
</urlset>
`,
    );
  }
  const index = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...files.keys()].map((f) => `  <sitemap><loc>${absolute(`/${f}`)}</loc></sitemap>`).join('\n')}
</sitemapindex>
`;
  return new Map([['sitemap.xml', index], ...files]);
}
