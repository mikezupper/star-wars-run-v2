// Every user-facing string on the site, in one place. The voice is playful and in-universe,
// but clarity wins every conflict (docs/design-docs/0005-writing.md): labels, navigation and
// field names stay plain; the voice lives in intros, blurbs, and empty and error states.
// Facts about records come from the data, never from here.
import type { Section } from './domain/sections.js';

/** The archive's sections (ADR 0008): name, one item, and a line in the site's voice. */
export const SECTION_LABELS: Readonly<
  Record<Section, { readonly plural: string; readonly one: string; readonly blurb: string }>
> = {
  characters: {
    plural: 'Characters',
    one: 'character',
    blurb:
      'Jedi, Sith, smugglers, senators, droids, and tens of thousands of people whose names you missed.',
  },
  species: {
    plural: 'Species',
    one: 'species',
    blurb: 'Wookiees, Hutts, Gungans, Ewoks and thousands more. Humans are here too.',
  },
  planets: {
    plural: 'Planets',
    one: 'planet',
    blurb: 'Desert worlds, ice worlds, city worlds, and at least one swamp you should avoid.',
  },
  places: {
    plural: 'Places',
    one: 'place',
    blurb: 'Cities, cantinas, temples and bases: where things happened.',
  },
  galaxy: {
    plural: 'Galaxy',
    one: 'region',
    blurb: 'Systems, sectors, nebulae and hyperspace routes: the map between the planets.',
  },
  starships: {
    plural: 'Starships',
    one: 'starship',
    blurb: 'Anything with a hyperdrive, from the Millennium Falcon to the Death Star.',
  },
  vehicles: {
    plural: 'Vehicles',
    one: 'vehicle',
    blurb: 'Speeders, walkers and sail barges: everything that stays close to the ground.',
  },
  organizations: {
    plural: 'Organizations',
    one: 'organization',
    blurb: 'Empires, rebellions, guilds, orders and the occasional crime syndicate.',
  },
  events: {
    plural: 'Events',
    one: 'event',
    blurb: 'Battles, wars, duels and missions, in roughly the order they went wrong.',
  },
  technology: {
    plural: 'Technology',
    one: 'item',
    blurb: 'Blasters, lightsabers, armor, droid models and other things that hum.',
  },
  lore: {
    plural: 'Lore',
    one: 'topic',
    blurb: 'The Force, languages, titles, calendars, and what everyone was eating.',
  },
  media: {
    plural: 'Media',
    one: 'work',
    blurb: 'Films, series, books, comics, games and magazines: where the stories are told.',
  },
  'real-world': {
    plural: 'Real world',
    one: 'entry',
    blurb: 'The people, companies and products behind the saga, on this side of the screen.',
  },
  other: {
    plural: 'Everything else',
    one: 'article',
    blurb: 'Articles that fit no shelf: stubs, lists and the occasional oddity.',
  },
};

/** Labels for common infobox fields; others are made readable by fieldLabel(). */
const FIELD_NAMES: Readonly<Record<string, string>> = {
  homeworld: 'Homeworld',
  birth: 'Born',
  death: 'Died',
  species: 'Species',
  gender: 'Gender',
  pronouns: 'Pronouns',
  height: 'Height',
  mass: 'Mass',
  hair: 'Hair',
  eyes: 'Eyes',
  skin: 'Skin',
  cyber: 'Cybernetics',
  affiliation: 'Affiliations',
  masters: 'Masters',
  apprentices: 'Apprentices',
  haircolor: 'Hair colors',
  eyecolor: 'Eye colors',
  skincolor: 'Skin colors',
  designation: 'Designation',
  lifespan: 'Lifespan',
  language: 'Language',
  region: 'Region',
  sector: 'Sector',
  system: 'System',
  suns: 'Suns',
  moons: 'Moons',
  coordinates: 'Grid coordinates',
  routes: 'Trade routes',
  population: 'Population',
  climate: 'Climate',
  terrain: 'Terrain',
  manufacturer: 'Manufacturer',
  model: 'Model',
  class: 'Class',
  length: 'Length',
  mglt: 'Speed (MGLT)',
  crew: 'Crew',
  passengers: 'Passengers',
  armament: 'Armament',
  owners: 'Owners',
  director: 'Director',
  producer: 'Producers',
  writer: 'Writers',
  starring: 'Starring',
  music: 'Music',
  'release date': 'Released',
  runtime: 'Runtime',
  conflict: 'Conflict',
  place: 'Place',
  outcome: 'Outcome',
  side1: 'Side 1',
  side2: 'Side 2',
  commanders1: 'Commanders (side 1)',
  commanders2: 'Commanders (side 2)',
  founder: 'Founded by',
  leader: 'Leaders',
  headquarters: 'Headquarters',
};

/** `max speed` → `Max speed`; `commanders1` keeps its known label. */
export const fieldLabel = (name: string): string =>
  FIELD_NAMES[name] ?? name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');

/** A page's description for search results: what kind of thing it is, in which section. */
/**
 * An article's kind for its title block: its infobox's name in words ("CelestialBody" becomes
 * "Celestial body"), or its section's word when it has no infobox.
 */
export const kindLabel = (kind: string | undefined, section: Section): string => {
  const words =
    kind === undefined ? SECTION_LABELS[section].one : kind.replace(/([a-z])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
};

export const articleDescription = (title: string, section: Section, legends: boolean): string =>
  `${title}${legends ? ' (Legends)' : ''}: a ${SECTION_LABELS[section].one} in the Star Wars archive, with its facts, its story and links to everything related.`;

export const sectionDescription = (section: Section, count: number): string =>
  `${SECTION_LABELS[section].blurb} ${count.toLocaleString('en-US')} ${SECTION_LABELS[section].plural.toLowerCase()} in the Star Wars archive.`;

export const letterTitle = (section: Section, letter: string): string =>
  `${SECTION_LABELS[section].plural}: ${letter === '0' ? '0–9 and symbols' : letter.toUpperCase()}`;

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

/** The /sabacc/ page and its header link. Every claim matches what sabacc.starwars.run says. */
export const SABACC_TEXT = {
  nav: 'Sabacc',
  title: 'Sabacc',
  description:
    'Play Sabacc, the card game that won the Millennium Falcon, in your browser: classic or 3D, solo against droids or at a private table with friends.',
  intro:
    'The card game that won Han Solo the Millennium Falcon. Play it at sabacc.starwars.run, with the classic Legends rules.',
  modesHeading: 'Ways to play',
  modes: [
    {
      key: 'home',
      name: 'Play in your browser',
      about: 'The classic table, ready the moment the page loads.',
    },
    { key: 'threeD', name: 'Play in 3D', about: 'The same game at a fully rendered 3D table.' },
    {
      key: 'home',
      name: 'Play with friends',
      about: 'Open a private table for up to five players. Droids take any empty seats.',
    },
    {
      key: 'home',
      name: 'Play solo',
      about: 'No crew around? Droid opponents are always ready to deal.',
    },
  ],
  rulesHeading: 'New to sabacc?',
  rules: 'Read the rules',
  rulesAbout: 'They are on the game page, next to the table.',
} as const;

/** The Explore page (swr-7f1.7): questions answered with SQL in the browser. */
/** Ask the archive (swr-ei6): a question in plain words, answered from Explore's tables. */
export const ASK_TEXT = {
  heading: 'Ask the archive',
  label: 'Your question',
  followUpLabel: 'Ask a follow-up, or a new question',
  ask: 'Ask',
  newQuestion: 'Start over',
  examplesLabel: 'Try',
  examples: [
    'Which Wookiees fought for the Rebel Alliance?',
    'Which films does Boba Fett appear in?',
    'Who trained Obi-Wan Kenobi?',
    'What is the most populous planet?',
    'Which droids appear in A New Hope?',
  ],
  note: 'Your question goes to an AI service, which turns it into a search of the archive. Questions are kept, without who asked, to make the answers better.',
  reading: 'Reading your question…',
  matched: (pairs: readonly string[]): string =>
    pairs.length === 0 ? 'No names to look up.' : `Looked up ${pairs.join('; ')}.`,
  noMatch: (asked: string): string => `“${asked}” (no article by that name)`,
  match: (asked: string, title: string): string => `“${asked}” → ${title}`,
  searching: (looksFor: string): string =>
    looksFor.trim() === '' ? 'Searching the archive…' : `Searching the archive for ${looksFor}…`,
  found: (n: number, truncated: boolean): string =>
    truncated
      ? `Found more than ${n.toLocaleString('en-US')}; showing the first ${n.toLocaleString('en-US')}.`
      : n === 0
        ? 'Found nothing.'
        : `Found ${n.toLocaleString('en-US')}.`,
  writing: 'Writing the answer…',
  asked: (question: string): string => `You asked: “${question}”`,
  howAnswered: 'How I answered',
  editSql: 'Open this query in the SQL editor',
  unavailable:
    'The AI that reads questions isn’t answering right now. Try again in a moment, or write SQL yourself below.',
  slow: 'That took too long, so I stopped. The AI service may be busy: try again in a moment.',
  unanswerable:
    'I couldn’t turn that into a search of the archive. Try asking it another way: name the people, places or ships you mean.',
  advanced: 'Write SQL yourself',
} as const;

export const EXPLORE_TEXT = {
  nav: 'Ask',
  title: 'Explore the archive',
  description:
    'Ask the Star Wars archive anything in plain words: who comes from Tatooine, which films Boba Fett appears in, the biggest starships. Or query its tables with SQL, right in your browser.',
  intro:
    'Ask a question in plain words, and the archive searches all 227,000 articles for the answer. You see what it found, every result links to its page, and you can check how it searched.',
  noScript:
    'Exploring runs a database in your browser, and it needs JavaScript. Without it, browse the sections instead:',
  questions: 'Try a question',
  sqlLabel: 'SQL',
  run: 'Run query',
  runHint:
    'Ctrl+Enter runs the query. It runs on the archive’s server, read-only, for up to 10 seconds.',
  starting: 'Running…',
  running: 'Running…',
  results: 'Results',
  rows: (n: number, ms: number, truncated: boolean): string =>
    `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'}${truncated ? ' (showing the first 500)' : ''} in ${Math.max(1, Math.round(ms)).toLocaleString('en-US')} ms.`,
  failed: (reason: string): string => `The query didn't run: ${reason}`,
  tablesHeading: 'The tables',
  archiveTable:
    'archive: one row per article. title, name, path, section, kind, era, links (how many articles link to it), pair (the canon article’s path, shared by an article and its Legends twin), and numbers where the article has them: height_m, mass_kg, length_m, wingspan_m, depth_m, diameter_km, population, crew, passengers, cost_credits, max_speed_kph, mglt, hyperdrive_class, day_hours, year_days.',
  factsTable:
    'facts: one row per infobox value. title, field, item (0 for the first), text, and link: the article it points to (homeworld → Tatooine).',
  appearancesTable:
    'appearances: one row per entry of an article’s Appearances section. For a film, show or book, who and what turns up in it; for anything else, the works it turns up in. title, item (its place in the list, from 0), text, link: the entry’s article, markers (1st, mo for mentioned only, flash…), and noncanon.',
  presets: [
    {
      label: 'Tallest characters',
      sql: "SELECT name, path, height_m\nFROM archive\nWHERE section = 'characters' AND height_m IS NOT NULL\nORDER BY height_m DESC\nLIMIT 25",
    },
    {
      label: 'Who comes from Tatooine?',
      sql: "SELECT a.name, a.path, a.era\nFROM facts f JOIN archive a USING (title)\nWHERE f.field = 'homeworld' AND f.link = 'Tatooine'\nORDER BY a.name",
    },
    {
      label: 'Most populous planets',
      sql: "SELECT name, path, population\nFROM archive\nWHERE section = 'planets' AND population IS NOT NULL\nORDER BY population DESC\nLIMIT 25",
    },
    {
      label: 'Fastest starships',
      sql: "SELECT name, path, mglt, hyperdrive_class\nFROM archive\nWHERE section = 'starships' AND mglt IS NOT NULL\nORDER BY mglt DESC\nLIMIT 25",
    },
    {
      label: 'Biggest starships',
      sql: "SELECT name, path, length_m\nFROM archive\nWHERE section = 'starships' AND length_m IS NOT NULL\nORDER BY length_m DESC\nLIMIT 25",
    },
    {
      label: 'Who’s in A New Hope?',
      sql: "SELECT a.name, a.path, p.markers\nFROM appearances p JOIN archive a USING (title)\nWHERE p.link = 'Star Wars: Episode IV A New Hope'\n  AND a.section = 'characters' AND NOT p.noncanon\nORDER BY a.name",
    },
    {
      label: 'Most-seen characters',
      sql: "SELECT a.name, a.path, count(*) AS works\nFROM appearances p JOIN archive a USING (title)\nWHERE a.section = 'characters' AND a.era = 'canon'\n  AND NOT p.noncanon\n  AND NOT list_has_any(string_split(p.markers, ','), ['mo', 'imo', '1stm'])\nGROUP BY ALL\nORDER BY works DESC\nLIMIT 25",
    },
    {
      label: 'Articles per section',
      sql: 'SELECT section, era, count(*) AS articles\nFROM archive\nGROUP BY ALL\nORDER BY section, era',
    },
  ],
} as const;

/**
 * Wookieepedia's appearance markers (src/ingest/wookieepedia/appearances.ts), as short notes
 * after a work: "A New Hope (first appearance)".
 */
export const MARKER_LABELS: Readonly<Record<string, string>> = {
  '1st': 'first appearance',
  '1stm': 'first mentioned',
  '1stp': 'first pictured',
  '1stid': 'first identified',
  mo: 'mentioned only',
  imo: 'indirect mention',
  mentioned: 'mentioned',
  flash: 'in a flashback',
  hologram: 'as a hologram',
  po: 'pictured only',
  voice: 'voice only',
  vision: 'in a vision',
  ghost: 'as a Force spirit',
  ret: 'retconned',
  un: 'unidentified',
  nc: 'non-canon',
  co: 'cameo',
  cutscene: 'in a cutscene',
  unborn: 'not yet born',
  del: 'deleted scene',
  codex: 'in a codex entry',
};

export const TEXT = {
  skipLink: 'Skip to content',
  primaryNav: 'Sections',
  darkTheme: 'Dark theme',
  breadcrumb: 'Breadcrumb',
  home: 'Home',
  facts: 'Facts',
  homeIntro: (articles: number): string =>
    `The galaxy, far, far away, in ${articles.toLocaleString('en-US')} articles from Wookieepedia: canon and Legends, from Jedi Masters to junk dealers to moons nobody remembers. Every page links to everything it mentions. Pick a section, search the archive, or ask it a question on the Explore page.`,
  homeAskLabel: 'Ask the archive a question in plain words',
  homeAskPlaceholder: 'Which Wookiees fought for the Rebel Alliance?',
  bestKnown: 'Best known',
  show: 'Show',
  both: 'Both',
  kinds: 'Kinds',
  aToZ: 'A to Z',
  bestKnownCharacters: 'Best-known characters',
  notFoundTitle: 'Page not found',
  notFoundBody:
    'These aren’t the droids you’re looking for. There’s no page at this address: it may have moved, or it never existed.',
  notFoundHome: 'Back to the archive',
  notFoundSearch: 'search for it',
  searchTitle: 'Search the archive',
  searchDescription:
    'Search the whole Star Wars archive, canon and Legends: characters, planets, starships, battles, stories and more.',
  searchLabel: 'Search',
  searchPlaceholder: 'Search the archive',
  searchKindLabel: 'Show',
  searchAllKinds: 'Everything',
  searchHint:
    'Type a name: a character, a planet, a ship. Arrow keys move through the results; Escape clears.',
  searching: 'Searching the archive…',
  searchNoScript:
    'Search runs in your browser, and it needs JavaScript. Without it, browse a section instead:',
  searchFailed: 'The search index didn’t load. Check your connection and try again.',
  searchResults: 'Search results',
  askInstead: 'That sounds like a question. Ask the archive instead →',
  noResults: (query: string): string =>
    `Nothing in the archive matches “${query}”. Check the spelling, or try fewer letters.`,
  resultCount: (n: number, query: string): string =>
    `${String(n)} ${n === 1 ? 'match' : 'matches'} for “${query}”.`,
  legends: 'Legends',
  canon: 'Canon',
  legendsVersion: 'Legends version →',
  canonVersion: 'Canon version →',
  linkedFrom: 'Linked from',
  linkedFromCount: (n: number): string =>
    `Linked from ${n.toLocaleString('en-US')} ${n === 1 ? 'article' : 'articles'}`,
  linkedFromNote: (title: string): string => `The best-known articles that mention ${title}.`,
  legendsNote:
    'This article is part of Legends: the expanded-universe stories that Lucasfilm set apart from canon in 2014.',
  appearances: 'Appearances',
  appearanceCount: (n: number): string =>
    `${n.toLocaleString('en-US')} ${n === 1 ? 'work' : 'works'}, in story order`,
  noncanonAppearances: 'Non-canon appearances',
  cast: 'Who turns up here',
  castCount: (n: number, label: string): string => `${label}: ${n.toLocaleString('en-US')}`,
  notInArchive: 'Not in the archive',
  inSection: (n: number): string => `${n.toLocaleString('en-US')} articles`,
  offlineTitle: 'You’re offline',
  offlineBody:
    'This page hasn’t been saved for the journey yet, and there’s no signal out here. Pages you’ve already visited still work, and so does search.',
  dataCredit: 'Text and facts from',
  dataLicense: 'licensed under',
  dataPerPage: 'Each page credits its source article.',
  fanProject:
    'An unofficial fan project. Star Wars and its characters are trademarks of Lucasfilm Ltd.',
};
