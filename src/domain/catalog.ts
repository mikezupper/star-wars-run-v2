// Lookup over a whole dataset, and every relationship a record has, in display order.
import { KINDS, type AnyRecord, type Dataset, type Kind, type Slug } from './records.js';

/** One relationship of a record: the records of one kind it's linked to. */
export interface Relation {
  /** Names the relationship, e.g. `residents`, `nativeSpecies`. Pages label it from this. */
  readonly name: string;
  readonly kind: Kind;
  readonly slugs: readonly Slug[];
}

export interface Catalog {
  readonly data: Dataset;
  /** The record, or `undefined` if there is none with that slug. */
  get(kind: Kind, slug: Slug): AnyRecord | undefined;
  /** The record's many-valued relationships, empty ones included, in display order. */
  relations(record: AnyRecord): readonly Relation[];
}

const rel = (name: string, kind: Kind, slugs: readonly Slug[]): Relation => ({ name, kind, slugs });

export function createCatalog(data: Dataset): Catalog {
  const byKey = new Map<string, AnyRecord>();
  for (const kind of KINDS)
    for (const record of data[kind]) byKey.set(`${kind}/${record.slug}`, record);

  // swapi.info gives a species' homeworld but not a planet's species: build that side here so
  // the link shows on both pages (docs/product-specs/records.md).
  const nativeSpecies = new Map<Slug, Slug[]>();
  for (const species of data.species) {
    if (species.homeworld === undefined) continue;
    const list = nativeSpecies.get(species.homeworld) ?? [];
    list.push(species.slug);
    nativeSpecies.set(species.homeworld, list);
  }

  return {
    data,
    get: (kind, slug) => byKey.get(`${kind}/${slug}`),
    relations(r) {
      switch (r.kind) {
        case 'films':
          return [
            rel('characters', 'people', r.characters),
            rel('planets', 'planets', r.planets),
            rel('species', 'species', r.species),
            rel('starships', 'starships', r.starships),
            rel('vehicles', 'vehicles', r.vehicles),
          ];
        case 'people':
          return [
            rel('films', 'films', r.films),
            rel('species', 'species', r.species),
            rel('starships', 'starships', r.starships),
            rel('vehicles', 'vehicles', r.vehicles),
          ];
        case 'planets':
          return [
            rel('residents', 'people', r.residents),
            rel('nativeSpecies', 'species', nativeSpecies.get(r.slug) ?? []),
            rel('films', 'films', r.films),
          ];
        case 'species':
          return [rel('people', 'people', r.people), rel('films', 'films', r.films)];
        case 'vehicles':
        case 'starships':
          return [rel('pilots', 'people', r.pilots), rel('films', 'films', r.films)];
      }
    },
  };
}
