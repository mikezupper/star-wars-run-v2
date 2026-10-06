// The Wookieepedia snapshot's layout: gzipped JSON Lines, one article per line, sorted by
// title, in shards of SHARD_SIZE articles, plus the redirect table and meta.json. Gzip is
// written without a timestamp, so the same dump always produces the same bytes.
import { gzipSync } from 'node:zlib';
import type { ParsedArticle } from './wikitext.js';

export const SNAPSHOT_VERSION = 1;
export const SHARD_SIZE = 20_000;

/** One article in the snapshot. */
export interface ArticleRecord extends ParsedArticle {
  readonly title: string;
}

/** One serialized article, with the two facts meta.json counts, so nobody re-parses it. */
export interface Line {
  readonly title: string;
  readonly line: string;
  readonly era: ParsedArticle['era'];
  readonly kind?: string;
}

export const articleLine = (title: string, article: ParsedArticle): Line => ({
  title,
  line: JSON.stringify({ title, ...article } satisfies ArticleRecord),
  era: article.era,
  ...(article.kind === undefined ? {} : { kind: article.kind }),
});

/** Code-unit order: stable across machines and locales, unlike localeCompare. */
export const byTitle = (a: { readonly title: string }, b: { readonly title: string }): number =>
  a.title < b.title ? -1 : a.title > b.title ? 1 : 0;

const gzip = (text: string): Buffer => gzipSync(text, { level: 9 });

/** File name → contents, for the articles and the redirect table. */
export function snapshotFiles(
  lines: readonly Line[],
  redirects: ReadonlyMap<string, string>,
): ReadonlyMap<string, Buffer> {
  const sorted = [...lines].sort(byTitle);
  const files = new Map<string, Buffer>();
  for (let i = 0; i * SHARD_SIZE < sorted.length; i++) {
    const shard = sorted.slice(i * SHARD_SIZE, (i + 1) * SHARD_SIZE);
    files.set(
      `articles-${String(i).padStart(3, '0')}.jsonl.gz`,
      gzip(shard.map((l) => `${l.line}\n`).join('')),
    );
  }
  const table = [...redirects]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([from, to]) => `${JSON.stringify({ from, to })}\n`)
    .join('');
  files.set('redirects.jsonl.gz', gzip(table));
  return files;
}

export interface Meta {
  readonly version: number;
  readonly source: {
    readonly file: string;
    readonly sha256: string;
    /** The newest revision in the dump: the snapshot's "as of" date. */
    readonly latestRevision: string;
  };
  readonly parser: string;
  readonly counts: {
    readonly articles: number;
    readonly redirects: number;
    readonly canon: number;
    readonly legends: number;
    readonly failed: number;
    /** Articles per infobox kind, most common first; `(none)` for no infobox. */
    readonly kinds: Readonly<Record<string, number>>;
  };
}

/** `{ Character: 44000, … }`, most common first, ties by name. */
export function kindCounts(kinds: readonly (string | undefined)[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const kind of kinds) counts.set(kind ?? '(none)', (counts.get(kind ?? '(none)') ?? 0) + 1);
  return Object.fromEntries(
    [...counts].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)),
  );
}
