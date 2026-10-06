import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '../../src/domain/article.js';
import { buildArchive } from '../../src/domain/archive.js';
import {
  inboundLinks,
  popularity,
  rankTitles,
  shardFor,
  shardKey,
  titleShards,
  tokens,
  type TitleRow,
} from '../../src/domain/titles.js';
import { fixtureSiteData } from '../fixtures/archive.js';

const row = (
  name: string,
  score: number,
  options: { legends?: boolean; alias?: string; section?: TitleRow[2] } = {},
): TitleRow => {
  const slug = [...tokens(name), ...(options.legends === true ? ['legends'] : [])].join('-');
  const path = `/${options.section ?? 'other'}/${slug}/`;
  const base = [
    name,
    path,
    options.section ?? 'other',
    score,
    options.legends === true ? 1 : 0,
  ] as const;
  return options.alias === undefined ? base : [...base, options.alias];
};

describe('words and keys', () => {
  it('splits titles into lower-case ASCII words, dropping accents and punctuation', () => {
    expect(tokens('Padmé Amidala')).toEqual(['padme', 'amidala']);
    expect(tokens('C-3PO')).toEqual(['c', '3po']);
    expect(tokens(' -- ')).toEqual([]);
  });

  it('files a word under its first three letters, or four', () => {
    expect(shardKey('skywalker')).toBe('sky');
    expect(shardKey('skywalker', 4)).toBe('skyw');
    expect(shardKey('r2')).toBe('r2');
  });

  it('looks up the longest word of a query, by four letters when its shard is split', () => {
    expect(shardFor('luke skywalker', new Set())).toBe('sky.json');
    expect(shardFor('luke skywalker', new Set(['sky']))).toBe('skyw.json');
    expect(shardFor('sky', new Set(['sky']))).toBe('sky.json');
    expect(shardFor('  ', new Set())).toBeUndefined();
  });
});

describe('popularity', () => {
  // Built while collecting, not under a test's time limit: parsing the fixtures takes a while.
  const { articles } = fixtureSiteData();

  it('counts the articles linking to each article once each, from any part of it', () => {
    const links = inboundLinks(articles.values());
    // Every other fixture character comes from or visits Tatooine; a page never counts itself.
    expect(links.get('Tatooine')).toBeGreaterThan(2);
    expect(links.get('Luke Skywalker')).toBeGreaterThan(0);
    const self: ArticleRecord = {
      title: 'A',
      era: 'canon',
      fields: [{ name: 'x', items: [[{ text: 'A', link: 'A' }], [{ text: 'B', link: 'B' }]] }],
      lead: [[{ text: 'B', link: 'B' }]],
      appearances: [
        { text: 'C', link: 'C', markers: [] },
        { text: 'D', markers: [] },
      ],
    };
    expect([...inboundLinks([self])]).toEqual([
      ['B', 1],
      ['C', 1],
    ]);
  });

  it('scores links on a log scale', () => {
    expect(popularity(0)).toBe(0);
    expect(popularity(1)).toBe(1);
    expect(popularity(1023)).toBe(10);
  });
});

describe('the shards', () => {
  const archive = buildArchive([
    { title: 'Luke Skywalker', era: 'canon', kind: 'Character' },
    { title: 'Luke Skywalker/Legends', era: 'legends', kind: 'Character' },
    { title: 'Skywalker (disambiguation)', era: 'canon' },
    { title: 'Anakin Skywalker', era: 'canon', kind: 'Character' },
  ]);
  const links = new Map([
    ['Luke Skywalker', 1023],
    ['Anakin Skywalker', 3],
  ]);
  const redirects = new Map([
    ['Vader', 'Darth Vader'],
    ['Darth Vader', 'Anakin Skywalker'],
    ['Luke skywalker', 'Luke Skywalker'],
    ['Nowhere', 'Missing page'],
  ]);
  const { files, split } = titleShards(archive, links, redirects);

  it('file each title under each of its words, best first, without disambiguation pages', () => {
    // Legends Luke has no links here, so it scores 0, below Anakin's 2.
    expect(files.get('sky.json')?.map((r) => [r[0], r[3]])).toEqual([
      ['Luke Skywalker', 10],
      ['Anakin Skywalker', 2],
      ['Luke Skywalker', 0],
    ]);
    expect(files.get('luk.json')?.[0]).toEqual([
      'Luke Skywalker',
      '/characters/luke-skywalker/',
      'characters',
      10,
      0,
    ]);
    expect(files.get('luk.json')?.[1]?.[4]).toBe(1);
    expect(split).toEqual([]);
  });

  it('file redirects under their own words, following chains, but not case variants', () => {
    expect(files.get('vad.json')).toEqual([
      ['Anakin Skywalker', '/characters/anakin-skywalker/', 'characters', 2, 0, 'Vader'],
      ['Anakin Skywalker', '/characters/anakin-skywalker/', 'characters', 2, 0, 'Darth Vader'],
    ]);
    expect([...files.values()].flat().some((r) => r[5] === 'Luke skywalker')).toBe(false);
    expect(files.has('now.json')).toBe(false);
  });

  it('split a shard over the limit by four letters, keeping the best in the three-letter file', () => {
    const small = titleShards(archive, links, new Map(), 2);
    expect(small.split).toEqual(['sky']);
    expect(small.files.get('sky.json')).toHaveLength(2);
    expect(small.files.get('skyw.json')).toHaveLength(3);
  });
});

describe('ranking', () => {
  const rows = [
    row('Sky-dreadnaught', 3),
    row('Luke Skywalker', 11, { section: 'characters' }),
    row('Luke Skywalker', 12, { section: 'characters', legends: true }),
    row('Tatooine wine', 4),
    row('Tatooine', 9, { section: 'planets' }),
    row('Anakin Skywalker', 12, { section: 'characters', alias: 'Vader' }),
    row('The galaxy', 13, { alias: 'Skyriver' }),
  ];
  const names = (query: string, section?: TitleRow[2]) =>
    rankTitles(query, rows, section).map((r) => `${r[0]}${r[4] === 1 ? ' (L)' : ''}`);

  it('puts popular titles above text matches, and a whole-title match first', () => {
    expect(names('tatooine')).toEqual(['Tatooine', 'Tatooine wine']);
    expect(names('sky')).toEqual(['Luke Skywalker', 'Luke Skywalker (L)', 'Sky-dreadnaught']);
  });

  it('prefers canon when popularity is close', () => {
    expect(names('luke')).toEqual(['Luke Skywalker', 'Luke Skywalker (L)']);
  });

  it('matches a redirect only as the whole query', () => {
    expect(names('vader')).toEqual(['Anakin Skywalker']);
    expect(names('sky')).not.toContain('The galaxy');
  });

  it('needs every word, keeps to a section, and lists a page once', () => {
    expect(names('luke sky')).toEqual(['Luke Skywalker', 'Luke Skywalker (L)']);
    expect(names('luke tatooine')).toEqual([]);
    expect(names('sky', 'other')).toEqual(['Sky-dreadnaught']);
    expect(names('')).toEqual([]);
    const twice = [row('Anakin Skywalker', 5, { alias: 'Anakin' }), row('Anakin Skywalker', 5)];
    expect(rankTitles('anakin', twice)).toHaveLength(1);
  });
});
