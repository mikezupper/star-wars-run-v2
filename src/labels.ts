// Every user-facing string on the site, in one place. The voice is playful and in-universe,
// but clarity wins every conflict (docs/design-docs/0005-writing.md): labels, navigation and
// field names stay plain; the voice lives in intros, blurbs, and empty and error states.
// Facts about records come from the data, never from here.
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

/** One line under each section's heading, and on its list page. Checked against data/. */
export const KIND_BLURBS: Readonly<Record<Kind, string>> = {
  films: 'Six episodes, from a trade dispute over Naboo to the fall of the Empire.',
  people: 'Jedi, Sith, smugglers, senators and more than a few droids.',
  planets: 'Desert worlds, ice worlds, city worlds, and at least one swamp you should avoid.',
  species: 'Wookiees, Hutts, Gungans, Ewoks and dozens more. Humans are here too.',
  vehicles:
    'Speeders, walkers, sail barges and short-range fighters: everything without a hyperdrive.',
  starships: 'Anything with a hyperdrive, from the Millennium Falcon to the Death Star.',
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

/** In-universe eras, spelled out where a year uses one (`19BBY`). */
export const ERAS = {
  BBY: 'Before the Battle of Yavin',
  ABY: 'After the Battle of Yavin',
} as const;

/**
 * The credit line on every page built from a Wookieepedia article (CC BY-SA 3.0 requires it).
 * Plain on purpose: this is the license notice, not the place for the site's voice.
 */
export const CREDIT = {
  before: 'Text and facts from the',
  article: (title: string): string => `“${title}” article on Wookieepedia`,
  licensed: 'licensed under',
  license: 'CC BY-SA 3.0',
  modified: 'Modified for this site.',
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
    'An archive of the Star Wars saga, Episodes I to VI. Every film, character, planet, species, vehicle and starship has a page here, linked to everything it touches. Pick a section, or search the archive.',
  notFoundTitle: 'Page not found',
  notFoundBody:
    'These aren’t the droids you’re looking for. There’s no page at this address: it may have moved, or it never existed.',
  notFoundHome: 'Back to the archive',
  notFoundSearch: 'search for it',
  searchTitle: 'Search the archive',
  searchDescription:
    'Search every film, character, planet, species, vehicle and starship in the Star Wars saga.',
  searchLabel: 'Search',
  searchKindLabel: 'Show',
  searchAllKinds: 'Everything',
  searchHint:
    'Type a name: a character, a planet, a ship. Arrow keys move through the results; Escape clears.',
  searching: 'Searching the archive…',
  searchNoScript:
    'Search runs in your browser, and it needs JavaScript. Without it, browse a section instead:',
  searchFailed: 'The search index didn’t load. Check your connection and try again.',
  searchResults: 'Search results',
  noResults: (query: string): string =>
    `Nothing in the archive matches “${query}”. Check the spelling, or try fewer letters.`,
  resultCount: (n: number, query: string): string =>
    `${String(n)} ${n === 1 ? 'match' : 'matches'} for “${query}”.`,
  eraNote:
    'Birth years count from the Battle of Yavin, when the first Death Star was destroyed: 19BBY means 19 years before it.',
  offlineTitle: 'You’re offline',
  offlineBody:
    'This page hasn’t been saved for the journey yet, and there’s no signal out here. Pages you’ve already visited still work, and so does search.',
  dataCredit: 'Data from',
  fanProject:
    'An unofficial fan project. Star Wars and its characters are trademarks of Lucasfilm Ltd.',
};

export const listTitle = (kind: Kind): string => KIND_LABELS[kind].plural;

export const listDescription = (kind: Kind, count: number): string =>
  `${KIND_BLURBS[kind]} All ${String(count)} ${KIND_LABELS[kind].plural.toLowerCase()} of the Star Wars saga, each with its own page.`;

/** The search-result pitch for a record page: what the page will tell you. */
const RECORD_PITCH: Readonly<Record<Kind, string>> = {
  films:
    'release date, director, opening crawl, and every character, planet, species, vehicle and starship in it',
  people:
    'homeworld, species, vital statistics, and every film, vehicle and starship they appear in',
  planets: 'climate, terrain, population, and the characters, species and films linked to it',
  species: 'classification, language, homeworld, and the characters and films linked to it',
  vehicles: 'model, maker, specifications, and its pilots and films',
  starships: 'model, maker, hyperdrive rating, specifications, and its pilots and films',
};

export const recordDescription = (record: AnyRecord): string =>
  `${record.name}, from the Star Wars saga: ${RECORD_PITCH[record.kind]}.`;
