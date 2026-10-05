import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/data/load.js';
import { KINDS } from '../src/domain/records.js';
import { fullTitle } from '../src/render/layout.js';
import { createSite, normalise, sitemap } from '../src/render/site.js';
import { absolute, ORIGIN, SITE_NAME } from '../src/site.js';

const STYLESHEET = '/assets/site.css';
const UNLISTED = ['/search/', '/offline/'];
const data = await loadDataset();
const site = createSite(
  { stylesheet: STYLESHEET, clientEntry: '/assets/entry.js', page: '/assets/page.js' },
  data,
);
const get = (path: string) => site.fetch(new Request(new URL(path, ORIGIN)));
const html = async (path: string) => (await get(path)).text();

// Every page, rendered once and shared by the checks below.
const pages = new Map(
  await Promise.all(site.paths.map(async (path) => [path, await html(path)] as const)),
);

describe('route table', () => {
  it('has home, a list page per kind and a page per record', () => {
    const records = KINDS.reduce((n, kind) => n + data[kind].length, 0);
    // Home, search, offline, a list per kind, a page per record.
    expect(site.paths).toHaveLength(3 + KINDS.length + records);
    expect(site.paths).toContain('/');
    expect(site.paths).toContain('/people/');
    expect(site.paths).toContain('/people/luke-skywalker/');
    // Search and offline have no content of their own: noindex, and not in the sitemap.
    expect(site.sitemapPaths).toEqual(site.paths.filter((p) => !UNLISTED.includes(p)));
  });

  it('serves every path with status 200 as HTML', async () => {
    const response = await get('/planets/tatooine/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  it('treats a path without its trailing slash as the same page', async () => {
    expect(await html('/people/luke-skywalker')).toBe(pages.get('/people/luke-skywalker/'));
  });

  it('answers unknown paths with a noindex 404 page', async () => {
    const response = await get('/people/jar-jar-abrams/');
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain('<meta name="robots" content="noindex">');
    expect(body).toContain(`Page not found · ${SITE_NAME}`);
    expect(await site.notFound()).toContain('Page not found');
  });
});

describe('every page', () => {
  it('links only to pages that exist, or to built assets', () => {
    const paths = new Set(site.paths);
    const broken: string[] = [];
    for (const [page, body] of pages) {
      for (const [, href] of body.matchAll(/href="(\/[^"]*)"/g)) {
        if (
          href === undefined ||
          href === '/manifest.webmanifest' ||
          href.startsWith('/assets/') ||
          href.startsWith('/icons/')
        )
          continue;
        if (!paths.has(href)) broken.push(`${page} → ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('ships only the search shortcut, plus the island entry where there are islands', () => {
    for (const [page, body] of pages) {
      const scripts = [...body.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
      expect(scripts, page).toEqual(
        page === '/search/' ? ['/assets/page.js', '/assets/entry.js'] : ['/assets/page.js'],
      );
      expect(body.match(/<script/g), page).toHaveLength(scripts.length);
    }
  });

  it('has a search form in the header that works without JavaScript, except on /search/', () => {
    for (const [page, body] of pages) {
      if (page === '/search/') expect(body).not.toContain('id="site-search-q"');
      else expect(body, page).toContain('<form action="/search/" method="get">');
    }
  });

  it('has a unique title and description, and a canonical URL with a trailing slash', () => {
    const indexed = [...pages].filter(([page]) => !UNLISTED.includes(page));
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const [page, body] of indexed) {
      const title = /<title>([^<]*)<\/title>/.exec(body)?.[1];
      const description = /<meta name="description" content="([^"]*)">/.exec(body)?.[1];
      expect(title, page).toBeDefined();
      expect(description, page).toBeDefined();
      titles.add(title ?? '');
      descriptions.add(description ?? '');
      expect(body, page).toContain(`<link rel="canonical" href="${absolute(page)}">`);
    }
    expect(titles.size).toBe(indexed.length);
    expect(descriptions.size).toBe(indexed.length);
  });

  it('has exactly one h1 and one main', () => {
    for (const [page, body] of pages) {
      expect(body.match(/<h1[\s>]/g), page).toHaveLength(1);
      expect(body.match(/<main[\s>]/g), page).toHaveLength(1);
    }
  });
});

describe('search indexing', () => {
  it('indexes record pages only, each filterable by its kind', () => {
    for (const [page, body] of pages) {
      const kind = /^\/(\w+)\/[^/]+\/$/.exec(page)?.[1];
      if (kind !== undefined) {
        expect(body, page).toContain(`data-pagefind-filter="kind:${kind}"`);
      } else {
        expect(body, page).not.toContain('data-pagefind-body');
      }
    }
  });

  it('ranks a record by its own name above pages that only link to it', () => {
    const luke = pages.get('/people/luke-skywalker/') ?? '';
    expect(luke).toContain('<h1 data-pagefind-weight="10">Luke Skywalker</h1>');
    expect(luke).toContain('data-pagefind-weight="0.1"');
  });
});

describe('record pages', () => {
  it('link Luke to Tatooine, and Tatooine back to Luke', () => {
    expect(pages.get('/people/luke-skywalker/')).toContain(
      '<a href="/planets/tatooine/">Tatooine</a>',
    );
    expect(pages.get('/planets/tatooine/')).toContain(
      '<a href="/people/luke-skywalker/">Luke Skywalker</a>',
    );
  });

  it("show a planet's native species, which the source only gives from the species side", () => {
    const wookiee = data.species.find((s) => s.homeworld === 'kashyyyk');
    expect(wookiee).toBeDefined();
    const kashyyyk = pages.get('/planets/kashyyyk/') ?? '';
    expect(kashyyyk).toContain('<h2 id="nativeSpecies" data-pagefind-ignore>Native species</h2>');
    expect(kashyyyk).toContain(`<a href="/species/${wookiee?.slug ?? ''}/">`);
  });

  it('show known facts with units, and leave unknown ones out', () => {
    const luke = pages.get('/people/luke-skywalker/') ?? '';
    expect(luke).toContain('<dt>Height</dt> <dd><data value="172">172 cm</data></dd>');
    const yoda = pages.get('/people/yoda/') ?? '';
    expect(yoda).not.toContain('<dt>Homeworld</dt>');
  });

  it('show a film with its episode, release date, crawl and cited title', () => {
    const film = pages.get('/films/a-new-hope/') ?? '';
    expect(film).toContain('<dt>Episode</dt> <dd>IV</dd>');
    expect(film).toContain('<time datetime="1977-05-25">May 25, 1977</time>');
    expect(film).toContain('<h2 id="crawl" data-pagefind-ignore>Opening crawl</h2>');
    expect(pages.get('/films/')).toContain('<cite>A New Hope</cite>');
  });

  it('show crew ranges and starship-only facts', () => {
    const corvette = pages.get('/starships/cr90-corvette/') ?? '';
    expect(corvette).toContain('<data value="30-165">30–165</data>');
    expect(corvette).toContain('<dt>Hyperdrive rating</dt>');
    expect(pages.get('/vehicles/snowspeeder/')).not.toContain('<dt>Hyperdrive rating</dt>');
  });

  it('mark their section current in the nav and carry a breadcrumb', () => {
    const luke = pages.get('/people/luke-skywalker/') ?? '';
    expect(luke).toContain('<a href="/people/" aria-current="true">People</a>');
    expect(luke).toContain('<li aria-current="page">Luke Skywalker</li>');
    expect(pages.get('/people/')).toContain('<a href="/people/" aria-current="page">People</a>');
  });
});

describe('list pages', () => {
  it('list films in release order and everything else alphabetically', () => {
    const films = pages.get('/films/') ?? '';
    expect(films).toContain('<ol>');
    expect(films.indexOf('A New Hope')).toBeLessThan(films.indexOf('The Phantom Menace'));
    const people = pages.get('/people/') ?? '';
    expect(people.indexOf('Ackbar')).toBeLessThan(people.indexOf('Yoda'));
  });
});

describe('normalise', () => {
  it('adds a trailing slash once', () => {
    expect(normalise('/people')).toBe('/people/');
    expect(normalise('/people/')).toBe('/people/');
  });
});

describe('fullTitle', () => {
  it('appends the site name everywhere but home', () => {
    expect(fullTitle({ path: '/', title: 'Home' })).toBe('Home');
    expect(fullTitle({ path: '/films/', title: 'Films' })).toBe(`Films · ${SITE_NAME}`);
  });
});

describe('sitemap', () => {
  it('lists absolute URLs on the canonical origin', () => {
    const xml = sitemap(['/', '/films/']);
    expect(xml).toContain(`<loc>${absolute('/')}</loc>`);
    expect(xml).toContain('<loc>https://starwars.run/films/</loc>');
  });
});

describe('offline page', () => {
  it('says the reader is offline and links to what still works', () => {
    const offline = pages.get('/offline/') ?? '';
    expect(offline).toContain('<meta name="robots" content="noindex">');
    expect(offline).toContain('href="/search/"');
    expect(offline).toContain('href="/people/"');
  });

  it('is linked from every page head through the web manifest', () => {
    for (const [page, body] of pages) {
      expect(body, page).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    }
  });
});
