// A small archive from the real Wookieepedia fixtures (test/fixtures/wookieepedia/), parsed and
// linked the way the ingest does it: links to articles outside these 15 become text. Where
// wookieepedia/appearances/ has the article's Appearances section, it's appended to the opening.
import { existsSync, readFileSync } from 'node:fs';
import type { ArticleRecord } from '../../src/domain/article.js';
import { buildArchive } from '../../src/domain/archive.js';
import { resolveArticle } from '../../src/ingest/wookieepedia/links.js';

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

let cached: ReturnType<typeof build> | undefined;

/** Parsed once per test file: the Appearances sections make it slow (Luke lists 700 works). */
export const fixtureSiteData = () => (cached ??= build());

function build() {
  const titles = {
    articles: new Set(Object.values(FIXTURE_TITLES)),
    redirects: new Map<string, string>(),
  };
  const articles = new Map<string, ArticleRecord>();
  for (const [file, title] of Object.entries(FIXTURE_TITLES)) {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const section = `./wookieepedia/appearances/${file}.wikitext`;
    const text = [
      read(`./wookieepedia/${file}.wikitext`),
      ...(existsSync(new URL(section, import.meta.url)) ? [read(section)] : []),
    ].join('\n');
    articles.set(title, { title, ...resolveArticle(title, text, titles) });
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
