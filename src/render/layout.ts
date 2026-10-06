// The document shell every page shares: head, banner with the section nav, footer. Server-only:
// written with serverHtml, so none of it is hydrated and pages without islands ship no
// JavaScript.
import { nothing } from 'lit';
import { page, serverHtml } from '@gyral/ssr';
import { sectionPath } from '../domain/archive.js';
import { CC_BY_SA_3 } from '../domain/attribution.js';
import { SECTIONS, type Section } from '../domain/sections.js';
import { absolute, SITE_NAME } from '../site.js';
import { SECTION_LABELS, TEXT } from '../labels.js';

/** Where the built CSS and JS live; dev and production differ (scripts/dev.ts, scripts/build.ts). */
const WOOKIEEPEDIA_HOME = 'https://starwars.fandom.com';

export interface Assets {
  readonly stylesheet: string;
  /** The client entry that hydrates islands; only pages with islands load it. */
  readonly clientEntry: string;
  /** The every-page script: the `/` search key and service worker registration (src/page.ts). */
  readonly page: string;
}

export interface PageMeta {
  /** URL path with a trailing slash, e.g. `/people/luke-skywalker/`. */
  readonly path: string;
  /** The `<title>`; the site name is appended unless this is the home page. */
  readonly title: string;
  readonly description: string;
  /** The section this page belongs to, marked current in the nav. */
  readonly section?: Section;
  /** Index this page for site search, filterable under this kind (record pages). */
  readonly searchKind?: Section;
  /** True when the body contains islands that need the client entry. */
  readonly islands?: boolean;
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
  <meta name="theme-color" content="#212731">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icons/favicon.ico" sizes="32x32">
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
  <link rel="stylesheet" href=${assets.stylesheet}>
`;

const banner = (meta: PageMeta) => serverHtml`
  <a href="#main">${TEXT.skipLink}</a>
  <header>
    <p><a href="/" aria-current=${meta.path === '/' ? 'page' : nothing}>${SITE_NAME}</a></p>
    <nav aria-label=${TEXT.primaryNav}>
      <ul>
        ${SECTIONS.map(
          (section) => serverHtml`<li>
            <a href=${sectionPath(section)} aria-current=${
              meta.path === sectionPath(section)
                ? 'page'
                : meta.section === section
                  ? 'true'
                  : nothing
            }>${SECTION_LABELS[section].plural}</a>
          </li>`,
        )}
      </ul>
    </nav>
    ${
      meta.path === '/search/'
        ? nothing
        : serverHtml`<search>
            <form action="/search/" method="get">
              <label for="site-search-q">${TEXT.searchLabel}</label>
              <input id="site-search-q" name="q" type="search" autocomplete="off"
                aria-keyshortcuts="/ Control+K Meta+K">
              <button type="submit">${TEXT.searchLabel}</button>
            </form>
          </search>`
    }
  </header>
`;

const footer = () => serverHtml`
  <footer>
    <p>
      ${TEXT.dataCredit} <a href=${WOOKIEEPEDIA_HOME} rel="external">Wookieepedia</a>,
      ${TEXT.dataLicense} <a href=${CC_BY_SA_3} rel="license external">CC BY-SA 3.0</a>.
      ${TEXT.dataPerPage}
    </p>
    <p><small>${TEXT.fanProject}</small></p>
  </footer>
`;

/** A complete HTML document for one page. */
export function layout(meta: PageMeta, body: unknown, assets: Assets): unknown {
  return page({
    title: fullTitle(meta),
    description: meta.description,
    head: head(meta, assets),
    scripts: meta.islands === true ? [assets.page, assets.clientEntry] : [assets.page],
    body: serverHtml`${banner(meta)}<main
        id="main"
        data-pagefind-body=${meta.searchKind === undefined ? nothing : ''}
        data-pagefind-filter=${meta.searchKind === undefined ? nothing : `kind:${meta.searchKind}`}
      >${body}</main>${footer()}`,
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
