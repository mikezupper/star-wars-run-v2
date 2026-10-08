import { readdirSync, readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  normaliseTitle,
  opening,
  parseArticle,
  type Rich,
} from '../../../src/ingest/wookieepedia/wikitext.js';

const DIR = new URL('../../fixtures/wookieepedia/', import.meta.url);
const fixture = (name: string) => readFileSync(new URL(`${name}.wikitext`, DIR), 'utf8');
const show = (r: Rich) => r.map((x) => ('link' in x ? `[${x.text}→${x.link}]` : x.text)).join('');

// Parsing all fifteen real articles takes seconds, more on a busy machine.
describe('real articles', { timeout: 30_000 }, () => {
  const luke = parseArticle('Luke Skywalker', fixture('luke-skywalker'));
  const get = (name: string) => luke.fields.find((f) => f.name === name)?.items.map(show);

  it('reads the era and infobox kind', () => {
    expect(luke.era).toBe('canon');
    expect(luke.kind).toBe('Character');
    expect(parseArticle('Luke Skywalker/Legends', fixture('luke-skywalker-legends')).era).toBe(
      'legends',
    );
  });

  it('reads the twin in the other continuity that {{Top}} names, if any', () => {
    expect(luke.counterpart).toBeUndefined();
    expect(
      parseArticle('T-65B X-wing starfighter', fixture('t-65b-x-wing-starfighter')).counterpart,
    ).toBe('T-65 X-wing starfighter');
    // As the dump has it: `legends=` on the canon article.
    expect(
      parseArticle('Darth Sidious', '{{Top|sprot|legends=Palpatine/Legends}}\nThe Sith.')
        .counterpart,
    ).toBe('Palpatine/Legends');
    expect(
      parseArticle('Palpatine/Legends', '{{Top|leg|canon=Darth Sidious}}\nThe Sith.').counterpart,
    ).toBe('Darth Sidious');
    expect(parseArticle('Darth Sidious', '{{Top|leg=Palpatine}}\nThe Sith.').counterpart).toBe(
      'Palpatine',
    );
    expect(parseArticle('Palpatine', '{{Top|leg|can=Darth Sidious}}\nThe Sith.')).toMatchObject({
      era: 'legends',
      counterpart: 'Darth Sidious',
    });
    expect(parseArticle('Hoth', '{{Top|leg=}}\nIce.').counterpart).toBeUndefined();
  });

  it('turns fields into clean text with links, dropping citations and images', () => {
    expect(get('homeworld')).toEqual(['[Tatooine→Tatooine]']);
    expect(get('height')).toEqual(['1.72 [meters→Meter] (5 [ft→Foot], 8 in)']);
    expect(get('birth')).toEqual([
      '(2 [days→Standard day] after [Empire Day→Empire Day]), [19 BBY→19 BBY], [Polis Massa→Polis Massa]',
    ]);
    expect(luke.fields.map((f) => f.name)).not.toContain('image');
  });

  it('splits listed values into items, without stray commas left by citations', () => {
    expect(get('hair')).toEqual([
      '[Blond→Color] ([1 BBY→1 BBY])',
      'Ash-brown ([21 ABY→21 ABY])',
      'Gray and white ([34 ABY→34 ABY])',
    ]);
  });

  it('takes the lead paragraphs, without the epigraph quote', () => {
    const first = show(luke.lead[0] ?? []);
    expect(first).toMatch(/^Luke Skywalker, a \[Force-sensitive→Force-sensitive\]/);
    expect(first).toContain('[Galactic Empire→Galactic Empire]');
    expect(luke.lead.map(show).join(' ')).not.toContain('I am a Jedi');
  });

  it('finds the infobox past maintenance banners that also have named fields', () => {
    expect(parseArticle('C-3PO', fixture('c-3po')).kind).toBe('Droid');
  });

  it.each([
    ['Tatooine', 'tatooine', 'CelestialBody'],
    ['Millennium Falcon', 'millennium-falcon', 'IndividualShip'],
    ['Wookiee', 'wookiee', 'Species'],
    ['T-65B X-wing starfighter', 't-65b-x-wing-starfighter', 'StarshipClass'],
    ['Star Wars: Episode IV A New Hope', 'star-wars-episode-iv-a-new-hope', 'Movie'],
    ['Battle of Yavin', 'battle-of-yavin', 'Battle'],
  ])('%s is a %s… with fields and a lead', (title, name, kind) => {
    const article = parseArticle(title, fixture(name));
    expect(article.kind).toBe(kind);
    expect(article.fields.length).toBeGreaterThan(5);
    expect(article.lead.length).toBeGreaterThan(0);
  });

  it('keeps every value as text and links only: no wikitext survives', () => {
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.wikitext'))) {
      const article = parseArticle(file, readFileSync(new URL(file, DIR), 'utf8'));
      const all = [...article.fields.flatMap((f) => f.items), ...article.lead].map(show).join('\n');
      expect(all, file).not.toMatch(/\{\{|\}\}|<ref|<!--|\[\[|'''/);
    }
  });

  it('parse all fixtures to the reviewed output', async () => {
    const out = Object.fromEntries(
      readdirSync(DIR)
        .filter((f) => f.endsWith('.wikitext'))
        .sort()
        .map((file) => {
          const a = parseArticle(file, readFileSync(new URL(file, DIR), 'utf8'));
          return [
            file,
            {
              era: a.era,
              kind: a.kind,
              fields: Object.fromEntries(a.fields.map((f) => [f.name, f.items.map(show)])),
              lead: a.lead.map(show),
            },
          ];
        }),
    );
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(
      './__snapshots__/fixtures.json',
    );
  });
});

describe('edge cases', () => {
  const lead = (wikitext: string) => parseArticle('X', wikitext).lead.map(show);

  it('keeps only the text of interwiki and namespace links, and of external links', () => {
    expect(
      lead('A [[w:c:lego:Luke|Lego Luke]] and [[de:Luke]] and [https://x.y the site].'),
    ).toEqual(['A Lego Luke and and the site.']);
  });

  it('treats titles with a spaced colon as articles', () => {
    expect(lead('See [[Star Wars: Episode IV A New Hope]].')).toEqual([
      'See [Star Wars: Episode IV A New Hope→Star Wars: Episode IV A New Hope].',
    ]);
  });

  it('degrades unknown templates to their first argument, and keeps <nowiki> text', () => {
    expect(lead('A {{Mystery|plain words|x=1}} and <nowiki>{{literal}}</nowiki>.')).toEqual([
      'A plain words and {{literal}}.',
    ]);
    expect(lead('A {{Nothing}} here.')).toEqual(['A here.']);
  });

  it('splits <br> into items, and handles an article with no infobox', () => {
    const article = parseArticle('X', '{{Thing\n|a=one<br />two\n|b=three\n}}\nBody.');
    expect(article.fields.map((f) => f.items.map(show))).toEqual([['one', 'two'], ['three']]);
    expect(parseArticle('X', 'Just text.')).toEqual({
      era: 'canon',
      fields: [],
      lead: [[{ text: 'Just text.' }]],
    });
  });

  it('cuts at the first section heading', () => {
    expect(opening('Lead.\n== History ==\nLater.')).toBe('Lead.\n');
    expect(opening('No headings.')).toBe('No headings.');
  });

  it('decodes HTML entities into characters', () => {
    expect(decodeEntities('2.23&ndash;2.54 &amp; &#8212; &#x2014; &bogus; &#0;')).toBe(
      '2.23–2.54 & — — &bogus; &#0;',
    );
    expect(lead('Tall&nbsp;&mdash;&nbsp;very.')).toEqual(['Tall — very.']);
  });

  it('normalises link targets to page titles', () => {
    expect(normaliseTitle('polis_Massa#Medical_center')).toBe('Polis Massa');
  });
});

describe('any wikitext', () => {
  const piece = fc.constantFrom(
    'text ',
    '[[Tatooine]]',
    '[[Color|Blond]]',
    '{{C|note}}',
    '{{Unknown|x}}',
    '{{Film|IV}}',
    '<ref>cite {{Film|IV}}</ref>',
    '<!-- c -->',
    "''",
    "'''",
    '\n*',
    '<br />',
    '[[File:x.png]]',
    '[[Category:X]]',
    '[https://a.b link]',
    '\n',
    '{{',
    '}}',
    '[[',
    ']]',
    '|',
    '=',
  );
  it('never throws and never leaks wikitext syntax', () => {
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 40 }), (pieces) => {
        const article = parseArticle(
          'X',
          `{{Thing\n|a=${pieces.join('')}\n|b=x\n}}\n${pieces.join('')}`,
        );
        const out = [...article.fields.flatMap((f) => f.items), ...article.lead].map(show).join('');
        expect(out).not.toMatch(/<ref|<!--|\[\[File|\[\[Category/);
      }),
      { numRuns: 300 },
    );
  });
});
