// The document shell every page shares: head, banner with the section nav, footer. Server-only:
// written with html, so none of it is hydrated and pages without islands ship no
// JavaScript.
import { html, nothing, raw, svg, type ChildValue } from '@gyral/core';
import { page } from '@gyral/ssr';
import { sectionPath } from '../domain/archive.js';
import { CC_BY_SA_3 } from '../domain/attribution.js';
import { SECTIONS, type Section } from '../domain/sections.js';
import { THEME_COLOR, THEME_SCRIPT } from '../domain/theme.js';
import { absolute, SITE_NAME } from '../site.js';
import { EXPLORE_TEXT, SABACC_TEXT, SECTION_LABELS, TEXT } from '../labels.js';

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

const head = (meta: PageMeta, assets: Assets) => html`
  ${raw(`<script>${THEME_SCRIPT}</script>`)}
  ${
    meta.noindex === true
      ? html`<meta name="robots" content="noindex" />`
      : html`<link rel="canonical" href=${absolute(meta.path)} />`
  }
  <meta name="color-scheme" content="light dark" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content=${SITE_NAME} />
  <meta property="og:title" content=${fullTitle(meta)} />
  <meta property="og:description" content=${meta.description} />
  <meta property="og:url" content=${absolute(meta.path)} />
  <meta name="theme-color" media="(prefers-color-scheme: light)" content=${THEME_COLOR.light} />
  <meta name="theme-color" media="(prefers-color-scheme: dark)" content=${THEME_COLOR.dark} />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/icons/favicon.ico" sizes="32x32" />
  <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="stylesheet" href=${assets.stylesheet} />
`;

/** The id that ties the Sections button to its panel (a native popover: no script needed). */
const SECTIONS_MENU = 'site-sections';

const icon = (paths: ChildValue) =>
  html`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${paths}</svg>`;
const SEARCH_ICON = icon(svg`<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />`);
const MENU_ICON = icon(svg`<path d="M4 7h16M4 12h16M4 17h16" />`);

/**
 * The theme toggle (src/page.ts), hidden until that script runs. The header has two: one in the
 * row on wide screens, one in the Sections panel on narrow ones, where the row has no room.
 */
const themeToggle = () => html`
  <button type="button" aria-pressed="false" data-theme-toggle hidden title=${TEXT.darkTheme}>
    ${icon(svg`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />`)}
    ${icon(
      svg`<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />`,
    )}
    <span>${TEXT.darkTheme}</span>
  </button>
`;

const current = (here: boolean) => (here ? 'page' : undefined);

/**
 * One row (ADR 0004, "The look"): the name, search, Ask, the Sections panel and the theme.
 * On narrow screens search shrinks to a link to /search/ and the theme moves into the panel.
 */
const banner = (meta: PageMeta) => html`
  <a href="#main">${TEXT.skipLink}</a>
  <header>
    <p><a href="/" aria-current=${current(meta.path === '/')}>${SITE_NAME}</a></p>
    ${
      meta.path === '/search/'
        ? nothing
        : html`<search>
              <form action="/search/" method="get">
                <label for="site-search-q">${TEXT.searchLabel}</label>
                <input
                  id="site-search-q"
                  name="q"
                  type="search"
                  autocomplete="off"
                  placeholder=${TEXT.searchPlaceholder}
                  aria-keyshortcuts="/ Control+K Meta+K"
                />
                <button type="submit">${TEXT.searchLabel}</button>
              </form>
            </search>
            <a href="/search/" aria-label=${TEXT.searchLabel}>${SEARCH_ICON}</a>`
    }
    <a href="/explore/" aria-current=${current(meta.path === '/explore/')}>${EXPLORE_TEXT.nav}</a>
    <button type="button" popovertarget=${SECTIONS_MENU}>
      ${MENU_ICON}<span>${TEXT.primaryNav}</span>
    </button>
    ${themeToggle()}
    <nav id=${SECTIONS_MENU} popover aria-label=${TEXT.primaryNav}>
      <ul>
        ${SECTIONS.map(
          (section) =>
            html`<li>
              <a
                href=${sectionPath(section)}
                aria-current=${
                  meta.path === sectionPath(section)
                    ? 'page'
                    : meta.section === section
                      ? 'true'
                      : undefined
                }
                >${SECTION_LABELS[section].plural}</a
              >
            </li>`,
        )}
      </ul>
      <ul>
        <li>
          <a href="/sabacc/" aria-current=${current(meta.path === '/sabacc/')}
            >${SABACC_TEXT.nav}</a
          >
        </li>
      </ul>
      ${themeToggle()}
    </nav>
  </header>
`;

const footer = () => html`
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
export function layout(meta: PageMeta, body: ChildValue, assets: Assets): ChildValue {
  return page({
    title: fullTitle(meta),
    description: meta.description,
    head: head(meta, assets),
    scripts: meta.islands === true ? [assets.page, assets.clientEntry] : [assets.page],
    body: html`${banner(meta)}
      <main
        id="main"
        data-pagefind-body=${meta.searchKind === undefined ? undefined : ''}
        data-pagefind-filter=${meta.searchKind === undefined ? undefined : `kind:${meta.searchKind}`}
      >
        ${body}
      </main>
      ${footer()}`,
  });
}

/** Home › Section › Page. The last crumb is the current page and isn't a link. */
export const breadcrumb = (
  trail: readonly { readonly href: string; readonly label: string }[],
  current: string,
) =>
  html`<nav aria-label=${TEXT.breadcrumb}>
    <ol>
      ${trail.map((crumb) => html`<li><a href=${crumb.href}>${crumb.label}</a></li>`)}
      <li aria-current="page">${current}</li>
    </ol>
  </nav>`;
