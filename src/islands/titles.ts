// Title matches for the search island (swr-357): the shard of the title index for a query
// (written by scripts/build.ts from src/domain/titles.ts), ranked, as hits. Pagefind's
// results follow them. Shards are fetched once per page; a shard that won't load (offline,
// say) gives no title hits, and search carries on with Pagefind alone.
import type { Resolved } from '../domain/ask.js';
import { rankTitles, shardFor, titleOfRow, type TitleRow } from '../domain/titles.js';
import type { Section } from '../domain/sections.js';
import { TEXT } from '../labels.js';

/** How many title matches go above Pagefind's results. */
export const TITLE_HITS = 5;

const BASE = '/search-titles/';

export interface TitleHit {
  readonly url: string;
  readonly title: string;
  readonly kind: Section;
}

export const toTitleHit = (row: TitleRow): TitleHit => ({
  url: row[1],
  title: row[4] === 1 ? `${row[0]} (${TEXT.legends})` : row[0],
  kind: row[2],
});

const getJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${String(response.status)}`);
  return (await response.json()) as T;
};

interface Index {
  /** Three-letter keys whose shard is split by four letters. */
  readonly split: ReadonlySet<string>;
  /** Every shard there is, by key. */
  readonly keys: ReadonlySet<string>;
}

let index: Promise<Index> | undefined;
const shards = new Map<string, Promise<readonly TitleRow[]>>();

const load = <T>(cache: Map<string, Promise<T>>, key: string, get: () => Promise<T>) => {
  const found = cache.get(key);
  if (found !== undefined) return found;
  const fetched = get();
  cache.set(key, fetched);
  fetched.catch(() => cache.delete(key)); // a failed fetch may work next time
  return fetched;
};

/** The best title matches for a query, or none when the index can't be reached. */
export async function titleHits(text: string, kind: Section | undefined): Promise<TitleHit[]> {
  try {
    index ??= getJson<{ split: string[]; keys: string[] }>(`${BASE}index.json`).then((i) => ({
      split: new Set(i.split),
      keys: new Set(i.keys),
    }));
    index.catch(() => (index = undefined));
    const { split, keys } = await index;
    const file = shardFor(text, split);
    // No title has a word starting this way: there's no shard to fetch.
    if (file === undefined || !keys.has(file.replace(/\.json$/, ''))) return [];
    const rows = await load(shards, file, () => getJson<TitleRow[]>(BASE + file));
    return rankTitles(text, rows, kind).slice(0, TITLE_HITS).map(toTitleHit);
  } catch {
    return [];
  }
}

/** How many titles a name may resolve to (canon and Legends, usually). */
const NAME_TITLES = 2;

/**
 * The archive's titles for names from a question (Ask the archive, swr-ei6): "the Rebel
 * Alliance" → "Alliance to Restore the Republic", through titles and redirects, best first.
 * A name the index can't reach resolves to no titles.
 */
export async function resolveNames(names: readonly string[]): Promise<Resolved[]> {
  return Promise.all(
    names.map(async (asked): Promise<Resolved> => {
      try {
        index ??= getJson<{ split: string[]; keys: string[] }>(`${BASE}index.json`).then((i) => ({
          split: new Set(i.split),
          keys: new Set(i.keys),
        }));
        const { split, keys } = await index;
        const file = shardFor(asked, split);
        if (file === undefined || !keys.has(file.replace(/\.json$/, '')))
          return { asked, titles: [] };
        const rows = await load(shards, file, () => getJson<TitleRow[]>(BASE + file));
        const titles = rankTitles(asked, rows)
          .slice(0, NAME_TITLES)
          .map((r) => ({ title: titleOfRow(r), section: r[2] }));
        return { asked, titles };
      } catch {
        return { asked, titles: [] };
      }
    }),
  );
}
