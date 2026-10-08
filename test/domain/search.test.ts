import { describe, expect, it } from 'vitest';
import {
  excerptRuns,
  foldResults,
  prefixQuery,
  rankNames,
  tokens,
  trigramQuery,
  wordsQuery,
  type NameHit,
  type TextHit,
} from '../../src/domain/search.js';

const hit = (name: string, over: Partial<NameHit> = {}): NameHit => ({
  name,
  alias: false,
  title: name,
  path: `/characters/${tokens(name).join('-')}/`,
  section: 'characters',
  era: 'canon',
  pair: `/characters/${tokens(name).join('-')}/`,
  links: 10,
  ...over,
});

describe('search ranking', () => {
  it('folds accents and case into words', () => {
    expect(tokens('Padmé Amidala-Naberrie')).toEqual(['padme', 'amidala', 'naberrie']);
  });

  it('wants every word to start a word of the name, and ranks the whole name first', () => {
    const ranked = rankNames('luke sky', [
      hit('Luke Skywalker', { links: 3000 }),
      hit('Luke Skywalker and the Shadows of Mindor', { links: 50 }),
      hit('Lukas Skyrider', { links: 5000 }),
      hit('Skywalker family', { links: 9000 }),
    ]);
    // "Lukas" doesn't start with "luke"; the family has no "luke" at all.
    expect(ranked.map((h) => h.name)).toEqual([
      'Luke Skywalker',
      'Luke Skywalker and the Shadows of Mindor',
    ]);
  });

  it('counts a redirect only as the whole query', () => {
    const vader = hit('Darth Vader', { alias: true, title: 'Anakin Skywalker', links: 4000 });
    expect(rankNames('vader', [vader])).toEqual([]);
    expect(rankNames('darth vader', [vader])).toEqual([vader]);
  });

  it('prefers canon when popularity is close, and keeps one hit per article', () => {
    const canon = hit('Yoda', { links: 1000 });
    const legends = hit('Yoda', { era: 'legends', path: '/characters/yoda-legends/', links: 1100 });
    const alias = hit('Master Yoda', { alias: true, title: 'Yoda', links: 1000 });
    expect(rankNames('yoda', [legends, canon, alias]).map((h) => h.path)).toEqual([
      '/characters/yoda/',
      '/characters/yoda-legends/',
    ]);
    expect(rankNames('   ', [canon])).toEqual([]);
  });
});

describe('search results', () => {
  const sidious = hit('Darth Sidious', { links: 3000 });
  const palpatine = hit('Palpatine', {
    era: 'legends',
    path: '/characters/palpatine-legends/',
    pair: sidious.path,
    links: 3500,
  });
  const text: TextHit = {
    ...hit('Mas Amedda', { links: 400 }),
    excerpt: 'served \u0001Palpatine\u0002 as vice chair',
  };

  it('fold twins under the canon name, then add text matches with their excerpts', () => {
    const results = foldResults('palpatine', [palpatine, sidious], [text], 10);
    expect(results.map((r) => [r.name, r.eras.map((e) => e.era)])).toEqual([
      ['Palpatine', ['legends']],
      ['Mas Amedda', ['canon']],
    ]);
    const both = foldResults(
      'darth',
      [sidious, hit('Palpatine', { ...palpatine, name: 'Darth Palpatine' })],
      [],
      10,
    );
    expect(both[0]).toMatchObject({ name: 'Darth Sidious', path: sidious.path });
    expect(both[0]?.eras.map((e) => e.era)).toEqual(['canon', 'legends']);
    expect(foldResults('palpatine', [palpatine], [text], 1)).toHaveLength(1);
  });

  it('keep the excerpt as runs: marked words, and nothing to trust', () => {
    expect(excerptRuns('a \u0001<b>\u0002 c\u0001d\u0002')).toEqual([
      { text: 'a ', mark: false },
      { text: '<b>', mark: true },
      { text: ' c', mark: false },
      { text: 'd', mark: true },
    ]);
  });
});

describe('search queries', () => {
  it('build FTS5 queries from words only, so no operator gets through', () => {
    expect(prefixQuery('Luke "sky" OR NEAR')).toBe('"luke"* AND "sky"* AND "or"* AND "near"*');
    expect(wordsQuery('Death Star')).toBe('"death" AND "star"');
    expect(trigramQuery('skywlker')).toBe('"sky" OR "kyw" OR "ywl" OR "wlk" OR "lke" OR "ker"');
    expect(prefixQuery('!!')).toBeUndefined();
    expect(wordsQuery('')).toBeUndefined();
    expect(trigramQuery('ab')).toBeUndefined();
  });
});
