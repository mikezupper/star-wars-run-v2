// Loaded on every page (a few hundred bytes, no framework):
// - `/` or Ctrl/⌘+K focuses search. On /search/ that's the island's box; everywhere else it's
//   the header form, which submits to /search/?q=… and works without this script. Adapted from
//   gyral.dev's src/shortcuts.ts.
// - In production builds, registers the service worker (/sw.js, built by scripts/build.ts) that
//   makes the site work offline (docs/product-specs/offline.md).
// - On a page-to-page view transition (ADR 0011), the link that was followed grows into the
//   next page's heading. The CSS names every page's heading `page-title`; here, as the old page
//   is swapped out, the followed link takes that name instead of the old heading.

const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const searchBox = (): HTMLInputElement | null =>
  document.querySelector('swr-site-search')?.shadowRoot?.querySelector<HTMLInputElement>('#q') ??
  document.querySelector<HTMLInputElement>('#site-search-q');

document.addEventListener('keydown', (event) => {
  const slash = event.key === '/' && !typing(event.target);
  const k = event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey);
  if ((!slash && !k) || event.altKey || event.defaultPrevented) return;
  const box = searchBox();
  if (box === null) return;
  event.preventDefault();
  box.focus();
  box.select();
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

export function rememberClick(event: Event): void {
  clicked = event.target instanceof Element ? event.target.closest('main a[href]') : null;
}

/** Hands the heading's transition name to the followed link, until the transition ends. */
export function nameFollowedLink(event: PageSwapEvent): void {
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
  // Undone once the snapshot is taken, so a return from the back/forward cache starts clean.
  void event.viewTransition.finished.finally(() => {
    heading?.style.removeProperty('view-transition-name');
    link.style.removeProperty('view-transition-name');
  });
}

if (typeof window !== 'undefined' && 'onpageswap' in window) {
  document.addEventListener('click', rememberClick, { capture: true });
  window.addEventListener('pageswap', nameFollowedLink);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js');
}
