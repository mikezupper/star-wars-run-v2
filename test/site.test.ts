import { describe, expect, it } from 'vitest';
import { createSite, normalise, sitemap } from '../src/render/site.js';
import { fullTitle } from '../src/render/layout.js';
import { absolute, ORIGIN, SITE_NAME } from '../src/site.js';

const site = createSite({ stylesheet: '/assets/site.css' });
const get = (path: string) => site.fetch(new Request(new URL(path, ORIGIN)));

describe('route table', () => {
  it('lists the home page for prerendering and the sitemap', () => {
    expect(site.paths).toContain('/');
    expect(site.sitemapPaths).toContain('/');
  });

  it('renders the home page with its title, canonical link and stylesheet', async () => {
    const response = await get('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const html = await response.text();
    expect(html).toContain(`<title>${SITE_NAME}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/">`);
    expect(html).toContain('href="/assets/site.css"');
  });

  it('answers unknown paths with a noindex 404 page', async () => {
    const response = await get('/no-such-page/');
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain(`Page not found · ${SITE_NAME}`);
  });

  it('writes the same 404 document for the static build', async () => {
    expect(await site.notFound()).toContain('Page not found');
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
