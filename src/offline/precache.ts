// Which built files the service worker downloads on install (docs/product-specs/offline.md):
// the shell pages, the hashed CSS and JS, Pagefind's runtime, the manifest and its icons.
// Article pages and the search index's chunks are not precached: at 227k articles the index
// alone is 130 MB. src/offline/sw.ts caches both as they're used. Pure, so it's tested
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
/** Pagefind's script, worker, WebAssembly, metadata and filters: small, and needed to search. */
const SEARCH_INDEX = /^pagefind\/(?!index\/|fragment\/)/;
const APP_FILES = new Set([
  'manifest.webmanifest',
  'search-titles/index.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
]);

/** `people/index.html` → `/people/`; `index.html` → `/`; anything else keeps its path. */
const urlOf = (path: string): string =>
  path.endsWith('index.html') ? `/${path.slice(0, -'index.html'.length)}` : `/${path}`;

/** True for a file the service worker precaches; decided by path alone, before reading it. */
export const isPrecached = (path: string): boolean =>
  HASHED.test(path) || SHELL_PAGE.test(path) || SEARCH_INDEX.test(path) || APP_FILES.has(path);

export function precacheEntries(
  files: readonly BuiltFile[],
  hash: (content: Uint8Array | string) => string,
): readonly PrecacheEntry[] {
  return files
    .flatMap((file): PrecacheEntry[] => {
      if (HASHED.test(file.path)) return [{ url: urlOf(file.path), revision: null }];
      return isPrecached(file.path)
        ? [{ url: urlOf(file.path), revision: hash(file.content) }]
        : [];
    })
    .sort((a, b) => a.url.localeCompare(b.url));
}
