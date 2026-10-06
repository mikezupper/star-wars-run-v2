import { describe, expect, it } from 'vitest';
import { wookieepediaUrl } from '../src/domain/attribution.js';
import { fullTitle } from '../src/render/layout.js';
import { createSite, normalise, sitemap } from '../src/render/site.js';
import { absolute, ORIGIN, SITE_NAME } from '../src/site.js';
import { FIXTURE_TITLES, fixtureSiteData } from './fixtures/archive.js';

const data = fixtureSiteData();
const site = createSite(
  { stylesheet: '/assets/site.css', clientEntry: '/assets/entry.js', page: '/assets/page.js' },
  data,
);
const UNLISTED = ['/search/', '/offline/'];
const get = (path: string) => site.fetch(new Request(new URL(path, ORIGIN)));
const html = async (path: string) => (await get(path)).text();
const pages = new Map(
  await Promise.all(site.paths.map(async (path) => [path, await html(path)] as const)),
);
const pathOf = (title: string) => data.archive.pathOf(title) ?? '';

describe('route table', () => {
  it('has home, search, offline, each section with letters, and a page per article', () => {
    expect(site.paths).toContain('/');
    expect(site.paths).toContain('/characters/');
    expect(site.paths).toContain('/characters/l/');
    for (const title of Object.values(FIXTURE_TITLES)) expect(site.paths).toContain(pathOf(title));
    expect(pathOf('Luke Skywalker')).toBe('/characters/luke-skywalker/');
    expect(pathOf('Luke Skywalker/Legends')).toBe('/characters/luke-skywalker-legends/');
    expect(pathOf('Tatooine')).toBe('/planets/tatooine/');
    expect(pathOf('Star Wars: Episode IV A New Hope')).toBe(
      '/media/star-wars-episode-iv-a-new-hope/',
    );
    expect(site.sitemapPaths).toEqual(site.paths.filter((p) => !UNLISTED.includes(p)));
  });

  it('gives every section a page, even an empty one, since the header links to all', () => {
    expect(site.paths).toContain('/lore/');
  });

  it('treats a path without its trailing slash as the same page', async () => {
    expect(await html('/characters/luke-skywalker')).toBe(pages.get('/characters/luke-skywalker/'));
  });

  it('answers unknown paths with a noindex 404 page', async () => {
    const response = await get('/characters/jar-jar-abrams/');
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
        if (href === undefined || href === '/manifest.webmanifest') continue;
        if (href.startsWith('/assets/') || href.startsWith('/icons/')) continue;
        if (!paths.has(href)) broken.push(`${page} → ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('ships only the every-page script, plus the island entry on /search/ and /explore/', () => {
    for (const [page, body] of pages) {
      const scripts = [...body.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
      expect(scripts, page).toEqual(
        ['/search/', '/explore/'].includes(page)
          ? ['/assets/page.js', '/assets/entry.js']
          : ['/assets/page.js'],
      );
    }
  });

  it('has a unique title and description, and a canonical URL with a trailing slash', () => {
    const indexed = [...pages].filter(([page]) => !UNLISTED.includes(page));
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const [page, body] of indexed) {
      titles.add(/<title>([^<]*)<\/title>/.exec(body)?.[1] ?? '');
      descriptions.add(/<meta name="description" content="([^"]*)">/.exec(body)?.[1] ?? '');
      expect(body, page).toContain(`<link rel="canonical" href="${absolute(page)}">`);
    }
    expect(titles.size).toBe(indexed.length);
    expect(descriptions.size).toBe(indexed.length);
  });

  it('has exactly one h1 and one main, and credits Wookieepedia in the footer', () => {
    for (const [page, body] of pages) {
      expect(body.match(/<h1[\s>]/g), page).toHaveLength(1);
      expect(body.match(/<main[\s>]/g), page).toHaveLength(1);
      expect(body, page).toContain('rel="external">Wookieepedia</a>');
    }
  });
});

describe('article pages', () => {
  const luke = pages.get('/characters/luke-skywalker/') ?? '';

  it('show the lead with links to other archive pages, and links to absent ones as text', () => {
    expect(luke).toMatch(/Luke Skywalker, a Force-sensitive human male/);
    expect(luke).toContain(`<a href="${pathOf('Galactic Empire')}">`);
    expect(luke).toContain(`<a href="${pathOf('Han Solo')}">Han Solo</a>`);
  });

  it('show the infobox facts, one dd per listed item', () => {
    expect(luke).toContain('<dt>Homeworld</dt>');
    expect(luke).toContain(`<dd><a href="${pathOf('Tatooine')}">Tatooine</a></dd>`);
    expect(luke).toMatch(
      /<dt>Hair<\/dt>\s*<dd>Blond \(1 BBY\)<\/dd>\s*<dd>Ash-brown \(21 ABY\)<\/dd>/,
    );
  });

  it('credit the source article under CC BY-SA 3.0, on every article page', () => {
    for (const title of Object.values(FIXTURE_TITLES)) {
      const body = pages.get(pathOf(title)) ?? '';
      expect(body, title).toContain(`href="${wookieepediaUrl(title)}"`);
      expect(body, title).toContain('Modified for this site.');
    }
  });

  it('mark Legends articles in the title, heading and a note', () => {
    const legends = pages.get('/characters/luke-skywalker-legends/') ?? '';
    expect(legends).toContain('<title>Luke Skywalker (Legends) · starwars.run</title>');
    expect(legends).toContain('<h1 data-pagefind-weight="10">Luke Skywalker</h1>');
    expect(legends).toContain('part of Legends');
    expect(luke).not.toContain('part of Legends');
  });

  it('are indexed for search, filterable by section; other pages are not', () => {
    for (const [page, body] of pages) {
      const entry = [...data.archive.byTitle.values()].find((e) => e.path === page);
      if (entry !== undefined)
        expect(body, page).toContain(`data-pagefind-filter="kind:${entry.section}"`);
      else expect(body, page).not.toContain('data-pagefind-body');
    }
  });
});

describe('section and letter pages', () => {
  it('list letters with counts, and each letter its articles, Legends marked', () => {
    const characters = pages.get('/characters/') ?? '';
    expect(characters).toContain('<a href="/characters/l/">L</a>');
    const l = pages.get('/characters/l/') ?? '';
    expect(l).toContain(`<a href="${pathOf('Luke Skywalker')}">Luke Skywalker</a>`);
    expect(l).toMatch(/Luke Skywalker <small>Legends<\/small>/);
    expect(pages.get('/')).toContain('<a href="/characters/">Characters</a>');
  });
});

describe('Sabacc', () => {
  it('is linked from every page header', () => {
    for (const [page, body] of pages)
      expect(body, page).toMatch(/<a href="\/sabacc\/"[^>]*>Sabacc<\/a>/);
  });

  it('describes the game and links to each way to play and to the rules', () => {
    const sabacc = pages.get('/sabacc/') ?? '';
    expect(sabacc).toContain(
      '<a href="https://sabacc.starwars.run/" rel="external">Play in your browser</a>',
    );
    expect(sabacc).toContain(
      '<a href="https://sabacc.starwars.run/3d.html" rel="external">Play in 3D</a>',
    );
    expect(sabacc).toContain('up to five players');
    expect(sabacc).toContain(
      '<a href="https://sabacc.starwars.run/#rules" rel="external">Read the rules</a>',
    );
    expect(site.sitemapPaths).toContain('/sabacc/');
  });
});

describe('helpers', () => {
  it('normalises paths, titles and sitemaps', () => {
    expect(normalise('/characters')).toBe('/characters/');
    expect(fullTitle({ path: '/', title: 'Home' })).toBe('Home');
    expect(fullTitle({ path: '/media/', title: 'Media' })).toBe(`Media · ${SITE_NAME}`);
    expect(sitemap(['/', '/media/'])).toContain(`<loc>${absolute('/media/')}</loc>`);
  });
});

describe('appearances', () => {
  const luke = () => pages.get(pathOf('Luke Skywalker')) ?? '';
  const newHope = () => pages.get(pathOf('Star Wars: Episode IV A New Hope')) ?? '';

  it('lists the works an article appears in, linking those the archive has, with markers', () => {
    expect(luke()).toContain('<h2 id="appearances">Appearances</h2>');
    expect(luke()).toMatch(
      /<cite><a href="\/media\/star-wars-episode-iv-a-new-hope\/">Star Wars: Episode IV A New Hope<\/a><\/cite>\s*<small>\(first appearance\)<\/small>/,
    );
    expect(luke()).toContain('<cite>Kanan 2</cite>');
    expect(luke()).toContain('Non-canon appearances');
  });

  it('starts a long list closed', () => {
    expect(luke()).toMatch(/<details>\s*<summary>\d{3} works, in story order<\/summary>/);
  });

  it('lists who and what turns up in a work, by section, instead of works', () => {
    expect(newHope()).toContain('<h2 id="cast">Who turns up here</h2>');
    expect(newHope()).not.toContain('id="appearances"');
    expect(newHope()).toMatch(/<summary>Characters: \d+<\/summary>/);
    expect(newHope()).toMatch(
      /<a href="\/characters\/luke-skywalker\/">Luke Skywalker<\/a>\s*<small>\(first appearance\)<\/small>/,
    );
    expect(newHope()).toContain('<a href="/planets/tatooine/">Tatooine</a>');
    expect(newHope()).toMatch(/<summary>Not in the archive: [\d,]+<\/summary>/);
  });

  it('leaves pages without appearances alone', () => {
    expect(pages.get(pathOf('Revan'))).not.toContain('id="appearances"');
  });
});
