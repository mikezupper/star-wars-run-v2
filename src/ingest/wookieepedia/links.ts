// Link resolution for the ingest: a link names a title as the author typed it; the snapshot
// stores the article it lands on, following redirects. A link to no article becomes text.
import type { Appearance } from '../../domain/article.js';
import { parseAppearances, type ParsedAppearance } from './appearances.js';
import { articleLine, type Line } from './snapshot.js';
import {
  normaliseTitle,
  parseArticle,
  type ParsedArticle,
  type Rich,
  type Run,
} from './wikitext.js';

export interface Titles {
  /** Every article title (namespace 0, not a redirect). */
  readonly articles: ReadonlySet<string>;
  /** Redirect title → target title, as the dump states them. */
  readonly redirects: ReadonlyMap<string, string>;
}

/** Redirect chains longer than this are treated as broken (they loop or are vandalism). */
const MAX_HOPS = 5;

/** The article a title lands on, or `undefined` when it lands on none. */
export function resolveTitle(title: string, titles: Titles): string | undefined {
  let current = normaliseTitle(title);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (titles.articles.has(current)) return current;
    const next = titles.redirects.get(current);
    if (next === undefined) return undefined;
    current = normaliseTitle(next);
  }
  return undefined;
}

function resolveRich(rich: Rich, titles: Titles): Rich {
  const out: Run[] = [];
  for (const run of rich) {
    const target = 'link' in run ? resolveTitle(run.link, titles) : undefined;
    const next: Run = target === undefined ? { text: run.text } : { text: run.text, link: target };
    const last = out.at(-1);
    if (last !== undefined && !('link' in last) && !('link' in next)) {
      out[out.length - 1] = { text: last.text + next.text };
    } else {
      out.push(next);
    }
  }
  return out;
}

/**
 * The article with every link pointing at the article it lands on, or turned into text; its
 * counterpart likewise, kept only when it lands on one. Keys in a fixed order: title, era, kind
 * and counterpart lead each snapshot line, where the index reads them (src/data/wookieepedia.ts).
 */
export const resolveLinks = (article: ParsedArticle, titles: Titles): ParsedArticle => {
  const twin =
    article.counterpart === undefined ? undefined : resolveTitle(article.counterpart, titles);
  return {
    era: article.era,
    ...(article.kind === undefined ? {} : { kind: article.kind }),
    ...(twin === undefined ? {} : { counterpart: twin }),
    fields: article.fields.map((f) => ({
      name: f.name,
      items: f.items.map((i) => resolveRich(i, titles)),
    })),
    lead: article.lead.map((p) => resolveRich(p, titles)),
    ...(article.appearances === undefined ? {} : { appearances: article.appearances }),
  };
};

/**
 * Appearances with links: each takes the first candidate that lands on an article. A work listed
 * twice (once per marker, or once per printing) becomes one entry with both lines' markers.
 */
export function resolveAppearances(
  parsed: readonly ParsedAppearance[],
  titles: Titles,
): Appearance[] {
  const out: Appearance[] = [];
  const seen = new Map<string, number>();
  for (const a of parsed) {
    const link = a.candidates.map((c) => resolveTitle(c, titles)).find((t) => t !== undefined);
    const key = `${a.noncanon === true ? '!' : ''}${link ?? a.text}`;
    const index = seen.get(key);
    const previous = index === undefined ? undefined : out[index];
    if (index !== undefined && previous !== undefined) {
      const markers = [...new Set([...previous.markers, ...a.markers])];
      out[index] = { ...previous, markers };
      continue;
    }
    seen.set(key, out.length);
    out.push({
      text: a.text === '' ? (link ?? '') : a.text,
      ...(link === undefined ? {} : { link }),
      markers: a.markers,
      ...(a.noncanon === true ? { noncanon: true as const } : {}),
    });
  }
  return out;
}

/** The article's links and Appearances resolved; the section is read from the full wikitext. */
export function resolveArticle(title: string, text: string, titles: Titles): ParsedArticle {
  const article = resolveLinks(parseArticle(title, text), titles);
  const appearances = resolveAppearances(parseAppearances(text), titles);
  return appearances.length === 0 ? article : { ...article, appearances };
}

/** One article, parsed and resolved, as a snapshot line; a parse failure is reported, not thrown. */
export function parseOne(
  title: string,
  text: string,
  titles: Titles,
): Line | { title: string; error: string } {
  try {
    return articleLine(title, resolveArticle(title, text, titles));
  } catch (error) {
    return { title, error: error instanceof Error ? error.message : String(error) };
  }
}
