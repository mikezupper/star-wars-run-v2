// Search on the server (ADR 0011, swr-sgf.5): the pure half. The server finds candidates in
// SQLite (src/server/search.ts); this ranks and folds them. Titles first, as the old title index
// did: every query word must start a word of the title, or the query must be a whole redirect
// ("vader" finds Anakin Skywalker). Popularity decides among titles, with a bonus for the whole
// title matching or starting the same way. Then text matches, by relevance. A canon article and
// its Legends twin are one result.
import { displayTitle } from './archive.js';
import type { Section } from './sections.js';

/** `Padmé Amidala` → `['padme', 'amidala']`: lower case ASCII letters and digits. */
export const tokens = (text: string): string[] =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== '');

/** log2(links + 1), to one decimal: 0 for no links, about 13 for Luke Skywalker. */
export const popularity = (links: number): number => Math.round(Math.log2(links + 1) * 10) / 10;

/** A name an article is found by: its own, or a redirect's (`alias`). */
export interface NameHit {
  readonly name: string;
  readonly alias: boolean;
  readonly title: string;
  readonly path: string;
  readonly section: Section;
  readonly era: 'canon' | 'legends';
  /** The subject: its canon article's path, shared by twins. */
  readonly pair: string;
  readonly links: number;
}

/** An article found by its text, with its excerpt (marked with \u0001…\u0002). */
export interface TextHit extends Omit<NameHit, 'name' | 'alias'> {
  readonly name: string;
  readonly excerpt: string;
}

/** A run of an excerpt: plain text, or a matched word. */
export interface Run {
  readonly text: string;
  readonly mark: boolean;
}

export interface Result {
  readonly name: string;
  readonly path: string;
  readonly section: Section;
  /** The subject's articles, canon first. */
  readonly eras: readonly { readonly era: 'canon' | 'legends'; readonly path: string }[];
  readonly excerpt: readonly Run[];
}

export interface Results {
  readonly query: string;
  readonly results: readonly Result[];
  /** A name close to the query, when nothing matched it. */
  readonly didYouMean?: string;
}

/** The markers SQLite's snippet() puts around a match: characters no article contains. */
export const MARK_OPEN = '\u0001';
export const MARK_CLOSE = '\u0002';

/** An excerpt as runs: no markup reaches a page, so nothing in it needs trusting. */
export function excerptRuns(snippet: string): Run[] {
  const runs: Run[] = [];
  for (const part of snippet.split(MARK_OPEN)) {
    const close = part.indexOf(MARK_CLOSE);
    const marked = close < 0 ? '' : part.slice(0, close);
    const rest = close < 0 ? part : part.slice(close + 1);
    if (marked !== '') runs.push({ text: marked, mark: true });
    if (rest !== '') runs.push({ text: rest, mark: false });
  }
  return runs;
}

/**
 * Title hits that really match `query`, best first, one per article: every word must start a
 * word of the name, and a redirect counts only as the whole query ("sky" mustn't find the
 * galaxy by its redirect "Skyriver").
 */
export function rankNames(query: string, hits: readonly NameHit[]): NameHit[] {
  const words = tokens(query);
  if (words.length === 0) return [];
  const whole = words.join(' ');
  const best = new Map<string, [NameHit, number]>();
  for (const hit of hits) {
    const name = tokens(hit.name);
    const joined = name.join(' ');
    const matches = hit.alias
      ? joined === whole
      : words.every((w) => name.some((t) => t.startsWith(w)));
    if (!matches) continue;
    const bonus = joined === whole ? 4 : joined.startsWith(whole) ? 1 : 0;
    // Canon first when popularity is close: Legends pages often have more links.
    const score = popularity(hit.links) + bonus - (hit.era === 'legends' ? 1 : 0);
    const seen = best.get(hit.path);
    if (seen === undefined || score > seen[1]) best.set(hit.path, [hit, score]);
  }
  return [...best.values()]
    .sort((a, b) => b[1] - a[1] || a[0].name.length - b[0].name.length)
    .map(([hit]) => hit);
}

/**
 * Title hits, then text hits, as results: twins folded into one under the canon article's name
 * (or the first found, when the canon article isn't among the hits), at most `limit`.
 */
export function foldResults(
  query: string,
  names: readonly NameHit[],
  texts: readonly TextHit[],
  limit: number,
): Result[] {
  const bySubject = new Map<
    string,
    { name: string; path: string; section: Section; eras: Result['eras']; excerpt: Run[] }
  >();
  const ordered: string[] = [];
  const add = (hit: NameHit | TextHit, name: string, excerpt: Run[]) => {
    const found = bySubject.get(hit.pair);
    if (found === undefined) {
      bySubject.set(hit.pair, {
        name,
        path: hit.path,
        section: hit.section,
        eras: [{ era: hit.era, path: hit.path }],
        excerpt,
      });
      ordered.push(hit.pair);
      return;
    }
    if (found.eras.some((e) => e.path === hit.path)) return;
    const eras = [...found.eras, { era: hit.era, path: hit.path }].sort((a, b) =>
      a.era === b.era ? 0 : a.era === 'canon' ? -1 : 1,
    );
    // The canon article names the subject and is its link.
    const canon = hit.era === 'canon';
    bySubject.set(hit.pair, {
      ...found,
      eras,
      ...(canon ? { name, path: hit.path } : {}),
      excerpt: found.excerpt.length === 0 ? excerpt : found.excerpt,
    });
  };
  for (const hit of rankNames(query, names)) add(hit, hit.alias ? displayName(hit) : hit.name, []);
  for (const hit of texts) add(hit, hit.name, excerptRuns(hit.excerpt));
  return ordered.slice(0, limit).flatMap((pair) => {
    const r = bySubject.get(pair);
    return r === undefined ? [] : [r];
  });
}

/** A redirect hit shows its article's name, not the redirect's. */
const displayName = (hit: NameHit): string => displayTitle(hit.title);

/** The FTS5 query for every word as a prefix: `luke sky` → `"luke"* AND "sky"*`. */
export const prefixQuery = (query: string): string | undefined => {
  const words = tokens(query);
  return words.length === 0 ? undefined : words.map((w) => `"${w}"*`).join(' AND ');
};

/** The FTS5 query for the words themselves, for text: `luke sky` → `"luke" AND "sky"`. */
export const wordsQuery = (query: string): string | undefined => {
  const words = tokens(query);
  return words.length === 0 ? undefined : words.map((w) => `"${w}"`).join(' AND ');
};

/**
 * The FTS5 query for "did you mean": any of the query's three-letter pieces, so a name sharing
 * most of them ranks first ("skywlker" → Skywalker).
 */
export const trigramQuery = (query: string): string | undefined => {
  const text = tokens(query).join(' ');
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= text.length; i++) {
    const gram = text.slice(i, i + 3);
    if (!gram.includes(' ')) grams.add(gram);
  }
  return grams.size === 0 ? undefined : [...grams].map((g) => `"${g}"`).join(' OR ');
};
