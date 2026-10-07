// The title index (swr-357): Pagefind ranks by text, so at 227k pages the obvious answer gets
// buried ("tatooine" lists Tatooine wine before the planet; "luke" lists stunt performers named
// Luke). This index answers title matches first, ranked by how many articles link to each one.
// The build writes it as shards, one per three-letter word start (`luk`, `tat`); the search
// island fetches the shard for the query and puts its best matches above Pagefind's.
// Pure, so the build (src/render, scripts) and the browser (src/islands) share it.
import type { ArticleRecord } from './article.js';
import { displayTitle, type Archive } from './archive.js';
import type { Section } from './sections.js';

/**
 * One title in a shard: [name shown, page path, section, popularity score, 1 if Legends, and
 * the redirect it's found by, if any]. "Darth Vader" is a redirect: its row shows Anakin
 * Skywalker and matches "vader".
 */
export type TitleRow = readonly [
  name: string,
  path: string,
  section: Section,
  score: number,
  legends: 0 | 1,
  alias?: string,
];

/** The text a row matches against: its alias when it has one. */
const matchText = (row: TitleRow): string => row[5] ?? row[0];

/** A shard with more rows than this is split by four letters; the three-letter file keeps the best. */
export const SHARD_MAX = 2000;

/** `Padmé Amidala` → `['padme', 'amidala']`: lower case ASCII letters and digits. */
export const tokens = (text: string): string[] =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== '');

/** The shard a word belongs to: its first three letters (shorter words are their own key). */
export const shardKey = (token: string, length = 3): string => token.slice(0, length);

/**
 * How many articles link to each article: from their lead, facts and Appearances. A
 * disambiguation page or a stub has a handful; Luke Skywalker has thousands.
 */
export function inboundLinks(articles: Iterable<ArticleRecord>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const article of articles) {
    const targets = new Set<string>();
    for (const runs of [...article.lead, ...article.fields.flatMap((f) => f.items)]) {
      for (const run of runs) if ('link' in run) targets.add(run.link);
    }
    for (const a of article.appearances ?? []) if (a.link !== undefined) targets.add(a.link);
    targets.delete(article.title);
    for (const t of targets) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

/** log2(links + 1), to one decimal: 0 for no links, about 13 for Luke Skywalker. */
export const popularity = (links: number): number => Math.round(Math.log2(links + 1) * 10) / 10;

export interface TitleShards {
  /** File name (`luk.json`) → its rows, best first. */
  readonly files: ReadonlyMap<string, readonly TitleRow[]>;
  /** Three-letter keys whose shard is split by four letters. */
  readonly split: readonly string[];
}

/** Redirect chains longer than this are broken (they loop); the ingest uses the same limit. */
const MAX_HOPS = 5;

/**
 * Every article's title and every redirect to one, filed under each of their words' keys.
 * Disambiguation pages are left out, and so are redirects that only change case or spelling
 * marks ("Padme Amidala" for "Padmé Amidala"): the title already matches them.
 */
export function titleShards(
  archive: Archive,
  links: ReadonlyMap<string, number>,
  redirects: ReadonlyMap<string, string> = new Map(),
  max = SHARD_MAX,
): TitleShards {
  const byKey = new Map<string, TitleRow[]>();
  const add = (key: string, row: TitleRow) => {
    const rows = byKey.get(key) ?? [];
    rows.push(row);
    byKey.set(key, rows);
  };
  const file = (row: TitleRow) => {
    for (const token of new Set(tokens(matchText(row)))) {
      add(shardKey(token), row);
      if (token.length >= 4) add(`+${shardKey(token, 4)}`, row);
    }
  };
  const rowOf = (title: string, alias?: string): TitleRow | undefined => {
    const entry = archive.byTitle.get(title);
    if (entry === undefined || /\(disambiguation\)$/.test(title)) return undefined;
    const name = displayTitle(title);
    const score = popularity(links.get(title) ?? 0);
    const legends = entry.era === 'legends' ? 1 : 0;
    return alias === undefined
      ? [name, entry.path, entry.section, score, legends]
      : [name, entry.path, entry.section, score, legends, alias];
  };
  for (const title of archive.byTitle.keys()) {
    const row = rowOf(title);
    if (row !== undefined) file(row);
  }
  for (const [from, to] of redirects) {
    let target: string | undefined = to;
    for (
      let hop = 0;
      target !== undefined && !archive.byTitle.has(target) && hop < MAX_HOPS;
      hop++
    ) {
      target = redirects.get(target);
    }
    if (target === undefined) continue;
    const alias = displayTitle(from);
    if (tokens(alias).join(' ') === tokens(displayTitle(target)).join(' ')) continue;
    const row = rowOf(target, alias);
    if (row !== undefined) file(row);
  }
  const best = (rows: TitleRow[]) =>
    rows.sort((a, b) => b[3] - a[3] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  // `+luke` → under `luk`: the four-letter keys, ready for a three-letter shard that splits.
  const subKeys = new Map<string, string[]>();
  for (const key of byKey.keys()) {
    if (!key.startsWith('+')) continue;
    const parent = key.slice(1, 4);
    subKeys.set(parent, [...(subKeys.get(parent) ?? []), key]);
  }
  const files = new Map<string, readonly TitleRow[]>();
  const split: string[] = [];
  for (const [key, rows] of byKey) {
    if (key.startsWith('+')) continue;
    if (rows.length <= max) {
      files.set(`${key}.json`, best(rows));
      continue;
    }
    split.push(key);
    files.set(`${key}.json`, best(rows).slice(0, max));
    for (const sub of subKeys.get(key) ?? []) {
      files.set(`${sub.slice(1)}.json`, best(byKey.get(sub) ?? []));
    }
  }
  return { files, split: split.sort() };
}

/** The shard file to fetch for a query, or undefined when it has no word to look up. */
export function shardFor(query: string, split: ReadonlySet<string>): string | undefined {
  const longest = tokens(query).sort((a, b) => b.length - a.length)[0];
  if (longest === undefined) return undefined;
  const key = shardKey(longest);
  return `${split.has(key) && longest.length >= 4 ? shardKey(longest, 4) : key}.json`;
}

/**
 * The rows matching a query, best first: every query word must start a word of the title, or
 * the query must be a whole redirect. Popularity decides, plus a bonus for the whole title
 * matching or starting the same way, so "tatooine" puts the planet first and "sky" puts the
 * Skywalkers above Sky-dreadnaught.
 */
export function rankTitles(
  query: string,
  rows: readonly TitleRow[],
  section?: Section,
): TitleRow[] {
  const words = tokens(query);
  if (words.length === 0) return [];
  const whole = words.join(' ');
  // A page found by its title and by a redirect counts once, at its better score.
  const best = new Map<string, [TitleRow, number]>();
  for (const row of rows) {
    if (section !== undefined && row[2] !== section) continue;
    const title = tokens(matchText(row));
    const joined = title.join(' ');
    // A redirect counts only when it's the whole query: "vader" finds Anakin Skywalker, but
    // "sky" mustn't find the galaxy through its redirect "Skyriver".
    if (
      row[5] !== undefined
        ? joined !== whole
        : !words.every((w) => title.some((t) => t.startsWith(w)))
    )
      continue;
    const bonus = joined === whole ? 4 : joined.startsWith(whole) ? 1 : 0;
    // Canon first when popularity is close, as on Wookieepedia: Legends pages often have more links.
    const score = row[3] + bonus - (row[4] === 1 ? 1 : 0);
    const seen = best.get(row[1]);
    if (seen === undefined || score > seen[1]) best.set(row[1], [row, score]);
  }
  return [...best.values()]
    .sort((a, b) => b[1] - a[1] || a[0][0].length - b[0][0].length)
    .map(([row]) => row);
}

/**
 * A row's exact article title, for matching in Explore's tables: the name shown, plus
 * "/Legends" when the row is the Legends article of a title that canon also has (its path
 * ends in -legends; a Legends-only article keeps its plain title).
 */
export const titleOfRow = (row: TitleRow): string =>
  row[4] === 1 && row[1].endsWith('-legends/') ? `${row[0]}/Legends` : row[0];
