// A record's page, `/people/luke-skywalker/`: its known facts as a description list, then a
// section of links for each relationship it has (docs/product-specs/records.md).
import { nothing } from 'lit';
import { serverHtml } from '@gyral/ssr';
import type { Catalog } from '../domain/catalog.js';
import { kindPath, recordPath } from '../domain/paths.js';
import type {
  AnyRecord,
  Film,
  Kind,
  Person,
  Planet,
  Slug,
  Species,
  Starship,
  Vehicle,
} from '../domain/records.js';
import { count, date, list, quantity, roman, text } from './format.js';
import {
  FIELD_LABELS,
  KIND_LABELS,
  RELATION_LABELS,
  recordDescription,
  TEXT,
  UNITS,
} from '../labels.js';
import { breadcrumb, type PageMeta } from './layout.js';

/** One fact row; `undefined` when the value isn't known, so the row is left out. */
type Row = readonly [label: string, value: unknown] | undefined;

const row = <T>(label: string, value: T | undefined, show: (v: T) => unknown = (v) => v): Row =>
  value === undefined ? undefined : [label, show(value)];

const listRow = (label: string, items: readonly string[]): Row =>
  items.length === 0 ? undefined : [label, list(items)];

/** A record's name as link text. Film titles are works, so they're marked as such. */
export const recordName = (r: AnyRecord) =>
  r.kind === 'films' ? serverHtml`<cite>${r.name}</cite>` : r.name;

const link = (catalog: Catalog, kind: Kind, slug: Slug) => {
  const target = catalog.get(kind, slug);
  // src/ingest guarantees every link resolves; fall back to the slug rather than crash a build.
  return serverHtml`<a href=${recordPath(kind, slug)}>${target === undefined ? slug : recordName(target)}</a>`;
};

const filmRows = (r: Film): readonly Row[] => [
  [FIELD_LABELS.episode, roman(r.episode)],
  [FIELD_LABELS.releaseDate, date(r.releaseDate)],
  [FIELD_LABELS.director, r.director],
  listRow(FIELD_LABELS.producers, r.producers),
];

const personRows = (r: Person, c: Catalog): readonly Row[] => [
  row(FIELD_LABELS.homeworld, r.homeworld, (s) => link(c, 'planets', s)),
  row(FIELD_LABELS.birthYear, r.birthYear),
  row(FIELD_LABELS.gender, r.gender, text),
  row(FIELD_LABELS.height, r.height, (v) => quantity(v, UNITS.cm)),
  row(FIELD_LABELS.mass, r.mass, (v) => quantity(v, UNITS.kg)),
  listRow(FIELD_LABELS.hairColors, r.hairColors),
  listRow(FIELD_LABELS.skinColors, r.skinColors),
  listRow(FIELD_LABELS.eyeColors, r.eyeColors),
];

const planetRows = (r: Planet): readonly Row[] => [
  listRow(FIELD_LABELS.climates, r.climates),
  listRow(FIELD_LABELS.terrains, r.terrains),
  row(FIELD_LABELS.gravity, r.gravity, text),
  row(FIELD_LABELS.diameter, r.diameter, (v) => quantity(v, UNITS.km)),
  row(FIELD_LABELS.rotationPeriod, r.rotationPeriod, (v) => quantity(v, UNITS.hours)),
  row(FIELD_LABELS.orbitalPeriod, r.orbitalPeriod, (v) => quantity(v, UNITS.days)),
  row(FIELD_LABELS.surfaceWater, r.surfaceWater, (v) => quantity(v, UNITS.percent)),
  row(FIELD_LABELS.population, r.population, (v) => quantity(v)),
];

const speciesRows = (r: Species, c: Catalog): readonly Row[] => [
  row(FIELD_LABELS.homeworld, r.homeworld, (s) => link(c, 'planets', s)),
  row(FIELD_LABELS.classification, r.classification, text),
  row(FIELD_LABELS.designation, r.designation, text),
  row(FIELD_LABELS.language, r.language),
  row(FIELD_LABELS.averageHeight, r.averageHeight, (v) => quantity(v, UNITS.cm)),
  row(FIELD_LABELS.averageLifespan, r.averageLifespan, (v) =>
    v === 'indefinite' ? text(UNITS.indefinite) : quantity(v, UNITS.years),
  ),
  listRow(FIELD_LABELS.hairColors, r.hairColors),
  listRow(FIELD_LABELS.skinColors, r.skinColors),
  listRow(FIELD_LABELS.eyeColors, r.eyeColors),
];

const craftRows = (r: Vehicle | Starship): readonly Row[] => [
  [FIELD_LABELS.model, r.model],
  [FIELD_LABELS.craftClass, text(r.craftClass)],
  listRow(FIELD_LABELS.manufacturers, r.manufacturers),
  row(FIELD_LABELS.cost, r.cost, (v) => quantity(v, UNITS.credits)),
  row(FIELD_LABELS.length, r.length, (v) => quantity(v, UNITS.m)),
  row(FIELD_LABELS.maxAtmospheringSpeed, r.maxAtmospheringSpeed, (v) => quantity(v)),
  ...(r.kind === 'starships'
    ? [
        row(FIELD_LABELS.hyperdriveRating, r.hyperdriveRating, (v) => quantity(v)),
        row(FIELD_LABELS.mglt, r.mglt, (v) => quantity(v)),
      ]
    : []),
  row(FIELD_LABELS.crew, r.crew, count),
  row(FIELD_LABELS.passengers, r.passengers, count),
  row(FIELD_LABELS.cargoCapacity, r.cargoCapacity, (v) => quantity(v, UNITS.kg)),
  row(FIELD_LABELS.consumables, r.consumables),
];

function rows(r: AnyRecord, c: Catalog): readonly [string, unknown][] {
  const all = (() => {
    switch (r.kind) {
      case 'films':
        return filmRows(r);
      case 'people':
        return personRows(r, c);
      case 'planets':
        return planetRows(r);
      case 'species':
        return speciesRows(r, c);
      case 'vehicles':
      case 'starships':
        return craftRows(r);
    }
  })();
  return all.filter((x): x is [string, unknown] => x !== undefined);
}

const crawl = (r: AnyRecord) =>
  r.kind !== 'films'
    ? nothing
    : serverHtml`<section aria-labelledby="crawl">
        <h2 id="crawl" data-pagefind-ignore>${TEXT.openingCrawl}</h2>
        <blockquote>
          ${r.openingCrawl.split(/\n\s*\n/).map((p) => serverHtml`<p>${p.replace(/\s*\n\s*/g, ' ')}</p>`)}
        </blockquote>
      </section>`;

export const recordMeta = (r: AnyRecord): PageMeta => ({
  path: recordPath(r.kind, r.slug),
  title: r.name,
  description: recordDescription(r),
  section: r.kind,
  searchKind: r.kind,
});

export function recordBody(r: AnyRecord, c: Catalog) {
  const facts = rows(r, c);
  const relations = c.relations(r).filter((rel) => rel.slugs.length > 0);
  return serverHtml`
    ${breadcrumb(
      [
        { href: '/', label: TEXT.home },
        { href: kindPath(r.kind), label: KIND_LABELS[r.kind].plural },
      ],
      r.name,
    )}
    <article>
      <h1 data-pagefind-weight="10">${r.name}</h1>
      ${
        facts.length === 0
          ? nothing
          : serverHtml`<section aria-labelledby="facts">
              <h2 id="facts" data-pagefind-ignore>${TEXT.facts}</h2>
              <dl>
                ${facts.map(
                  // The spaces and line breaks matter: Pagefind reads text, and without them
                  // excerpts run together ("HomeworldTatooineBorn19BBY").
                  ([label, value]) => serverHtml`<dt>${label}</dt> <dd>${value}</dd>
                  `,
                )}
              </dl>
            </section>`
      }
      ${crawl(r)}
      ${relations.map(
        // Down-weighted for search: a page that only links to "Luke Skywalker" must rank below
        // Luke's own page (data-pagefind-weight, docs/product-specs/search.md).
        (rel) => serverHtml`<section aria-labelledby=${rel.name} data-pagefind-weight="0.1">
          <h2 id=${rel.name} data-pagefind-ignore>${RELATION_LABELS[rel.name] ?? rel.name}</h2>
          <ul>${rel.slugs.map((slug) => serverHtml`<li>${link(c, rel.kind, slug)}</li>`)}</ul>
        </section>`,
      )}
    </article>
  `;
}
