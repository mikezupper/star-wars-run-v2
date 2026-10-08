// The archive's links, turned around: for each article, how many articles link to it and which
// of those are best known. A page shows the count ("linked from 3,729 articles") and the best
// known of them ("Linked from"); search and Ask rank by the count (src/domain/search.ts).
import type { ArticleRecord, Rich } from './article.js';

/** The articles this one links to, from its lead, its facts and its appearances; not itself. */
export function outgoing(article: ArticleRecord): Set<string> {
  const targets = new Set<string>();
  const add = (runs: Rich) => {
    for (const run of runs) if ('link' in run) targets.add(run.link);
  };
  for (const paragraph of article.lead) add(paragraph);
  for (const field of article.fields) for (const item of field.items) add(item);
  for (const a of article.appearances ?? []) if (a.link !== undefined) targets.add(a.link);
  targets.delete(article.title);
  return targets;
}

/**
 * How many articles link to each article: from their lead, facts and Appearances. A
 * disambiguation page or a stub has a handful; Luke Skywalker has thousands.
 */
export function inboundLinks(articles: Iterable<ArticleRecord>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const t of outgoing(article)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

export interface LinkGraph {
  /** Title → how many articles link to it. */
  readonly counts: ReadonlyMap<string, number>;
  /** Title → the best-known articles that link to it, best first. */
  readonly linkedFrom: ReadonlyMap<string, readonly string[]>;
}

/** How many of an article's best-known linkers a page shows. */
export const LINKED_FROM_LIMIT = 12;

/**
 * Two passes over every article: the counts, then each target's best-known linkers, kept as a
 * short sorted list per target. On the full archive (227k articles, 4 million links) the cost
 * is allocation, not arithmetic: each pass works out an article's links afresh rather than
 * holding them all, and the lists hold article numbers compared by a precomputed rank.
 */
export function linkGraph(articles: Iterable<ArticleRecord>, limit = LINKED_FROM_LIMIT): LinkGraph {
  const all = [...articles];
  const counts = new Map<string, number>();
  for (const article of all) {
    for (const t of outgoing(article)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  // rank[i]: article i's place in the whole archive, best known first, ties in title order (so
  // the lists don't depend on file order). Lower is better.
  const order = all.map((_, i) => i);
  const score = all.map((a) => counts.get(a.title) ?? 0);
  order.sort((a, b) => {
    const byScore = (score[b] ?? 0) - (score[a] ?? 0);
    if (byScore !== 0) return byScore;
    const [ta, tb] = [all[a]?.title ?? '', all[b]?.title ?? ''];
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  const rank = new Int32Array(all.length);
  order.forEach((article, place) => (rank[article] = place));

  const lists = new Map<string, number[]>();
  all.forEach((article, i) => {
    const r = rank[i] ?? 0;
    for (const target of outgoing(article)) {
      let list = lists.get(target);
      if (list === undefined) lists.set(target, (list = []));
      if (list.length === limit && r > (rank[list[limit - 1] ?? 0] ?? 0)) continue;
      let at = list.length;
      while (at > 0 && r < (rank[list[at - 1] ?? 0] ?? 0)) at -= 1;
      list.splice(at, 0, i);
      if (list.length > limit) list.pop();
    }
  });
  const linkedFrom = new Map<string, readonly string[]>();
  for (const [target, list] of lists) {
    linkedFrom.set(
      target,
      list.map((i) => all[i]?.title ?? ''),
    );
  }
  return { counts, linkedFrom };
}
