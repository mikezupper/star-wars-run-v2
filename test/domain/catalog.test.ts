import { describe, expect, it } from 'vitest';
import { createCatalog } from '../../src/domain/catalog.js';
import type { Slug } from '../../src/domain/records.js';
import { kindPath, recordPath } from '../../src/domain/paths.js';
import { fromSwapi } from '../../src/ingest/swapi.js';
import { at, world } from '../fixtures/swapi.js';

const slug = (s: string) => s as Slug;

describe('catalog', () => {
  it('finds records by kind and slug', () => {
    const catalog = createCatalog(fromSwapi(world()));
    expect(catalog.get('people', slug('luke-skywalker'))?.name).toBe('Luke Skywalker');
    expect(catalog.get('planets', slug('luke-skywalker'))).toBeUndefined();
  });

  it("derives a planet's native species from each species' homeworld", () => {
    const w = world();
    at(w.species, 0).homeworld = 'https://swapi.info/api/planets/1';
    const catalog = createCatalog(fromSwapi(w));
    const tatooine = catalog.get('planets', slug('tatooine'));
    expect(tatooine && catalog.relations(tatooine)).toContainEqual({
      name: 'nativeSpecies',
      kind: 'species',
      slugs: ['human'],
    });
  });

  it('lists every relationship of every kind, in display order', () => {
    const data = fromSwapi(world());
    const catalog = createCatalog(data);
    const names = (r: Parameters<typeof catalog.relations>[0]) =>
      catalog.relations(r).map((rel) => rel.name);
    expect(names(at(data.films, 0))).toEqual([
      'characters',
      'planets',
      'species',
      'starships',
      'vehicles',
    ]);
    expect(names(at(data.people, 0))).toEqual(['films', 'species', 'starships', 'vehicles']);
    expect(names(at(data.planets, 0))).toEqual(['residents', 'nativeSpecies', 'films']);
    expect(names(at(data.species, 0))).toEqual(['people', 'films']);
    expect(names(at(data.vehicles, 0))).toEqual(['pilots', 'films']);
    expect(names(at(data.starships, 0))).toEqual(['pilots', 'films']);
  });
});

describe('paths', () => {
  it('end with a slash and use slugs', () => {
    expect(kindPath('people')).toBe('/people/');
    expect(recordPath('people', slug('luke-skywalker'))).toBe('/people/luke-skywalker/');
  });
});
