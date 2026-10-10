// Loaded on every page (no framework):
// - `/` or Ctrl/⌘+K focuses the search page's input or the visible header form. A phone's
//   header has only a link, so the shortcut opens /search/#search-q; native fragment navigation
//   focuses the input on arrival. Both forms submit to /search/?q=… without this script.
// - In production builds, registers the service worker (/sw.js, built by scripts/build.ts) that
//   makes the site work offline (docs/product-specs/offline.md).
// - The theme toggle (ADR 0004, "The look"): the site follows the system's color scheme until
//   the visitor picks the other one; the pick is kept in localStorage and applied before the
//   first paint by the inline script in every page's head (src/domain/theme.ts).
// - On a page-to-page view transition (ADR 0011), the link that was followed grows into the
//   next page's heading. The CSS names every page's heading `page-title`; here, as the old page
//   is swapped out, the followed link takes that name instead of the old heading.
// - The random-article link gets an optional four-second hyperspace transition (src/hyperspace.ts).

import { isTheme, THEME_COLOR, THEME_KEY, type Theme } from './domain/theme.js';
import {
  arriveHyperspace,
  departHyperspace,
  installHyperspaceSettings,
  isHyperspaceClick,
} from './hyperspace.js';

const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const searchBox = (): HTMLInputElement | null =>
  document.querySelector<HTMLInputElement>('#search-q') ??
  document.querySelector<HTMLInputElement>('#site-search-q');

document.addEventListener('keydown', (event) => {
  const slash = event.key === '/' && !typing(event.composedPath()[0] ?? event.target);
  const k = event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey);
  if ((!slash && !k) || event.altKey || event.defaultPrevented) return;
  const box = searchBox();
  if (box !== null && box.getClientRects().length > 0) {
    event.preventDefault();
    box.focus();
    box.select();
    return;
  }
  const link = document.querySelector<HTMLAnchorElement>('header > a[href="/search/"]');
  if (link === null) return;
  event.preventDefault();
  window.location.assign(`${link.href}#search-q`);
});

/** The name the CSS gives each page's heading, and the followed link takes on the way out. */
const TITLE = 'page-title';

interface Linkish {
  readonly href: string;
  getBoundingClientRect(): { readonly top: number; readonly bottom: number };
}

/** The link to `to` that the visitor could see, if any: the one they most likely followed. */
export function followedLink<T extends Linkish>(
  to: string,
  links: Iterable<T>,
  viewportHeight: number,
): T | undefined {
  for (const link of links) {
    if (link.href !== to) continue;
    const { top, bottom } = link.getBoundingClientRect();
    if (bottom > 0 && top < viewportHeight) return link;
  }
  return undefined;
}

/** The link last clicked (a click or Enter), so the right one of several to one page morphs. */
let clicked: HTMLAnchorElement | null = null;
let clickEvent: MouseEvent | null = null;

export function rememberClick(event: Event): void {
  clicked = event.target instanceof Element ? event.target.closest('main a[href]') : null;
  clickEvent = event as MouseEvent;
}

/** Hands the heading's transition name to the followed link, until the transition ends. */
export function nameFollowedLink(event: PageSwapEvent): void {
  const hyperspace = clickEvent !== null && isHyperspaceClick(clickEvent, clicked);
  clickEvent = null;
  if (departHyperspace(event, hyperspace)) return;
  const to = event.activation?.entry.url;
  if (!event.viewTransition || to == null) return;
  const link =
    clicked?.href === to
      ? clicked
      : followedLink(
          to,
          document.querySelectorAll<HTMLAnchorElement>('main a[href]'),
          window.innerHeight,
        );
  if (link === undefined) return;
  const heading = document.querySelector<HTMLElement>('main h1');
  // A name must be unique on the page, so the old heading gives it up.
  heading?.style.setProperty('view-transition-name', 'none');
  link.style.setProperty('view-transition-name', TITLE);
  // Undone once the snapshot is taken, so a return from the back/forward cache starts clean;
  // also when the browser aborts the transition, which rejects `finished`.
  const restore = () => {
    heading?.style.removeProperty('view-transition-name');
    link.style.removeProperty('view-transition-name');
  };
  event.viewTransition.finished.then(restore, restore);
}

if (typeof window !== 'undefined' && 'onpageswap' in window) {
  installHyperspaceSettings();
  document.addEventListener('click', rememberClick, { capture: true });
  window.addEventListener('pageswap', nameFollowedLink);
  window.addEventListener('pagereveal', arriveHyperspace);
}

/** The theme on screen: the visitor's pick, else the system's. */
export function shownTheme(root: HTMLElement, prefersDark: boolean): Theme {
  const picked = root.dataset['theme'];
  return isTheme(picked) ? picked : prefersDark ? 'dark' : 'light';
}

type ThemeStorage = Pick<Storage, 'setItem' | 'removeItem'>;

/**
 * Shows `theme` and remembers it. Picking what the system already shows forgets the pick, so the
 * site follows the system again. A browser that refuses storage still gets the theme for the page.
 */
export function pickTheme(
  theme: Theme,
  root: HTMLElement,
  prefersDark: boolean,
  storage: ThemeStorage | null,
): void {
  const follow = theme === (prefersDark ? 'dark' : 'light');
  if (follow) delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
  try {
    if (follow) storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or a full quota: the pick lasts until the next page.
  }
}

const localStore = (): ThemeStorage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

// Two toggles: one in the header row, one in the Sections panel for narrow screens.
const toggles =
  typeof document === 'undefined'
    ? []
    : [...document.querySelectorAll<HTMLButtonElement>('button[data-theme-toggle]')];
if (toggles.length > 0) {
  const system = matchMedia('(prefers-color-scheme: dark)');
  const sync = () => {
    const theme = shownTheme(document.documentElement, system.matches);
    for (const toggle of toggles) toggle.setAttribute('aria-pressed', String(theme === 'dark'));
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
      meta.content = THEME_COLOR[theme];
  };
  const flip = () => {
    const next = shownTheme(document.documentElement, system.matches) === 'dark' ? 'light' : 'dark';
    pickTheme(next, document.documentElement, system.matches, localStore());
    sync();
  };
  for (const toggle of toggles) {
    toggle.addEventListener('click', flip);
    toggle.hidden = false;
  }
  system.addEventListener('change', sync);
  sync();
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js');
}
