// The document shell every page shares: head, banner with the section nav, footer. Server-only:
// written with serverHtml, so none of it is hydrated and pages without islands ship no
// JavaScript.
import { nothing } from 'lit';
import { page, serverHtml } from '@gyral/ssr';
import { kindPath } from '../domain/paths.js';
import { KINDS, type Kind } from '../domain/records.js';
import { absolute, SITE_NAME } from '../site.js';
import { KIND_LABELS, TEXT } from './labels.js';

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
  /** The section this page belongs to, marked current in the nav. */
  readonly section?: Kind;
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
  <meta property="og:type" content="website">
  <meta property="og:site_name" content=${SITE_NAME}>
  <meta property="og:title" content=${fullTitle(meta)}>
  <meta property="og:description" content=${meta.description}>
  <meta property="og:url" content=${absolute(meta.path)}>
  <link rel="icon" href="/icons/favicon.ico" sizes="32x32">
  <link rel="apple-touch-icon" href="/icons/apple-icon-180x180.png">
  <link rel="stylesheet" href=${assets.stylesheet}>
`;

const banner = (meta: PageMeta) => serverHtml`
  <a href="#main">${TEXT.skipLink}</a>
  <header>
    <p><a href="/" aria-current=${meta.path === '/' ? 'page' : nothing}>${SITE_NAME}</a></p>
    <nav aria-label=${TEXT.primaryNav}>
      <ul>
        ${KINDS.map(
          (kind) => serverHtml`<li>
            <a href=${kindPath(kind)} aria-current=${
              meta.path === kindPath(kind) ? 'page' : meta.section === kind ? 'true' : nothing
            }>${KIND_LABELS[kind].plural}</a>
          </li>`,
        )}
      </ul>
    </nav>
  </header>
`;

const footer = () => serverHtml`
  <footer>
    <p>${TEXT.dataCredit} <a href="https://swapi.info" rel="external">swapi.info</a>.</p>
    <p><small>${TEXT.fanProject}</small></p>
  </footer>
`;

/** A complete HTML document for one page. */
export function layout(meta: PageMeta, body: unknown, assets: Assets): unknown {
  return page({
    title: fullTitle(meta),
    description: meta.description,
    head: head(meta, assets),
    body: serverHtml`${banner(meta)}<main id="main">${body}</main>${footer()}`,
  });
}

/** Home › Section › Page. The last crumb is the current page and isn't a link. */
export const breadcrumb = (
  trail: readonly { readonly href: string; readonly label: string }[],
  current: string,
) =>
  serverHtml`<nav aria-label=${TEXT.breadcrumb}>
    <ol>
      ${trail.map((crumb) => serverHtml`<li><a href=${crumb.href}>${crumb.label}</a></li>`)}
      <li aria-current="page">${current}</li>
    </ol>
  </nav>`;
