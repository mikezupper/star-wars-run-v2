// Link resolution for the ingest: a link names a title as the author typed it; the snapshot
// stores the article it lands on, following redirects. A link to no article becomes text.
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

/** The article with every link pointing at the article it lands on, or turned into text. */
export const resolveLinks = (article: ParsedArticle, titles: Titles): ParsedArticle => ({
  ...article,
  fields: article.fields.map((f) => ({
    name: f.name,
    items: f.items.map((i) => resolveRich(i, titles)),
  })),
  lead: article.lead.map((p) => resolveRich(p, titles)),
});

/** One article, parsed and resolved, as a snapshot line; a parse failure is reported, not thrown. */
export function parseOne(
  title: string,
  text: string,
  titles: Titles,
): Line | { title: string; error: string } {
  try {
    return articleLine(title, resolveLinks(parseArticle(title, text), titles));
  } catch (error) {
    return { title, error: error instanceof Error ? error.message : String(error) };
  }
}
