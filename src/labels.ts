// Every user-facing string on the site, in one place. Plain wording for now: swr-3mo.8
// rewrites it in the site's voice (docs/design-docs/0005-writing.md). Keep record facts out
// of here; they come from the data.
import type { AnyRecord, Kind } from './domain/records.js';

export const KIND_LABELS: Readonly<
  Record<Kind, { readonly plural: string; readonly one: string }>
> = {
  films: { plural: 'Films', one: 'film' },
  people: { plural: 'People', one: 'character' },
  planets: { plural: 'Planets', one: 'planet' },
  species: { plural: 'Species', one: 'species' },
  vehicles: { plural: 'Vehicles', one: 'vehicle' },
  starships: { plural: 'Starships', one: 'starship' },
};

/** Headings for each relationship, keyed by `Relation.name` (src/domain/catalog.ts). */
export const RELATION_LABELS: Readonly<Record<string, string>> = {
  characters: 'Characters',
  films: 'Films',
  nativeSpecies: 'Native species',
  people: 'People',
  pilots: 'Pilots',
  planets: 'Planets',
  residents: 'Residents',
  species: 'Species',
  starships: 'Starships',
  vehicles: 'Vehicles',
};

/** Labels for a record's own fields, keyed by field name. */
export const FIELD_LABELS = {
  episode: 'Episode',
  director: 'Director',
  producers: 'Producers',
  releaseDate: 'Released',
  height: 'Height',
  mass: 'Mass',
  birthYear: 'Born',
  gender: 'Gender',
  hairColors: 'Hair',
  skinColors: 'Skin',
  eyeColors: 'Eyes',
  homeworld: 'Homeworld',
  diameter: 'Diameter',
  rotationPeriod: 'Day length',
  orbitalPeriod: 'Year length',
  gravity: 'Gravity',
  climates: 'Climate',
  terrains: 'Terrain',
  surfaceWater: 'Surface water',
  population: 'Population',
  classification: 'Classification',
  designation: 'Designation',
  language: 'Language',
  averageHeight: 'Average height',
  averageLifespan: 'Average lifespan',
  model: 'Model',
  craftClass: 'Class',
  manufacturers: 'Manufacturer',
  cost: 'Cost',
  length: 'Length',
  maxAtmospheringSpeed: 'Top speed in atmosphere',
  crew: 'Crew',
  passengers: 'Passengers',
  cargoCapacity: 'Cargo capacity',
  consumables: 'Supplies last',
  hyperdriveRating: 'Hyperdrive rating',
  mglt: 'Speed in space (MGLT)',
} as const;

export const UNITS = {
  cm: 'cm',
  kg: 'kg',
  km: 'km',
  m: 'm',
  hours: 'hours',
  days: 'days',
  years: 'years',
  percent: '%',
  credits: 'credits',
  indefinite: 'indefinite',
} as const;

export const TEXT = {
  skipLink: 'Skip to content',
  primaryNav: 'Sections',
  breadcrumb: 'Breadcrumb',
  home: 'Home',
  facts: 'Facts',
  openingCrawl: 'Opening crawl',
  homeIntro:
    'Every film, character, planet, species, vehicle and starship in the Star Wars saga, each on its own page and linked to everything it relates to.',
  notFoundTitle: 'Page not found',
  notFoundBody: "There's no page at this address.",
  notFoundHome: 'Go to the home page',
  searchTitle: 'Search',
  searchDescription: 'Search every film, character, planet, species, vehicle and starship.',
  searchLabel: 'Search',
  searchKindLabel: 'Show',
  searchAllKinds: 'Everything',
  searchHint: 'Type a name. Arrow keys move through the results; Escape clears.',
  searching: 'Searching…',
  searchNoScript: 'Search runs in your browser and needs JavaScript. Without it, browse a section:',
  searchFailed: 'The search index could not be loaded.',
  searchResults: 'Search results',
  noResults: (query: string): string => `No results for “${query}”.`,
  resultCount: (n: number, query: string): string =>
    `${String(n)} ${n === 1 ? 'result' : 'results'} for “${query}”.`,
  dataCredit: 'Data from',
  fanProject:
    'An unofficial fan project. Star Wars and its characters are trademarks of Lucasfilm Ltd.',
};

export const listTitle = (kind: Kind): string => KIND_LABELS[kind].plural;

export const listDescription = (kind: Kind, count: number): string =>
  `All ${String(count)} ${KIND_LABELS[kind].plural.toLowerCase()} in the Star Wars saga, each linked to its own page.`;

export const recordDescription = (record: AnyRecord): string =>
  `${record.name}, a ${KIND_LABELS[record.kind].one} in the Star Wars saga: the facts, and links to every related film, character, planet, species and craft.`;
