// Which built files the service worker downloads on install (docs/product-specs/offline.md):
// the shell pages, the hashed CSS and JS, the whole search index, the manifest and its icons.
// Record pages are not precached: they are cached as they're visited. Pure, so it's tested
// directly; scripts/build-sw.ts feeds it the files in dist/.

/** One built file: its path relative to dist/ with `/` separators, and its bytes. */
export interface BuiltFile {
  readonly path: string;
  readonly content: Uint8Array | string;
}

/** A Workbox precache entry. `revision: null` when the URL already changes with the content. */
export interface PrecacheEntry {
  readonly url: string;
  readonly revision: string | null;
}

/** Pages every visitor gets offline: home, search, the offline page, and each section list. */
const SHELL_PAGE = /^(?:[a-z0-9-]+\/)?index\.html$/;
/** Vite's output: the content hash is in the file name. */
const HASHED = /^assets\//;
/** Search must work offline, and a result needs its fragment, so the whole index goes. */
const SEARCH_INDEX = /^pagefind\//;
const APP_FILES = new Set([
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
]);

/** `people/index.html` → `/people/`; `index.html` → `/`; anything else keeps its path. */
const urlOf = (path: string): string =>
  path.endsWith('index.html') ? `/${path.slice(0, -'index.html'.length)}` : `/${path}`;

export function precacheEntries(
  files: readonly BuiltFile[],
  hash: (content: Uint8Array | string) => string,
): readonly PrecacheEntry[] {
  return files
    .flatMap((file): PrecacheEntry[] => {
      if (HASHED.test(file.path)) return [{ url: urlOf(file.path), revision: null }];
      if (SHELL_PAGE.test(file.path) || SEARCH_INDEX.test(file.path) || APP_FILES.has(file.path)) {
        return [{ url: urlOf(file.path), revision: hash(file.content) }];
      }
      return [];
    })
    .sort((a, b) => a.url.localeCompare(b.url));
}
