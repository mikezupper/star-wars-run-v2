// Drivers for the search island. Pagefind's index is built from dist/ at build time
// (scripts/build.ts) and served as static files under /pagefind/. Nothing here runs on the
// server (commands never do), and nothing loads until the search page hydrates.
// Adapted from gyral.dev's src/islands/pagefind.ts.
import { command, defineDriver, type Command } from '@gyral/core';
import { SECTIONS, type Section } from '../domain/sections.js';

/** One search result, ready for the view. */
export interface Hit {
  readonly url: string;
  readonly title: string;
  readonly kind: Section | undefined;
  /** The excerpt split into plain text and matched (`mark`) runs: no HTML reaches the view. */
  readonly excerpt: readonly { readonly text: string; readonly mark: boolean }[];
}

/** What to search for: the text, and optionally one kind of record. */
export interface Query {
  readonly text: string;
  readonly kind: Section | undefined;
}

export interface PagefindResult {
  readonly url: string;
  readonly excerpt: string;
  readonly meta: { readonly title?: string };
  readonly filters?: Readonly<Record<string, readonly string[]>>;
}

interface Pagefind {
  readonly options: (options: { readonly baseUrl: string }) => Promise<void>;
  readonly search: (
    query: string,
    options?: { readonly filters?: Readonly<Record<string, string>> },
  ) => Promise<{
    readonly results: readonly { readonly data: () => Promise<PagefindResult> }[];
  } | null>;
}

/** The index lives next to the pages; a variable keeps Vite from bundling it. */
const PAGEFIND_URL = '/pagefind/pagefind.js';
const MAX_HITS = 20;
/** Typing pauses this long before a search runs; `switch` cancels the pending one. */
const DEBOUNCE_MS = 120;

let loaded: Promise<Pagefind> | undefined;
const loadPagefind = (): Promise<Pagefind> => {
  loaded ??= (import(/* @vite-ignore */ PAGEFIND_URL) as Promise<Pagefind>).then(async (pf) => {
    await pf.options({ baseUrl: '/' });
    return pf;
  });
  return loaded;
};

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
};
const decode = (text: string): string =>
  text.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity);

/** Pagefind marks matches with `<mark>`; everything else in an excerpt is escaped text. */
export const splitExcerpt = (excerpt: string): Hit['excerpt'] =>
  excerpt
    .split(/(<mark>.*?<\/mark>)/)
    .filter((part) => part !== '')
    .map((part) =>
      part.startsWith('<mark>')
        ? { text: decode(part.slice(6, -7)), mark: true }
        : { text: decode(part), mark: false },
    );

/** The kind a record page was indexed under (`data-pagefind-filter="kind:people"`). */
const kindOf = (d: PagefindResult): Section | undefined => {
  const value = d.filters?.['kind']?.[0];
  return SECTIONS.find((kind) => kind === value);
};

export const toHit = (d: PagefindResult): Hit => ({
  url: d.url,
  title: d.meta.title ?? d.url,
  kind: kindOf(d),
  excerpt: splitExcerpt(d.excerpt),
});

const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

const pagefind = defineDriver<Query, readonly Hit[], string>({
  name: 'pagefind',
  concurrency: 'switch',
  run: async (query, { signal }) => {
    await wait(DEBOUNCE_MS, signal);
    const pf = await loadPagefind();
    const found = await pf.search(
      query.text,
      query.kind === undefined ? {} : { filters: { kind: query.kind } },
    );
    const data = await Promise.all(
      (found?.results ?? []).slice(0, MAX_HITS).map((result) => result.data()),
    );
    return data.map(toHit);
  },
  toError: () => 'failed',
});

/** Searches the index; a newer query cancels the one in flight. */
export const search = <M>(
  query: Query,
  found: (hits: readonly Hit[]) => M,
  failed: () => M,
): Command<M> => command(pagefind, query, { onSuccess: found, onFailure: failed });

const searchLocation = defineDriver<undefined, URLSearchParams>({
  name: 'search-location',
  run: () => new URLSearchParams(window.location.search),
});

/** Reads `?q=` and `?kind=` once, so links and the header form land on results. */
export const readQuery = <M>(toMsg: (query: Query) => M): Command<M> =>
  command(searchLocation, undefined, {
    onSuccess: (params) =>
      toMsg({
        text: params.get('q') ?? '',
        kind: SECTIONS.find((kind) => kind === params.get('kind')),
      }),
  });

const searchHistory = defineDriver<Query, undefined>({
  name: 'search-history',
  concurrency: 'switch',
  run: (query) => {
    const url = new URL(window.location.href);
    if (query.text === '') url.searchParams.delete('q');
    else url.searchParams.set('q', query.text);
    if (query.kind === undefined) url.searchParams.delete('kind');
    else url.searchParams.set('kind', query.kind);
    window.history.replaceState(null, '', url);
    return undefined;
  },
});

/** Keeps `?q=` and `?kind=` in the address bar in step, so a results page can be shared. */
export const writeQuery = <M>(query: Query): Command<M> =>
  command<Query, undefined, unknown, M>(searchHistory, query, { onSuccess: () => undefined });

/** The drivers, for tests (`@gyral/testing` matches commands to them by name). */
export const drivers = { pagefind, searchLocation, searchHistory } as const;
