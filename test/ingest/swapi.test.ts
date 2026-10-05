import { describe, expect, it } from 'vitest';
import type { Dataset } from '../../src/domain/records.js';
import { fromSwapi, oneWayLinks } from '../../src/ingest/swapi.js';
import { api, at, world } from '../fixtures/swapi.js';

describe('fromSwapi on a consistent world', () => {
  const data = fromSwapi(world());

  it('orders records by swapi id and drops the "unknown" placeholder planet', () => {
    expect(data.people.map((p) => p.slug)).toEqual(['luke-skywalker', 'arvel-crynyd']);
    expect(data.planets.map((p) => p.slug)).toEqual(['tatooine']);
  });

  it('parses a person: numbers, lists, links, and absent unknowns', () => {
    const [luke, arvel] = data.people;
    expect(luke).toEqual({
      kind: 'people',
      slug: 'luke-skywalker',
      name: 'Luke Skywalker',
      sources: [{ source: 'swapi', id: 1, url: api('people/1') }],
      height: 172,
      mass: 1358,
      hairColors: ['blond'],
      skinColors: ['fair'],
      eyeColors: ['blue'],
      birthYear: '19BBY',
      gender: 'male',
      homeworld: 'tatooine',
      films: ['a-new-hope'],
      species: ['human'],
      vehicles: ['snowspeeder'],
      starships: ['cr90-corvette'],
    });
    // A link to the placeholder planet means "homeworld unknown": the field is absent.
    expect(arvel).not.toHaveProperty('homeworld');
    expect(arvel).not.toHaveProperty('height');
    expect(arvel).not.toHaveProperty('birthYear');
  });

  it('parses a film', () => {
    expect(data.films[0]).toMatchObject({
      name: 'A New Hope',
      episode: 4,
      openingCrawl: 'It is a period of civil war.\nRebel spaceships...',
      producers: ['Gary Kurtz', 'Rick McCallum'],
      releaseDate: '1977-05-25',
      characters: ['luke-skywalker', 'arvel-crynyd'],
    });
  });

  it('parses planets, species and craft', () => {
    expect(data.planets[0]).toMatchObject({
      diameter: 10465,
      climates: ['arid'],
      gravity: '1 standard',
    });
    expect(data.species[0]).toMatchObject({ averageLifespan: 'indefinite', hairColors: [] });
    expect(data.species[0]).not.toHaveProperty('homeworld');
    expect(data.vehicles[0]).toMatchObject({
      length: 4.5,
      crew: { min: 2, max: 2 },
      craftClass: 'airspeeder',
    });
    expect(data.vehicles[0]).not.toHaveProperty('consumables');
    expect(data.starships[0]).toMatchObject({
      length: 1600,
      maxAtmospheringSpeed: 1000,
      crew: { min: 30, max: 165 },
      hyperdriveRating: 2,
      mglt: 60,
      craftClass: 'corvette',
    });
  });

  it('finds no one-way links', () => {
    expect(oneWayLinks(data)).toEqual([]);
  });
});

describe('fromSwapi refuses a broken source', () => {
  it('names the collection and path when the shape is wrong', () => {
    const w = world();
    const people: unknown[] = [...w.people, { ...w.people[0], height: 172 }];
    expect(() => fromSwapi({ ...w, people })).toThrow(
      /swapi people: unexpected shape at \[2\.height\]/,
    );
  });

  it('rejects a collection that is not an array', () => {
    expect(() => fromSwapi({ ...world(), films: { results: [] } })).toThrow(
      /swapi films: unexpected shape/,
    );
  });

  it('rejects a link to a record that does not exist, naming the record', () => {
    const w = world();
    at(w.people, 1).starships = [api('starships/99')];
    expect(() => fromSwapi(w)).toThrow(
      /swapi people .*people\/1: links to .*starships\/99, which doesn't exist/,
    );
  });

  it('rejects a link to a record of the wrong kind', () => {
    const w = world();
    at(w.people, 1).homeworld = api('films/1');
    expect(() => fromSwapi(w)).toThrow(/where a planets record belongs/);
  });

  it('rejects a link present on one side only', () => {
    const w = world();
    at(w.films, 0).characters = [api('people/1')];
    expect(() => fromSwapi(w)).toThrow(
      /people\.films arvel-crynyd → a-new-hope: missing from films\.characters/,
    );
  });

  it('rejects two records whose names give the same slug', () => {
    const w = world();
    at(w.people, 0).name = 'Luke  Skywalker!';
    expect(() => fromSwapi(w)).toThrow(/both get the slug "luke-skywalker"/);
  });

  it('rejects a URL without a numeric id', () => {
    const w = world();
    at(w.vehicles, 0).url = api('vehicles/snowspeeder');
    expect(() => fromSwapi(w)).toThrow(/no numeric id/);
  });

  it('rejects a value the parsers do not recognise', () => {
    const w = world();
    at(w.planets, 0).diameter = 'about 10,000';
    expect(() => fromSwapi(w)).toThrow(/swapi planets .*planets\/1: not a number/);
  });
});

describe('oneWayLinks', () => {
  it('reports links missing from the forward side', () => {
    const data = fromSwapi(world());
    const broken: Dataset = {
      ...data,
      people: data.people.map((p) => ({ ...p, films: [] })),
    };
    expect(oneWayLinks(broken)).toContain(
      'films.characters luke-skywalker → a-new-hope: missing from people.films',
    );
  });
});
