// Loaded on every page (a few hundred bytes, no framework):
// - `/` or Ctrl/⌘+K focuses search. On /search/ that's the island's box; everywhere else it's
//   the header form, which submits to /search/?q=… and works without this script. Adapted from
//   gyral.dev's src/shortcuts.ts.
// - In production builds, registers the service worker (/sw.js, built by scripts/build.ts) that
//   makes the site work offline (docs/product-specs/offline.md).

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

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js');
}

// A module, so tests can import it and the build treats it as one entry.
export {};
