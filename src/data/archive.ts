// Loads what the site renders (ADR 0008): the archive's address book and the articles, from
// the Wookieepedia snapshot. With `sample`, only the first articles of each section plus a few
// well-known ones: the gate's quick build (`SITE_SAMPLE=20`).
import { buildArchive, sampleSummaries, type Summary } from '../domain/archive.js';
import type { ArticleRecord } from '../domain/article.js';
import type { Archive } from '../domain/archive.js';
import { loadArticles, loadWookieepediaIndex, WOOKIEEPEDIA_DIR } from './wookieepedia.js';

/** Always in a sample build, so tests and smoke checks have familiar pages to look for. */
export const FEATURED = [
  'Luke Skywalker',
  'Luke Skywalker/Legends',
  'Anakin Skywalker',
  'Shmi Skywalker Lars',
  'Tatooine',
  'Millennium Falcon',
  'Star Wars: Episode IV A New Hope',
  'Wookiee',
  'Human',
  'Galactic Empire',
  'Battle of Yavin',
  'Padmé Amidala Naberrie',
] as const;

export async function loadSiteData(
  options: { readonly sample?: number; readonly dir?: string } = {},
): Promise<{
  archive: Archive;
  articles: Map<string, ArticleRecord>;
  /** Redirect title → target, for the search title index (swr-357). */
  redirects: ReadonlyMap<string, string>;
}> {
  const dir = options.dir ?? WOOKIEEPEDIA_DIR;
  const index = await loadWookieepediaIndex(dir);
  let summaries: Summary[] = [...index.articles.values()];
  if (options.sample !== undefined) {
    const wanted = new Set<string>(FEATURED);
    const picked = sampleSummaries(summaries, options.sample);
    summaries = [...picked, ...summaries.filter((s) => wanted.has(s.title) && !picked.includes(s))];
  }
  const archive = buildArchive(summaries);
  const articles = await loadArticles(dir, options.sample === undefined ? undefined : new Set(archive.byTitle.keys()));
  return { archive, articles, redirects: index.redirects };
}
