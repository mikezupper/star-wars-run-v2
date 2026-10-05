// The document shell every page shares. Server-only: written with serverHtml, so none of it
// is hydrated and pages without islands ship no JavaScript.
import { page, serverHtml } from '@gyral/ssr';
import { absolute, SITE_NAME } from '../site.js';

/** Where the built CSS lives; dev and production differ (scripts/dev.ts, scripts/build.ts). */
export interface Assets {
  readonly stylesheet: string;
}

export interface PageMeta {
  /** URL path with a trailing slash, e.g. `/people/luke-skywalker/`. */
  readonly path: string;
  /** The `<title>`; the site name is appended unless this is the home page. */
  readonly title: string;
  readonly description: string;
  /** Not indexed by search engines and left out of the sitemap (404). */
  readonly noindex?: boolean;
}

export const fullTitle = (meta: Pick<PageMeta, 'path' | 'title'>): string =>
  meta.path === '/' ? meta.title : `${meta.title} · ${SITE_NAME}`;

const head = (meta: PageMeta, assets: Assets) => serverHtml`
  ${
    meta.noindex === true
      ? serverHtml`<meta name="robots" content="noindex">`
      : serverHtml`<link rel="canonical" href=${absolute(meta.path)}>`
  }
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="/icons/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/icons/apple-icon-180x180.png">
  <link rel="stylesheet" href=${assets.stylesheet}>
`;

/** A complete HTML document for one page. */
export function layout(meta: PageMeta, body: unknown, assets: Assets): unknown {
  return page({
    title: fullTitle(meta),
    description: meta.description,
    head: head(meta, assets),
    body: serverHtml`<main id="main">${body}</main>`,
  });
}
