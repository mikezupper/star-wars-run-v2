// The record types every layer after ingest relies on. Values are already parsed: an
// optional field is absent when the source didn't know it, never the string "unknown".
// Relationships are slugs of records of a fixed kind, and every one resolves
// (src/ingest guarantees both).

/** The record kinds, in the order the site lists them. Each is also its URL segment. */
export const KINDS = ['films', 'people', 'planets', 'species', 'vehicles', 'starships'] as const;

export type Kind = (typeof KINDS)[number];

/** A URL-safe name, unique within its kind: `luke-skywalker`. Made only by `toSlug()`. */
export type Slug = string & { readonly __brand: 'Slug' };

/** Where a record came from, so a second source can merge into the same record later. */
export interface SourceRef {
  readonly source: 'swapi';
  readonly id: number;
  readonly url: string;
}

/** A count that may be a range in the source (`"30-165"` crew). Exact counts have min = max. */
export interface Count {
  readonly min: number;
  readonly max: number;
}

interface Base<K extends Kind> {
  readonly kind: K;
  readonly slug: Slug;
  /** The display name. Films use their title. */
  readonly name: string;
  readonly sources: readonly SourceRef[];
}

export interface Film extends Base<'films'> {
  readonly episode: number;
  readonly openingCrawl: string;
  readonly director: string;
  readonly producers: readonly string[];
  /** ISO date, `YYYY-MM-DD`. */
  readonly releaseDate: string;
  readonly characters: readonly Slug[];
  readonly planets: readonly Slug[];
  readonly species: readonly Slug[];
  readonly vehicles: readonly Slug[];
  readonly starships: readonly Slug[];
}

export interface Person extends Base<'people'> {
  /** Centimetres. */
  readonly height?: number;
  /** Kilograms. */
  readonly mass?: number;
  readonly hairColors: readonly string[];
  readonly skinColors: readonly string[];
  readonly eyeColors: readonly string[];
  /** In-universe years, as the source writes them: `19BBY`. */
  readonly birthYear?: string;
  readonly gender?: string;
  readonly homeworld?: Slug;
  readonly films: readonly Slug[];
  readonly species: readonly Slug[];
  readonly vehicles: readonly Slug[];
  readonly starships: readonly Slug[];
}

export interface Planet extends Base<'planets'> {
  /** Standard hours. */
  readonly rotationPeriod?: number;
  /** Standard days. */
  readonly orbitalPeriod?: number;
  /** Kilometres. */
  readonly diameter?: number;
  readonly climates: readonly string[];
  /** Free text: `1 standard`, `1.5 (surface), 1 standard (Cloud City)`. */
  readonly gravity?: string;
  readonly terrains: readonly string[];
  /** Percent of the surface. */
  readonly surfaceWater?: number;
  readonly population?: number;
  readonly residents: readonly Slug[];
  readonly films: readonly Slug[];
}

export interface Species extends Base<'species'> {
  readonly classification?: string;
  readonly designation?: string;
  /** Centimetres. */
  readonly averageHeight?: number;
  /** Standard years, or `indefinite` (droids). */
  readonly averageLifespan?: number | 'indefinite';
  readonly skinColors: readonly string[];
  readonly hairColors: readonly string[];
  readonly eyeColors: readonly string[];
  readonly language?: string;
  readonly homeworld?: Slug;
  readonly people: readonly Slug[];
  readonly films: readonly Slug[];
}

interface Craft<K extends 'vehicles' | 'starships'> extends Base<K> {
  readonly model: string;
  readonly manufacturers: readonly string[];
  /** Galactic credits. */
  readonly cost?: number;
  /** Metres. */
  readonly length?: number;
  /** Top speed in atmosphere. The source states no unit. */
  readonly maxAtmospheringSpeed?: number;
  readonly crew?: Count;
  readonly passengers?: Count;
  /** Kilograms. */
  readonly cargoCapacity?: number;
  /** How long it can go without resupply: `2 months`. */
  readonly consumables?: string;
  /** The source's `vehicle_class` or `starship_class`. */
  readonly craftClass: string;
  readonly pilots: readonly Slug[];
  readonly films: readonly Slug[];
}

export type Vehicle = Craft<'vehicles'>;

export interface Starship extends Craft<'starships'> {
  readonly hyperdriveRating?: number;
  /** Megalights per hour. */
  readonly mglt?: number;
}

/** Every record of every kind: the whole snapshot in memory. */
export interface Dataset {
  readonly films: readonly Film[];
  readonly people: readonly Person[];
  readonly planets: readonly Planet[];
  readonly species: readonly Species[];
  readonly vehicles: readonly Vehicle[];
  readonly starships: readonly Starship[];
}

export type AnyRecord = Dataset[Kind][number];
