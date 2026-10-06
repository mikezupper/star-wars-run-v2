// Matching swapi.info records to Wookieepedia articles (swr-7f1.5, ADR 0007): each record finds
// the canon article it describes, so the two sources can merge into one page that keeps the
// record's existing URL. Records that find nothing, or only an article of the wrong kind or era,
// are reported, not guessed.
import type { Dataset, Kind, Slug } from './records.js';

/** What matching needs to know about the snapshot. */
export interface MatchIndex {
  readonly articles: ReadonlyMap<
    string,
    { readonly era: 'canon' | 'legends'; readonly kind?: string }
  >;
  readonly redirects: ReadonlyMap<string, string>;
}

/** The Wookieepedia infobox kinds an article may have to match a record of each swapi kind. */
export const MATCHING_KINDS: Readonly<Record<Kind, ReadonlySet<string>>> = {
  films: new Set(['Movie']),
  people: new Set(['Character', 'Droid']),
  planets: new Set(['CelestialBody']),
  // `Droid` is a general article with no infobox: the one species page without one.
  species: new Set(['Species', '']),
  // swapi.info files short-range starfighters (TIE fighters) under vehicles.
  vehicles: new Set([
    'RepulsorliftVehicle',
    'GroundVehicle',
    'AirVehicle',
    'AquaticVehicle',
    'IndividualVehicle',
    'Vehicle',
    'ShipSeries',
    'StarshipClass',
  ]),
  starships: new Set(['StarshipClass', 'IndividualShip', 'ShipSeries', 'SpaceStation']),
};

/**
 * swapi.info spellings that are typos, mapped to the Wookieepedia title by hand. Only for names
 * no rule can fix: a fuzzy match could quietly pick the wrong character.
 */
export const SWAPI_ALIASES: Readonly<Record<string, string>> = {
  'Ayla Secura': 'Aayla Secura',
  'Wicket Systri Warrick': 'Wicket Wystri Warrick',
  'Ratts Tyerel': 'Ratts Tyerell',
  'Banking clan frigte': 'Munificent-class star frigate',
};

export type Match =
  | { readonly kind: Kind; readonly slug: Slug; readonly name: string; readonly title: string }
  | {
      readonly kind: Kind;
      readonly slug: Slug;
      readonly name: string;
      /** Why there's no match, and the best candidate found, for the report. */
      readonly problem: 'no article' | 'wrong kind' | 'legends only';
      readonly candidate?: string;
    };

const EPISODES = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'] as const;

/** MediaWiki titles: underscores are spaces, and the first letter is a capital. */
const title = (raw: string): string => {
  const t = raw.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Lower-cased title → title, over articles and redirects, built once per index. */
const caselessCache = new WeakMap<MatchIndex, ReadonlyMap<string, string>>();
function caseless(index: MatchIndex): ReadonlyMap<string, string> {
  const cached = caselessCache.get(index);
  if (cached !== undefined) return cached;
  const built = new Map<string, string>();
  for (const t of [...index.articles.keys(), ...index.redirects.keys()]) {
    if (!built.has(t.toLowerCase())) built.set(t.toLowerCase(), t);
  }
  caselessCache.set(index, built);
  return built;
}

/**
 * The article a title lands on through redirects (at most five hops). Wookieepedia titles are
 * case-sensitive after the first letter and swapi.info's capitals aren't always theirs, so a
 * title that names nothing is retried ignoring case.
 */
function land(raw: string, index: MatchIndex): string | undefined {
  const exact = title(raw);
  let current =
    index.articles.has(exact) || index.redirects.has(exact)
      ? exact
      : (caseless(index).get(exact.toLowerCase()) ?? exact);
  for (let hop = 0; hop <= 5; hop++) {
    if (index.articles.has(current)) return current;
    const next = index.redirects.get(current);
    if (next === undefined) return undefined;
    current = title(next);
  }
  return undefined;
}

/**
 * The titles worth trying for a record, best first: a known alias, the full film title, the
 * name, and for craft the model, often the precise title when the name is ambiguous ("X-wing").
 */
function candidates(
  kind: Kind,
  name: string,
  extra: { episode?: number; model?: string },
): string[] {
  const out: string[] = [];
  const alias = SWAPI_ALIASES[name];
  if (alias !== undefined) out.push(alias);
  if (kind === 'films' && extra.episode !== undefined) {
    out.push(`Star Wars: Episode ${EPISODES[extra.episode] ?? String(extra.episode)} ${name}`);
  }
  out.push(name);
  if (extra.model !== undefined && extra.model !== name) out.push(extra.model);
  return out;
}

function matchOne(
  kind: Kind,
  slug: Slug,
  name: string,
  index: MatchIndex,
  extra: { episode?: number; model?: string } = {},
): Match {
  // A title that lands on a `/Legends` page is tried without the suffix first: the canon
  // article has the plain title.
  const landed = candidates(kind, name, extra).flatMap((c) => {
    const l = land(c, index);
    if (l === undefined) return [];
    return l.endsWith('/Legends') ? [l.slice(0, -'/Legends'.length), l] : [l];
  });
  let best: Match | undefined;
  for (const t of landed) {
    const article = index.articles.get(t);
    if (article === undefined) continue;
    if (!MATCHING_KINDS[kind].has(article.kind ?? '')) {
      best ??= {
        kind,
        slug,
        name,
        problem: 'wrong kind',
        candidate: `${t} (${article.kind ?? 'no infobox'})`,
      };
      continue;
    }
    if (article.era !== 'canon') {
      best ??= { kind, slug, name, problem: 'legends only', candidate: t };
      continue;
    }
    return { kind, slug, name, title: t };
  }
  return best ?? { kind, slug, name, problem: 'no article' };
}

/** Every swapi.info record, matched to a canon article or reported. */
export function matchSwapi(data: Dataset, index: MatchIndex): readonly Match[] {
  return [
    ...data.films.map((r) => matchOne('films', r.slug, r.name, index, { episode: r.episode })),
    ...data.people.map((r) => matchOne('people', r.slug, r.name, index)),
    ...data.planets.map((r) => matchOne('planets', r.slug, r.name, index)),
    ...data.species.map((r) => matchOne('species', r.slug, r.name, index)),
    ...data.vehicles.map((r) => matchOne('vehicles', r.slug, r.name, index, { model: r.model })),
    ...data.starships.map((r) => matchOne('starships', r.slug, r.name, index, { model: r.model })),
  ];
}

/** Articles that more than one record matched (Darth Vader and Anakin Skywalker share one). */
export function sharedTitles(matches: readonly Match[]): ReadonlyMap<string, readonly string[]> {
  const by = new Map<string, string[]>();
  for (const m of matches) {
    if ('title' in m) by.set(m.title, [...(by.get(m.title) ?? []), `${m.kind}/${m.slug}`]);
  }
  return new Map([...by].filter(([, records]) => records.length > 1));
}
