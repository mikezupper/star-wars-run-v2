// Pages rendered on request (ADR 0011): every path that isn't a static file or /api/ comes here.
// The same URL rules the static site had, now in code: `/x` redirects to `/x/` when that page
// exists, an unknown path gets the 404 page. A page changes only with the data or the code, so
// its ETag names both and a revisit costs a 304; Cache-Control lets Cloudflare hold pages for a
// week. The sitemaps come from here too: the images carry no data (ADR 0003), so the site
// image has none to serve.
import type { Assets } from '../render/layout.js';
import { CACHE } from '../hosting/headers.js';
import { createSite, normalise, RANDOM_PATH, sitemaps } from '../render/site.js';
import type { Pages } from './pages.js';

const HTML = 'text/html; charset=utf-8';
const SITEMAP = /^\/sitemap(?:-\d+)?\.xml$/;

/**
 * What the running code brings, when it isn't the build that wrote the data: the API's image
 * (scripts/api.ts) names its own CSS and JS, which the site image beside it serves, and an id
 * for its bundle. The data may come from another build, so its stamped assets are only a fallback.
 */
export interface PagesCode {
  readonly assets?: Assets;
  readonly id?: string;
}

export function createPagesApp(
  pages: Pages,
  code: PagesCode = {},
): (request: Request) => Promise<Response> {
  const site = createSite(code.assets ?? pages.meta.assets, pages.data);
  const known = new Set(site.paths);
  const etag = `W/"${pages.meta.build}${code.id === undefined ? '' : `-${code.id}`}"`;
  let maps: ReadonlyMap<string, string> | undefined;
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Only GET and HEAD.', { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
    if (SITEMAP.test(url.pathname)) {
      maps ??= sitemaps(site.sitemapPaths);
      const xml = maps.get(url.pathname.slice(1));
      if (xml !== undefined) {
        return new Response(request.method === 'HEAD' ? null : xml, {
          headers: { 'content-type': 'application/xml', 'cache-control': CACHE.pages, etag },
        });
      }
    }
    if (normalise(url.pathname) === RANDOM_PATH) return site.fetch(request);
    const redirect = site.redirects.get(normalise(url.pathname));
    if (redirect !== undefined) {
      return new Response(null, {
        status: 308,
        headers: { location: `${redirect}${url.search}`, 'cache-control': CACHE.pages },
      });
    }
    if (!url.pathname.endsWith('/') && known.has(normalise(url.pathname))) {
      return new Response(null, {
        status: 308,
        headers: { location: `${normalise(url.pathname)}${url.search}` },
      });
    }
    if (!known.has(url.pathname)) {
      return new Response(await site.notFound(), {
        status: 404,
        headers: { 'content-type': HTML, 'cache-control': CACHE.notFound },
      });
    }
    const headers = { 'content-type': HTML, 'cache-control': CACHE.pages, etag };
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers });
    }
    const response = await site.fetch(request);
    return new Response(request.method === 'HEAD' ? null : response.body, { headers });
  };
}
