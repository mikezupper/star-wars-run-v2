import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  appearancesSection,
  parseAppearanceLine,
  parseAppearances,
} from '../../../src/ingest/wookieepedia/appearances.js';
import { resolveAppearances, resolveArticle } from '../../../src/ingest/wookieepedia/links.js';

const fixture = (name: string) =>
  readFileSync(
    new URL(`../../fixtures/wookieepedia/appearances/${name}.wikitext`, import.meta.url),
    'utf8',
  );

const FILMS = [
  'Star Wars: Episode I The Phantom Menace',
  'Star Wars: Episode II Attack of the Clones',
  'Star Wars: Episode III Revenge of the Sith',
  'Star Wars: Episode IV A New Hope',
  'Star Wars: Episode V The Empire Strikes Back',
  'Star Wars: Episode VI Return of the Jedi',
  'Star Wars: Episode VII The Force Awakens',
  'Star Wars: Episode VIII The Last Jedi',
  'Star Wars: Episode IX The Rise of Skywalker',
];

describe('one Appearances line', () => {
  const line = (text: string, noncanon = false) => parseAppearanceLine(text, noncanon);

  it('reads a link, showing its label', () => {
    expect(line("*[[Kanan 2|''Kanan'' 2]] {{Imo}}")).toEqual({
      text: 'Kanan 2',
      candidates: ['Kanan 2'],
      markers: ['imo'],
    });
  });

  it('reads {{Film}} by Roman or Arabic numeral', () => {
    expect(line('*{{Film|III}}')?.candidates).toEqual([FILMS[2]]);
    expect(line('*{{Film|4}}')?.text).toBe(FILMS[3]);
    expect(line('*{{Film|X}}')).toBeUndefined();
  });

  it('prefers a citation’s story over its book, and drops the disambiguator', () => {
    expect(
      line('*{{WEGCite|story=Infiltration (adventure)|book=Supernova (sourcebook)}} {{Mo}}'),
    ).toEqual({
      text: 'Infiltration',
      candidates: ['Infiltration (adventure)', 'Supernova (sourcebook)'],
      markers: ['mo'],
    });
  });

  it('skips an issue number given first', () => {
    expect(line('*{{JournalCite|11|Spare Parts (short story)|reprint=1}}')?.candidates).toEqual([
      'Spare Parts (short story)',
    ]);
  });

  it('skips URL paths and video IDs, and prefers int= (the article a citation links to)', () => {
    expect(
      line('*{{HoloNetNewsWeb|50|news/1344_1.html|Senator Moe Killed in Blast}} {{Mo}}')?.text,
    ).toBe('Senator Moe Killed in Blast');
    expect(line('*{{YouTube|f2VmOqjV_7Q|Family Reunion &ndash; and Farewell}}')?.text).toBe(
      'Family Reunion – and Farewell',
    );
    expect(
      line('*{{HoloNetNewsTumblr|post/9268/report|Report: Revolt|int=HoloNet News Report: Revolt}}')
        ?.candidates,
    ).toEqual(['HoloNet News Report: Revolt', 'Report: Revolt']);
    expect(line('*{{Hunters|url=news/ranked-mode|text=Introducing Ranked Mode}}')?.text).toBe(
      'Introducing Ranked Mode',
    );
  });

  it('reads other numbered series, whatever the template name\u2019s case', () => {
    expect(line('*{{VaderImmortal|II}}')?.candidates).toEqual(['Vader Immortal – Episode II']);
    expect(line('*{{film|6}}')?.text).toBe(FILMS[5]);
  });

  it('keeps marker codes and drops notes ({{C}}, {{Ab}})', () => {
    expect(
      line('*{{TheMandalorian|Chapter 9: The Marshal}} {{C|Easter egg}} {{Flash}}')?.markers,
    ).toEqual(['flash']);
  });

  it('flags non-canon lines, and ignores lines naming no work', () => {
    expect(line('*[[Phineas and Ferb: Star Wars]]', true)?.noncanon).toBe(true);
    expect(line('*{{Mo}}')).toBeUndefined();
    expect(line('* just words')).toBeUndefined();
  });
});

describe('the Appearances section', () => {
  it('stops at the next level-2 heading, and is empty without one', () => {
    expect(
      appearancesSection('Lead.\n==Appearances==\n*[[A]]\n===Sub===\n*[[B]]\n==Sources==\n*[[C]]'),
    ).toBe('\n*[[A]]\n===Sub===\n*[[B]]\n');
    expect(appearancesSection('==Appearances==\n*[[A]]')).toBe('\n*[[A]]');
    expect(parseAppearances('No section here.')).toEqual([]);
  });

  it('marks items under a non-canon subheading', () => {
    const items = parseAppearances(
      '==Appearances==\n*[[A]]\n===Non-canon appearances===\n*[[B]]\n',
    );
    expect(items.map((a) => [a.text, a.noncanon])).toEqual([
      ['A', undefined],
      ['B', true],
    ]);
  });

  it('reads the saga films: III to IX for Luke Skywalker (born in III), all nine for C-3PO', () => {
    const canon = (name: string) =>
      new Set(
        parseAppearances(fixture(name))
          .filter((a) => a.noncanon !== true)
          .flatMap((a) => a.candidates),
      );
    const luke = canon('luke-skywalker');
    expect(FILMS.filter((f) => luke.has(f))).toEqual(FILMS.slice(2));
    expect(FILMS.filter((f) => canon('c-3po').has(f))).toEqual(FILMS);
    expect(parseAppearances(fixture('luke-skywalker')).some((a) => a.noncanon === true)).toBe(true);
  }, 20_000);

  it('reads every fixture without losing a work line', () => {
    for (const name of ['c-3po', 'luke-skywalker-legends', 'millennium-falcon', 'tatooine']) {
      const text = fixture(name);
      const lines = text.split('\n').filter((l) => /^\*\s*(\[\[|\{\{)/.test(l)).length;
      // Lines that hold only a marker or a file link name no work; there are few.
      expect(parseAppearances(text).length).toBeGreaterThan(lines * 0.97);
    }
  });
});

describe('resolving appearances', () => {
  const titles = {
    articles: new Set(['Star Wars: Episode IV A New Hope', 'Supernova (sourcebook)']),
    redirects: new Map([['A New Hope', 'Star Wars: Episode IV A New Hope']]),
  };

  it('links the first candidate that lands, following redirects', () => {
    const [ive, wegs, missing] = resolveAppearances(
      [
        { text: 'A New Hope', candidates: ['A New Hope'], markers: [] },
        {
          text: 'Infiltration',
          candidates: ['Infiltration (adventure)', 'Supernova (sourcebook)'],
          markers: ['mo'],
        },
        { text: 'Lost', candidates: ['Lost'], markers: [] },
      ],
      titles,
    );
    expect(ive).toEqual({
      text: 'A New Hope',
      link: 'Star Wars: Episode IV A New Hope',
      markers: [],
    });
    expect(wegs?.link).toBe('Supernova (sourcebook)');
    expect(missing).toEqual({ text: 'Lost', markers: [] });
  });

  it('merges a work listed twice, keeping both lines’ markers', () => {
    const merged = resolveAppearances(
      [
        { text: 'X', candidates: ['A New Hope'], markers: ['mo'] },
        { text: 'Y', candidates: ['Star Wars: Episode IV A New Hope'], markers: ['voice', 'mo'] },
        { text: 'Y', candidates: ['A New Hope'], markers: [], noncanon: true },
      ],
      titles,
    );
    expect(merged).toEqual([
      { text: 'X', link: 'Star Wars: Episode IV A New Hope', markers: ['mo', 'voice'] },
      { text: 'Y', link: 'Star Wars: Episode IV A New Hope', markers: [], noncanon: true },
    ]);
  });

  it('adds appearances to the article only when there are some', () => {
    const t = { articles: new Set(['B']), redirects: new Map<string, string>() };
    expect(resolveArticle('A', 'Lead.', t)).not.toHaveProperty('appearances');
    expect(resolveArticle('A', 'Lead.\n==Appearances==\n*[[B]]', t).appearances).toEqual([
      { text: 'B', link: 'B', markers: [] },
    ]);
  });
});
