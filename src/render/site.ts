// The route table and the request handler: one function renders every page, and it serves
// both the dev server (per request) and the build (prerendered to files).
import { renderToStream, renderToString, serverHtml } from '@gyral/ssr';
import { absolute } from '../site.js';
import { homeBody, homeMeta } from './home.js';
import { layout, type Assets, type PageMeta } from './layout.js';

interface Route {
  readonly meta: PageMeta;
  readonly body: () => unknown;
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
  title: 'Page not found',
  description: 'There is no page at this address.',
  noindex: true,
};

const notFoundBody = () => serverHtml`
  <h1>Page not found</h1>
  <p>There's no page at this address. <a href="/">Go to the home page</a>.</p>
`;

const HTML = { 'content-type': 'text/html; charset=utf-8' };

/** Paths always end with a slash; `/people` and `/people/` are the same page. */
export const normalise = (pathname: string): string =>
  pathname.endsWith('/') ? pathname : `${pathname}/`;

export function createSite(assets: Assets): Site {
  const table = new Map<string, Route>([['/', { meta: homeMeta, body: homeBody }]]);

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

/** sitemap.xml for every indexable path. */
export const sitemap = (paths: readonly string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${absolute(p)}</loc></url>`).join('\n')}
</urlset>
`;
