// Search on the server (ADR 0011, swr-sgf.5): the SQL half. SQLite's full-text indexes in
// pages.sqlite (src/server/pages.ts) find candidates; the address book in memory says where each
// one lives; src/domain/search.ts ranks them and folds twins. One search serves the /search/ page,
// /api/search's suggestions, and Ask's name lookup.
import type { DatabaseSync } from 'node:sqlite';
import { displayTitle, type Archive } from '../domain/archive.js';
import type { Resolved } from '../domain/ask.js';
import { pairPath } from '../domain/rows.js';
import {
  foldResults,
  prefixQuery,
  rankNames,
  trigramQuery,
  wordsQuery,
  type NameHit,
  type Results,
  type TextHit,
} from '../domain/search.js';
import type { Section } from '../domain/sections.js';

/** How many names to rank: a short prefix ("sk") matches thousands; the best-linked are enough. */
const NAME_CANDIDATES = 400;
/** How many text matches to fold in after the names. */
const TEXT_CANDIDATES = 60;
/** How many titles a name may resolve to for Ask (canon and Legends, usually). */
const NAME_TITLES = 2;

export interface Search {
  /** Results for the search page and its suggestions, best first. */
  readonly search: (
    query: string,
    options?: { readonly section?: Section; readonly limit?: number },
  ) => Results;
  /** Ask's names to the articles they mean. */
  readonly resolve: (names: readonly string[]) => Promise<Resolved[]>;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : String(value));

export function createSearch(
  db: DatabaseSync,
  archive: Archive,
  counts: ReadonlyMap<string, number>,
): Search {
  const names = db.prepare(`
    SELECT n.name, n.alias, n.title FROM names n
    WHERE n.id IN (SELECT rowid FROM names_fts WHERE names_fts MATCH ?)
    ORDER BY n.links DESC LIMIT ${String(NAME_CANDIDATES)}
  `);
  const texts = db.prepare(`
    SELECT title, snippet(texts, 2, char(1), char(2), '…', 16) AS excerpt FROM texts
    WHERE texts MATCH ? ORDER BY bm25(texts, 0, 10, 1) LIMIT ${String(TEXT_CANDIDATES)}
  `);
  const near = db.prepare(`
    SELECT n.name FROM names_tri JOIN names n ON n.id = names_tri.rowid
    WHERE names_tri MATCH ? ORDER BY bm25(names_tri), n.links DESC LIMIT 1
  `);

  const where = (title: string): Omit<NameHit, 'name' | 'alias'> | undefined => {
    const entry = archive.byTitle.get(title);
    if (entry === undefined) return undefined;
    return {
      title,
      path: entry.path,
      section: entry.section,
      era: entry.era,
      pair: pairPath(entry, archive),
      links: counts.get(title) ?? 0,
    };
  };

  const nameHits = (query: string, section?: Section): NameHit[] => {
    const match = prefixQuery(query);
    if (match === undefined) return [];
    return names.all(match).flatMap((row) => {
      const at = where(text(row['title']));
      if (at === undefined || (section !== undefined && at.section !== section)) return [];
      return [{ ...at, name: text(row['name']), alias: Number(row['alias']) === 1 }];
    });
  };

  const textHits = (query: string, section?: Section): TextHit[] => {
    const match = wordsQuery(query);
    if (match === undefined) return [];
    return texts.all(match).flatMap((row) => {
      const at = where(text(row['title']));
      if (at === undefined || (section !== undefined && at.section !== section)) return [];
      return [{ ...at, name: displayTitle(at.title), excerpt: text(row['excerpt']) }];
    });
  };

  return {
    search: (query, options = {}) => {
      const limit = options.limit ?? 20;
      const results = foldResults(
        query,
        nameHits(query, options.section),
        textHits(query, options.section),
        limit,
      );
      if (results.length > 0) return { query, results };
      const fuzzy = trigramQuery(query);
      const guess = fuzzy === undefined ? undefined : near.get(fuzzy)?.['name'];
      return guess === undefined ? { query, results } : { query, results, didYouMean: text(guess) };
    },
    resolve: (asked) =>
      Promise.resolve(
        asked.map((name) => ({
          asked: name,
          titles: rankNames(name, nameHits(name))
            .slice(0, NAME_TITLES)
            .map((hit) => ({ title: hit.title, section: hit.section })),
        })),
      ),
  };
}
