import { describe, expect, it } from 'vitest';
import { matchSwapi, sharedTitles, type MatchIndex } from '../../src/domain/merge.js';
import type { Dataset, Slug } from '../../src/domain/records.js';

const slug = (s: string) => s as Slug;
const index: MatchIndex = {
  articles: new Map([
    ['Star Wars: Episode IV A New Hope', { era: 'canon', kind: 'Movie' }],
    ['Anakin Skywalker', { era: 'canon', kind: 'Character' }],
    ['Beru Whitesun Lars', { era: 'canon', kind: 'Character' }],
    ['Aayla Secura', { era: 'canon', kind: 'Character' }],
    ['Tatooine', { era: 'canon', kind: 'CelestialBody' }],
    ['Droid', { era: 'canon' }],
    ['TIE/ln space superiority starfighter', { era: 'canon', kind: 'StarshipClass' }],
    ['TIE/ln space superiority starfighter/Legends', { era: 'legends', kind: 'StarshipClass' }],
    ['X-wing (disambiguation)', { era: 'canon' }],
    ['T-65 X-wing starfighter', { era: 'canon', kind: 'StarshipClass' }],
    ['Emergency firespeeder/Legends', { era: 'legends', kind: 'RepulsorliftVehicle' }],
    ['Hoth', { era: 'canon', kind: 'CelestialBody' }],
  ]),
  redirects: new Map([
    ['Darth Vader', 'Anakin Skywalker'],
    ['TIE/LN starfighter', 'TIE/ln space superiority starfighter/Legends'],
    ['X-wing', 'X-wing (disambiguation)'],
    ['Emergency Firespeeder', 'Emergency firespeeder/Legends'],
  ]),
};

const record = (kind: string, name: string, extra: object = {}) =>
  ({ kind, slug: slug(name.toLowerCase().replace(/\W+/g, '-')), name, ...extra }) as never;

const data = {
  films: [record('films', 'A New Hope', { episode: 4 })],
  people: [
    record('people', 'Anakin Skywalker'),
    record('people', 'Darth Vader'),
    record('people', 'Beru Whitesun lars'),
    record('people', 'Ayla Secura'),
    record('people', 'Hoth'),
  ],
  planets: [record('planets', 'Tatooine')],
  species: [record('species', 'Droid')],
  vehicles: [
    record('vehicles', 'TIE/LN starfighter', { model: 'Twin Ion Engine/Ln Starfighter' }),
    record('vehicles', 'Emergency Firespeeder', { model: 'Fire suppression speeder' }),
  ],
  starships: [
    record('starships', 'X-wing', { model: 'T-65 X-wing starfighter' }),
    record('starships', 'Nowhere ship', { model: 'Nothing class' }),
  ],
} as unknown as Dataset;

const result = new Map(matchSwapi(data, index).map((m) => [m.name, m]));
const titleOf = (name: string) => {
  const m = result.get(name);
  return m !== undefined && 'title' in m ? m.title : m;
};

describe('matching swapi.info records to Wookieepedia articles', () => {
  it('uses the full film title, redirects, and capitalization differences', () => {
    expect(titleOf('A New Hope')).toBe('Star Wars: Episode IV A New Hope');
    expect(titleOf('Darth Vader')).toBe('Anakin Skywalker');
    expect(titleOf('Beru Whitesun lars')).toBe('Beru Whitesun Lars');
  });

  it('fixes known swapi typos through the alias table only', () => {
    expect(titleOf('Ayla Secura')).toBe('Aayla Secura');
  });

  it('prefers the canon article when a redirect lands on its /Legends twin', () => {
    expect(titleOf('TIE/LN starfighter')).toBe('TIE/ln space superiority starfighter');
  });

  it('tries the model when the name lands on a disambiguation page', () => {
    expect(titleOf('X-wing')).toBe('T-65 X-wing starfighter');
  });

  it('accepts the no-infobox Droid article as a species', () => {
    expect(titleOf('Droid')).toBe('Droid');
  });

  it('reports instead of guessing: wrong kind, Legends only, nothing', () => {
    expect(result.get('Hoth')).toMatchObject({
      problem: 'wrong kind',
      candidate: 'Hoth (CelestialBody)',
    });
    expect(result.get('Emergency Firespeeder')).toMatchObject({ problem: 'legends only' });
    expect(result.get('Nowhere ship')).toMatchObject({ problem: 'no article' });
  });

  it('lists articles that more than one record matched', () => {
    expect(sharedTitles(matchSwapi(data, index))).toEqual(
      new Map([['Anakin Skywalker', ['people/anakin-skywalker', 'people/darth-vader']]]),
    );
  });
});
