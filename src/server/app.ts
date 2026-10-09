// Pages rendered on request (ADR 0011): every path that isn't a static file or /api/ comes here.
// The same URL rules the static site had, now in code: `/x` redirects to `/x/` when that page
// exists, an unknown path gets the 404 page. A page changes only with a build, so its ETag is the
// build's id and a revisit costs a 304; Cache-Control lets Cloudflare hold pages for a week.
import { CACHE } from '../hosting/headers.js';
import { createSite, normalise } from '../render/site.js';
import type { Pages } from './pages.js';

const HTML = 'text/html; charset=utf-8';

export function createPagesApp(pages: Pages): (request: Request) => Promise<Response> {
  const site = createSite(pages.meta.assets, pages.data);
  const known = new Set(site.paths);
  const etag = `W/"${pages.meta.build}"`;
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Only GET and HEAD.', { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
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
