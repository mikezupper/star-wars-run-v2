// swapi.info → domain records. The only code that sees swapi.info's raw JSON
// (docs/design-docs/0002-data.md). Each collection is checked against a schema, every
// value is parsed, every URL becomes a slug, and the result is checked for links that
// don't resolve or only point one way. Any surprise throws, naming the record.
import * as v from 'valibot';
import {
  KINDS,
  type Dataset,
  type Film,
  type Kind,
  type Person,
  type Planet,
  type Slug,
  type SourceRef,
  type Species,
  type Starship,
  type Vehicle,
} from '../domain/records.js';
import { toSlug } from '../domain/slug.js';
import {
  optional,
  parseCount,
  parseDate,
  parseLifespan,
  parseList,
  parseNumber,
  parseText,
} from './values.js';

export const SWAPI_BASE = 'https://swapi.info/api/';

const links = v.array(v.string());
const craftFields = {
  name: v.string(),
  model: v.string(),
  manufacturer: v.string(),
  cost_in_credits: v.string(),
  length: v.string(),
  max_atmosphering_speed: v.string(),
  crew: v.string(),
  passengers: v.string(),
  cargo_capacity: v.string(),
  consumables: v.string(),
  pilots: links,
  films: links,
  url: v.string(),
};

/** The shape of each swapi.info collection. Unlisted fields are ignored. */
export const RAW = {
  films: v.object({
    title: v.string(),
    episode_id: v.number(),
    opening_crawl: v.string(),
    director: v.string(),
    producer: v.string(),
    release_date: v.string(),
    characters: links,
    planets: links,
    species: links,
    vehicles: links,
    starships: links,
    url: v.string(),
  }),
  people: v.object({
    name: v.string(),
    height: v.string(),
    mass: v.string(),
    hair_color: v.string(),
    skin_color: v.string(),
    eye_color: v.string(),
    birth_year: v.string(),
    gender: v.string(),
    homeworld: v.nullable(v.string()),
    films: links,
    species: links,
    vehicles: links,
    starships: links,
    url: v.string(),
  }),
  planets: v.object({
    name: v.string(),
    rotation_period: v.string(),
    orbital_period: v.string(),
    diameter: v.string(),
    climate: v.string(),
    gravity: v.string(),
    terrain: v.string(),
    surface_water: v.string(),
    population: v.string(),
    residents: links,
    films: links,
    url: v.string(),
  }),
  species: v.object({
    name: v.string(),
    classification: v.string(),
    designation: v.string(),
    average_height: v.string(),
    average_lifespan: v.string(),
    skin_colors: v.string(),
    hair_colors: v.string(),
    eye_colors: v.string(),
    language: v.string(),
    homeworld: v.nullable(v.string()),
    people: links,
    films: links,
    url: v.string(),
  }),
  vehicles: v.object({ ...craftFields, vehicle_class: v.string() }),
  starships: v.object({
    ...craftFields,
    starship_class: v.string(),
    hyperdrive_rating: v.string(),
    MGLT: v.string(),
  }),
} as const;

type Raw = { readonly [K in Kind]: readonly v.InferOutput<(typeof RAW)[K]>[] };

/** The six collections as fetched: one JSON array per kind, not yet checked. */
export type RawCollections = Readonly<Record<Kind, unknown>>;

interface Entry {
  readonly kind: Kind;
  readonly slug: Slug;
}

/** Resolves swapi URLs to slugs. Placeholder records resolve to nothing. */
class Links {
  readonly #entries = new Map<string, Entry>();
  readonly #placeholders = new Set<string>();

  add(url: string, entry: Entry): void {
    this.#entries.set(url, entry);
  }

  addPlaceholder(url: string): void {
    this.#placeholders.add(url);
  }

  one(url: string | null, kind: Kind): Slug | undefined {
    if (url === null || this.#placeholders.has(url)) return undefined;
    const entry = this.#entries.get(url);
    if (entry === undefined) throw new Error(`links to ${url}, which doesn't exist`);
    if (entry.kind !== kind) throw new Error(`links to ${url} where a ${kind} record belongs`);
    return entry.slug;
  }

  many(urls: readonly string[], kind: Kind): readonly Slug[] {
    return urls.map((url) => this.one(url, kind)).filter((s): s is Slug => s !== undefined);
  }
}

const idOf = (url: string): number => {
  const id = Number(/\/(\d+)\/?$/.exec(url)?.[1]);
  if (!Number.isInteger(id)) throw new Error(`no numeric id at the end of ${url}`);
  return id;
};

const sourceOf = (url: string): readonly SourceRef[] => [{ source: 'swapi', id: idOf(url), url }];

/** A record's name; `undefined` marks a placeholder such as the planet named "unknown". */
const nameOf = (raw: { readonly name: string } | { readonly title: string }): string | undefined =>
  parseText('name' in raw ? raw.name : raw.title);

const film = (r: Raw['films'][number], l: Links, slug: Slug, name: string): Film => ({
  kind: 'films',
  slug,
  name,
  sources: sourceOf(r.url),
  episode: r.episode_id,
  openingCrawl: r.opening_crawl.replaceAll('\r\n', '\n').trim(),
  director: r.director.trim(),
  producers: parseList(r.producer),
  releaseDate: parseDate(r.release_date),
  characters: l.many(r.characters, 'people'),
  planets: l.many(r.planets, 'planets'),
  species: l.many(r.species, 'species'),
  vehicles: l.many(r.vehicles, 'vehicles'),
  starships: l.many(r.starships, 'starships'),
});

const person = (r: Raw['people'][number], l: Links, slug: Slug, name: string): Person => ({
  kind: 'people',
  slug,
  name,
  sources: sourceOf(r.url),
  ...optional('height', parseNumber(r.height)),
  ...optional('mass', parseNumber(r.mass)),
  hairColors: parseList(r.hair_color),
  skinColors: parseList(r.skin_color),
  eyeColors: parseList(r.eye_color),
  ...optional('birthYear', parseText(r.birth_year)),
  ...optional('gender', parseText(r.gender)),
  ...optional('homeworld', l.one(r.homeworld, 'planets')),
  films: l.many(r.films, 'films'),
  species: l.many(r.species, 'species'),
  vehicles: l.many(r.vehicles, 'vehicles'),
  starships: l.many(r.starships, 'starships'),
});

const planet = (r: Raw['planets'][number], l: Links, slug: Slug, name: string): Planet => ({
  kind: 'planets',
  slug,
  name,
  sources: sourceOf(r.url),
  ...optional('rotationPeriod', parseNumber(r.rotation_period)),
  ...optional('orbitalPeriod', parseNumber(r.orbital_period)),
  ...optional('diameter', parseNumber(r.diameter)),
  climates: parseList(r.climate),
  ...optional('gravity', parseText(r.gravity)),
  terrains: parseList(r.terrain),
  ...optional('surfaceWater', parseNumber(r.surface_water)),
  ...optional('population', parseNumber(r.population)),
  residents: l.many(r.residents, 'people'),
  films: l.many(r.films, 'films'),
});

const species = (r: Raw['species'][number], l: Links, slug: Slug, name: string): Species => ({
  kind: 'species',
  slug,
  name,
  sources: sourceOf(r.url),
  ...optional('classification', parseText(r.classification)),
  ...optional('designation', parseText(r.designation)),
  ...optional('averageHeight', parseNumber(r.average_height)),
  ...optional('averageLifespan', parseLifespan(r.average_lifespan)),
  skinColors: parseList(r.skin_colors),
  hairColors: parseList(r.hair_colors),
  eyeColors: parseList(r.eye_colors),
  ...optional('language', parseText(r.language)),
  ...optional('homeworld', l.one(r.homeworld, 'planets')),
  people: l.many(r.people, 'people'),
  films: l.many(r.films, 'films'),
});

const craft = (r: Raw['vehicles' | 'starships'][number], l: Links) => ({
  sources: sourceOf(r.url),
  model: r.model.trim(),
  manufacturers: parseList(r.manufacturer),
  ...optional('cost', parseNumber(r.cost_in_credits)),
  ...optional('length', parseNumber(r.length)),
  ...optional('maxAtmospheringSpeed', parseNumber(r.max_atmosphering_speed)),
  ...optional('crew', parseCount(r.crew)),
  ...optional('passengers', parseCount(r.passengers)),
  ...optional('cargoCapacity', parseNumber(r.cargo_capacity)),
  ...optional('consumables', parseText(r.consumables)),
  pilots: l.many(r.pilots, 'people'),
  films: l.many(r.films, 'films'),
});

const vehicle = (r: Raw['vehicles'][number], l: Links, slug: Slug, name: string): Vehicle => ({
  kind: 'vehicles',
  slug,
  name,
  ...craft(r, l),
  craftClass: r.vehicle_class.trim(),
});

const starship = (r: Raw['starships'][number], l: Links, slug: Slug, name: string): Starship => ({
  kind: 'starships',
  slug,
  name,
  ...craft(r, l),
  craftClass: r.starship_class.trim(),
  ...optional('hyperdriveRating', parseNumber(r.hyperdrive_rating)),
  ...optional('mglt', parseNumber(r.MGLT)),
});

/** Checks one collection's shape and orders it by swapi id, so output is deterministic. */
function check<K extends Kind>(kind: K, json: unknown): Raw[K] {
  const result = v.safeParse(v.array(RAW[kind]), json);
  if (!result.success) {
    const issue = result.issues[0];
    const path = v.getDotPath(issue) ?? '';
    throw new Error(`swapi ${kind}: unexpected shape at [${path}]: ${issue.message}`);
  }
  const byId = result.output.map((record) => [idOf(record.url), record] as const);
  return byId.sort(([a], [b]) => a - b).map(([, record]) => record) as unknown as Raw[K];
}

/** Converts every record, naming the record in any error. */
function convert<R extends { readonly url: string }, T>(
  kind: Kind,
  records: readonly R[],
  slugs: ReadonlyMap<string, Slug>,
  to: (record: R, slug: Slug) => T,
): T[] {
  return records.flatMap((record) => {
    const slug = slugs.get(record.url);
    if (slug === undefined) return [];
    try {
      return [to(record, slug)];
    } catch (error) {
      throw new Error(`swapi ${kind} ${record.url}: ${(error as Error).message}`, { cause: error });
    }
  });
}

/**
 * Every relationship swapi.info gives from both sides. A link present on only one side
 * means the source is inconsistent: fail rather than show it on one page only.
 */
const PAIRS = [
  ['people', 'films', 'films', 'characters'],
  ['people', 'homeworld', 'planets', 'residents'],
  ['people', 'species', 'species', 'people'],
  ['people', 'vehicles', 'vehicles', 'pilots'],
  ['people', 'starships', 'starships', 'pilots'],
  ['planets', 'films', 'films', 'planets'],
  ['species', 'films', 'films', 'species'],
  ['vehicles', 'films', 'films', 'vehicles'],
  ['starships', 'films', 'films', 'starships'],
] as const;

const targets = (record: object, field: string): readonly Slug[] => {
  const value: unknown = (record as Record<string, unknown>)[field];
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as Slug[]) : [value as Slug];
};

export function oneWayLinks(data: Dataset): readonly string[] {
  const problems: string[] = [];
  for (const [kindA, fieldA, kindB, fieldB] of PAIRS) {
    const forward = new Set(
      data[kindA].flatMap((a) => targets(a, fieldA).map((b) => `${a.slug} → ${b}`)),
    );
    const backward = new Set(
      data[kindB].flatMap((b) => targets(b, fieldB).map((a) => `${a} → ${b.slug}`)),
    );
    for (const link of forward) {
      if (!backward.has(link))
        problems.push(`${kindA}.${fieldA} ${link}: missing from ${kindB}.${fieldB}`);
    }
    for (const link of backward) {
      if (!forward.has(link))
        problems.push(`${kindB}.${fieldB} ${link}: missing from ${kindA}.${fieldA}`);
    }
  }
  return problems;
}

/** swapi.info's six collections → a checked, linked dataset. Throws on any surprise. */
export function fromSwapi(collections: RawCollections): Dataset {
  const raw = {
    films: check('films', collections.films),
    people: check('people', collections.people),
    planets: check('planets', collections.planets),
    species: check('species', collections.species),
    vehicles: check('vehicles', collections.vehicles),
    starships: check('starships', collections.starships),
  };

  const links = new Links();
  const slugs = new Map<string, Slug>();
  const names = new Map<string, string>();
  for (const kind of KINDS) {
    const seen = new Map<Slug, string>();
    for (const record of raw[kind]) {
      const name = nameOf(record);
      if (name === undefined) {
        links.addPlaceholder(record.url);
        continue;
      }
      const slug = toSlug(name);
      const clash = seen.get(slug);
      if (clash !== undefined) {
        throw new Error(`swapi ${kind}: ${record.url} and ${clash} both get the slug "${slug}"`);
      }
      seen.set(slug, record.url);
      slugs.set(record.url, slug);
      names.set(record.url, name);
      links.add(record.url, { kind, slug });
    }
  }

  const name = (url: string): string => names.get(url) ?? '';
  const data: Dataset = {
    films: convert('films', raw.films, slugs, (r, s) => film(r, links, s, name(r.url))),
    people: convert('people', raw.people, slugs, (r, s) => person(r, links, s, name(r.url))),
    planets: convert('planets', raw.planets, slugs, (r, s) => planet(r, links, s, name(r.url))),
    species: convert('species', raw.species, slugs, (r, s) => species(r, links, s, name(r.url))),
    vehicles: convert('vehicles', raw.vehicles, slugs, (r, s) => vehicle(r, links, s, name(r.url))),
    starships: convert('starships', raw.starships, slugs, (r, s) =>
      starship(r, links, s, name(r.url)),
    ),
  };

  const problems = oneWayLinks(data);
  if (problems.length > 0) {
    throw new Error(`swapi: links that point only one way:\n  ${problems.join('\n  ')}`);
  }
  return data;
}
