import { describe, expect, it } from 'vitest';
import { buildArchive } from '../src/domain/archive.js';
import { wookieepediaUrl } from '../src/domain/attribution.js';
import { THEME_SCRIPT } from '../src/domain/theme.js';
import { bestKnown } from '../src/domain/known.js';
import { fullTitle } from '../src/render/layout.js';
import { createSite, normalise, RANDOM_PATH, sitemaps } from '../src/render/site.js';
import { absolute, ORIGIN, SITE_NAME } from '../src/site.js';
import { FIXTURE_TITLES, fixtureSiteData } from './fixtures/archive.js';
import { links, linkTo } from './fixtures/html.js';

const data = fixtureSiteData();
const site = createSite(
  {
    stylesheet: '/assets/site.css',
    page: '/assets/page.js',
    components: {
      loader: '/assets/components.js',
      preload: ['/assets/core.js'],
      modules: [['swr-explore', { preload: ['/assets/explore.js'], stylesheets: [] }]],
    },
  },
  data,
);
const UNLISTED = ['/search/', '/offline/'];
const get = (path: string) => site.fetch(new Request(new URL(path, ORIGIN)));
/**
 * Gyral 0.3 renders development output under Vitest: `<!--gyral:ID-->` and `<!---->` markers
 * around template parts, for hydration. Production output (`pnpm build`) has none, so the page
 * is checked without them; any other comment would still show.
 */
const DEV_MARKERS = /<!--(?:gyral:[a-z0-9]+)?-->/g;
const html = async (path: string) =>
  (await get(path)).text().then((t) => t.replace(DEV_MARKERS, ''));
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
        if (href === undefined || href === '/manifest.webmanifest' || href === RANDOM_PATH)
          continue;
        if (href.startsWith('/assets/') || href.startsWith('/icons/')) continue;
        if (!paths.has(href)) broken.push(`${page} → ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('loads components only where their tags render, alongside the every-page script', () => {
    for (const [page, body] of pages) {
      const scripts = [...body.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
      expect(scripts, page).toEqual(
        page === '/explore/' ? ['/assets/page.js', '/assets/components.js'] : ['/assets/page.js'],
      );
      expect(body.includes('rel="modulepreload"'), page).toBe(page === '/explore/');
      if (page === '/explore/') {
        expect(body).toContain('href="/assets/explore.js"');
        expect(body).toContain('href="/assets/core.js"');
      }
    }
  });

  it('has a unique title and description, and a canonical URL with a trailing slash', () => {
    const indexed = [...pages].filter(([page]) => !UNLISTED.includes(page));
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const [page, body] of indexed) {
      titles.add(/<title>([^<]*)<\/title>/.exec(body)?.[1] ?? '');
      descriptions.add(/<meta name="description" content="([^"]*)"/.exec(body)?.[1] ?? '');
      expect(body, page).toContain(`<link rel="canonical" href="${absolute(page)}">`);
    }
    expect(titles.size).toBe(indexed.length);
    expect(descriptions.size).toBe(indexed.length);
  });

  it('has exactly one h1 and one main, and credits Wookieepedia in the footer', () => {
    for (const [page, body] of pages) {
      expect(body.match(/<h1[\s>]/g), page).toHaveLength(1);
      expect(body.match(/<main[\s>]/g), page).toHaveLength(1);
      expect(links(body).find((l) => l.text === 'Wookieepedia')?.rel, page).toBe('external');
    }
  });
});

describe('the home page', () => {
  const home = pages.get('/') ?? '';

  it('leads with a question box that asks on the Explore page', () => {
    expect(home).toMatch(/<form(?=[^>]*action="\/explore\/")(?=[^>]*method="get")[^>]*>/);
    expect(home).toMatch(/<input[^>]*name="ask"/);
  });

  it('ranks the best-known characters, one row per name, canon article first', () => {
    const best = bestKnown(data.archive, data.links, 'characters');
    expect(best.length).toBeGreaterThan(0);
    expect(best.map((k) => k.links)).toEqual(best.map((k) => k.links).sort((a, b) => b - a));
    expect(new Set(best.map((k) => k.name)).size).toBe(best.length);
    const luke = best.find((k) => k.name === 'Luke Skywalker');
    expect(luke?.entries.map((e) => e.era)).toEqual(['canon', 'legends']);
    const ranking = home.slice(home.indexOf('aria-labelledby="best-known"'));
    expect(ranking).toContain(`href="${pathOf('Luke Skywalker')}">Luke Skywalker</a>`);
    expect(ranking).toMatch(/Canon · Legends/);
  });

  it('counts a canon article and its named Legends twin once, under the canon name', () => {
    const archive = buildArchive([
      { title: 'Darth Sidious', era: 'canon', kind: 'Character', counterpart: 'Palpatine' },
      { title: 'Palpatine', era: 'legends', kind: 'Character' },
      { title: 'Yoda', era: 'canon', kind: 'Character' },
    ]);
    const counts = new Map([
      ['Palpatine', 9],
      ['Darth Sidious', 5],
      ['Yoda', 7],
    ]);
    const best = bestKnown(archive, { counts, linkedFrom: new Map() }, 'characters');
    expect(best.map((k) => [k.name, k.links, k.entries.map((e) => e.title)])).toEqual([
      ['Darth Sidious', 9, ['Darth Sidious', 'Palpatine']],
      ['Yoda', 7, ['Yoda']],
    ]);
  });

  it('jumps to a random article, never cached', async () => {
    const res = await get('/random/');
    expect(res.status).toBe(302);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(site.paths).toContain(res.headers.get('location'));
    expect(home).toContain('href="/random/"');
  });

  it('has a card for every section, with its count', () => {
    const cards = home.slice(home.indexOf('aria-labelledby="home-sections"'));
    expect(cards).toContain('href="/characters/"');
    expect(cards).toMatch(/<data value="\d+">/);
  });
});

describe('the theme', () => {
  it('applies a saved pick before the stylesheet, with the script exactly as hashed', () => {
    for (const page of [pages.get('/'), pages.get('/characters/')]) {
      const head = page?.slice(0, page.indexOf('</head>')) ?? '';
      expect(head).toContain(`<script>${THEME_SCRIPT}</script>`);
      expect(head.indexOf(THEME_SCRIPT)).toBeLessThan(head.indexOf('rel="stylesheet"'));
      expect(head.match(/data-gyral-head=/g)).toHaveLength(1);
      expect(head).toMatch(/<meta name="theme-color" media="\(prefers-color-scheme: dark\)"/);
    }
  });

  it('puts a toggle in every header and its panel, hidden until its script runs', () => {
    for (const [path, page] of pages) {
      const header = page.slice(page.indexOf('<header>'), page.indexOf('</header>'));
      const toggles = header.match(
        /<button[^>]*aria-pressed="false"[^>]*data-theme-toggle[^>]*hidden/g,
      );
      expect(toggles, path).toHaveLength(2);
    }
  });
});

describe('the header', () => {
  it('is one row: name, search, Ask, and a Sections panel that holds every section and Sabacc', () => {
    const page = pages.get('/characters/') ?? '';
    const header = page.slice(page.indexOf('<header>'), page.indexOf('</header>'));
    expect(header).toMatch(/<button type="button" popovertarget="site-sections">/);
    const panel = header.slice(header.indexOf('id="site-sections"'));
    expect(panel).toContain('href="/sabacc/"');
    expect(panel).toMatch(/href="\/characters\/" aria-current="page"/);
    expect(header).toContain('id="site-search-q"');
    expect(header).toContain('<a href="/search/" aria-label="Search">');
  });

  it('leaves search out of the header on the search page itself', () => {
    const page = pages.get('/search/') ?? '';
    const header = page.slice(page.indexOf('<header>'), page.indexOf('</header>'));
    expect(header).not.toContain('site-search-q');
    expect(header).not.toContain('href="/search/"');
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
    expect(legends).toContain('<h1>Luke Skywalker</h1>');
    expect(legends).toContain('part of Legends');
    expect(luke).not.toContain('part of Legends');
  });

  it('open with a title block: the kind, the era, the other version and the link count', () => {
    const header = luke.slice(
      luke.indexOf('<article>'),
      luke.indexOf('</header>', luke.indexOf('<article>')),
    );
    expect(header).toMatch(/<p>Character<\/p>/);
    expect(header).toContain('<span data-era="canon">Canon</span>');
    expect(header).toMatch(
      /<a href="\/characters\/luke-skywalker-legends\/" data-era="legends"\s*>Legends version →<\/a/,
    );
    expect(header).toMatch(/Linked from \d+ articles?/);
    const legends = pages.get('/characters/luke-skywalker-legends/') ?? '';
    expect(legends).toMatch(
      /<a href="\/characters\/luke-skywalker\/" data-era="canon"\s*>Canon version →/,
    );
  });

  it('repeat the first facts under the title for phones, hidden from assistive tech, unlinked', () => {
    const strip = luke.slice(
      luke.indexOf('<dl aria-hidden="true"'),
      luke.indexOf('</dl>', luke.indexOf('<dl aria-hidden="true"')),
    );
    expect(strip).toContain('<dt>Homeworld</dt>');
    expect(strip).toContain('<dd>Tatooine</dd>');
    expect(strip).not.toContain('<a ');
    expect(strip.match(/<dt>/g)).toHaveLength(4);
  });

  it('list the best-known articles that link to them', () => {
    const section = luke.slice(luke.indexOf('aria-labelledby="linked-from"'));
    const linkers = data.links.linkedFrom.get('Luke Skywalker') ?? [];
    expect(linkers.length).toBeGreaterThan(0);
    for (const title of linkers.filter((t) => data.archive.byTitle.has(t)))
      expect(section).toContain(`href="${pathOf(title)}"`);
  });

  it('carry no search-index markup: search reads the data, not the pages (ADR 0011)', () => {
    for (const [page, body] of pages) expect(body, page).not.toContain('data-pagefind');
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

  it('rank the best known, one row per subject, marked by continuity for the filter', () => {
    const characters = pages.get('/characters/') ?? '';
    const ranking = characters.slice(characters.indexOf('aria-labelledby="best-known"'));
    expect(ranking).toMatch(
      /<li data-era="both">\s*<a href="\/characters\/luke-skywalker\/">Luke Skywalker<\/a>/,
    );
    expect(ranking.match(/>Luke Skywalker</g)).toHaveLength(1);
    const l = pages.get('/characters/l/') ?? '';
    expect(l).toMatch(/<li data-era="legends">\s*<a href="\/characters\/luke-skywalker-legends\/"/);
  });

  it('offer a continuity filter that needs no script, and list the section’s kinds', () => {
    for (const path of ['/characters/', '/characters/l/']) {
      const page = pages.get(path) ?? '';
      expect(page, path).toContain('<fieldset data-era-filter>');
      expect(page.match(/<input type="radio" name="era"/g), path).toHaveLength(3);
    }
    expect(pages.get('/characters/')).toMatch(/<ul aria-label="Kinds">[\s\S]*Character <data/);
  });
});

describe('Sabacc', () => {
  it('is linked from every page header', () => {
    for (const [page, body] of pages)
      expect(body, page).toMatch(/<a href="\/sabacc\/"[^>]*>Sabacc<\/a>/);
  });

  it('describes the game and links to each way to play and to the rules', () => {
    const sabacc = pages.get('/sabacc/') ?? '';
    expect(linkTo(sabacc, 'https://sabacc.starwars.run/')).toEqual({
      href: 'https://sabacc.starwars.run/',
      rel: 'external',
      text: 'Play in your browser',
    });
    expect(linkTo(sabacc, 'https://sabacc.starwars.run/3d.html')).toMatchObject({
      rel: 'external',
      text: 'Play in 3D',
    });
    expect(sabacc).toContain('up to five players');
    expect(linkTo(sabacc, 'https://sabacc.starwars.run/#rules')).toMatchObject({
      rel: 'external',
      text: 'Read the rules',
    });
    expect(site.sitemapPaths).toContain('/sabacc/');
  });
});

describe('helpers', () => {
  it('normalises paths, titles and sitemaps', () => {
    expect(normalise('/characters')).toBe('/characters/');
    expect(fullTitle({ path: '/', title: 'Home' })).toBe('Home');
    expect(fullTitle({ path: '/media/', title: 'Media' })).toBe(`Media · ${SITE_NAME}`);
  });

  it('splits the sitemap into parts under an index, at most `max` URLs a part', () => {
    const files = sitemaps(['/', '/media/', '/planets/'], 2);
    expect([...files.keys()]).toEqual(['sitemap.xml', 'sitemap-1.xml', 'sitemap-2.xml']);
    expect(files.get('sitemap.xml')).toContain(
      `<sitemap><loc>${absolute('/sitemap-2.xml')}</loc></sitemap>`,
    );
    expect(files.get('sitemap-1.xml')).toContain(`<loc>${absolute('/media/')}</loc>`);
    expect(files.get('sitemap-2.xml')).toContain(`<loc>${absolute('/planets/')}</loc>`);
    expect(files.get('sitemap-2.xml')).not.toContain('/media/');
    // Nothing to list still makes a valid, empty part: the index never points nowhere.
    expect([...sitemaps([]).keys()]).toEqual(['sitemap.xml', 'sitemap-1.xml']);
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
