// A small archive from the real Wookieepedia fixtures (test/fixtures/wookieepedia/), parsed and
// linked the way the ingest does it: links to articles outside these 15 become text.
import { readFileSync } from 'node:fs';
import type { ArticleRecord } from '../../src/domain/article.js';
import { buildArchive } from '../../src/domain/archive.js';
import { resolveLinks } from '../../src/ingest/wookieepedia/links.js';
import { parseArticle } from '../../src/ingest/wookieepedia/wikitext.js';

/** Fixture file → the article's title. */
export const FIXTURE_TITLES: Readonly<Record<string, string>> = {
  'all-terrain-armored-transport': 'All Terrain Armored Transport',
  'battle-of-yavin': 'Battle of Yavin',
  'c-3po': 'C-3PO',
  coruscant: 'Coruscant',
  'galactic-empire': 'Galactic Empire',
  'han-solo': 'Han Solo',
  hoth: 'Hoth',
  'luke-skywalker': 'Luke Skywalker',
  'luke-skywalker-legends': 'Luke Skywalker/Legends',
  'millennium-falcon': 'Millennium Falcon',
  revan: 'Revan',
  'star-wars-episode-iv-a-new-hope': 'Star Wars: Episode IV A New Hope',
  't-65b-x-wing-starfighter': 'T-65B X-wing starfighter',
  tatooine: 'Tatooine',
  wookiee: 'Wookiee',
};

export function fixtureSiteData() {
  const titles = {
    articles: new Set(Object.values(FIXTURE_TITLES)),
    redirects: new Map<string, string>(),
  };
  const articles = new Map<string, ArticleRecord>();
  for (const [file, title] of Object.entries(FIXTURE_TITLES)) {
    const text = readFileSync(new URL(`./wookieepedia/${file}.wikitext`, import.meta.url), 'utf8');
    articles.set(title, { title, ...resolveLinks(parseArticle(title, text), titles) });
  }
  const archive = buildArchive(
    [...articles.values()].map(({ title, era, kind }) => ({
      title,
      era,
      ...(kind === undefined ? {} : { kind }),
    })),
  );
  return { archive, articles };
}
