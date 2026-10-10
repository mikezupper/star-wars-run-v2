// A section's pages (ADR 0008; the look, ADR 0004): `/characters/` shows its kinds, its
// best-known subjects and the letters with counts; `/characters/letters/l/` lists that letter's best known and
// all its articles. One page of 48,000 characters would be unusable. Both filter by continuity.
import { html, nothing } from '@gyral/core';
import {
  displayTitle,
  letterPath,
  LETTER_PAGE_SIZE,
  sectionPath,
  type Archive,
  type Entry,
} from '../domain/archive.js';
import { eraOf, rankKnown, type Known } from '../domain/known.js';
import type { LinkGraph } from '../domain/links.js';
import type { Section } from '../domain/sections.js';
import { kindLabel, letterTitle, sectionDescription, SECTION_LABELS, TEXT } from '../labels.js';
import { breadcrumb, type PageMeta } from './layout.js';

/** Letters in display order, with their entries: `0` (digits, symbols) after `z`. */
export function byLetter(entries: readonly Entry[]): Map<string, Entry[]> {
  const out = new Map<string, Entry[]>();
  for (const e of entries) {
    const inLetter = out.get(e.letter) ?? [];
    inLetter.push(e);
    out.set(e.letter, inLetter);
  }
  return new Map([...out].sort(([a], [b]) => (a === '0' ? 1 : b === '0' ? -1 : a < b ? -1 : 1)));
}

export const sectionMeta = (section: Section, count: number): PageMeta => ({
  path: sectionPath(section),
  title: SECTION_LABELS[section].plural,
  description: sectionDescription(section, count),
  section,
});

/** How many best-known subjects a section page lists, and a letter page. */
const SECTION_BEST = 24;
const LETTER_BEST = 12;

/**
 * Canon, Legends or both: three radio buttons; the CSS hides the other continuity's rows with
 * :has(), so the filter needs no script and the page stays the same for every visitor.
 */
const eraFilter = (era = 'both') => html`
  <fieldset data-era-filter>
    <legend>${TEXT.show}</legend>
    <label
      ><input type="radio" name="era" value="both" ?checked=${era === 'both'} />${TEXT.both}</label
    >
    <label
      ><input
        type="radio"
        name="era"
        value="canon"
        ?checked=${era === 'canon'}
      />${TEXT.canon}</label
    >
    <label
      ><input
        type="radio"
        name="era"
        value="legends"
        ?checked=${era === 'legends'}
      />${TEXT.legends}</label
    >
  </fieldset>
`;

const eraLabel = (known: Known) =>
  known.entries.map((e) => (e.era === 'legends' ? TEXT.legends : TEXT.canon)).join(' · ');

const ranking = (best: readonly Known[]) =>
  best.length === 0
    ? nothing
    : html`<section aria-labelledby="best-known">
        <h2 id="best-known">${TEXT.bestKnown}</h2>
        <ol>
          ${best.map(
            (known) =>
              html`<li data-era=${eraOf(known)}>
                <a href=${known.entries[0]?.path ?? '/'}>${known.name}</a>
                <small>${eraLabel(known)}</small>
              </li>`,
          )}
        </ol>
      </section>`;

/** The section's kinds, most common first, with counts. */
function kinds(section: Section, entries: readonly Entry[]) {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const kind = kindLabel(e.kind, section);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const sorted = [...counts].sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1));
  return sorted.length < 2
    ? nothing
    : html`<ul aria-label=${TEXT.kinds}>
        ${sorted.map(
          ([kind, n]) =>
            html`<li>${kind} <data value=${String(n)}>${n.toLocaleString('en-US')}</data></li>`,
        )}
      </ul>`;
}

export const sectionBody = (
  section: Section,
  letters: ReadonlyMap<string, readonly Entry[]>,
  archive: Archive,
  links: LinkGraph,
) => {
  const entries = archive.bySection.get(section) ?? [];
  return html`
    ${breadcrumb([{ href: '/', label: TEXT.home }], SECTION_LABELS[section].plural)}
    <header>
      <p>${TEXT.inSection(entries.length)}</p>
      <h1>${SECTION_LABELS[section].plural}</h1>
      <p>${SECTION_LABELS[section].blurb}</p>
    </header>
    ${eraFilter()} ${kinds(section, entries)}
    ${ranking(rankKnown(entries, archive, links, SECTION_BEST))}
    <h2 id="a-to-z">${TEXT.aToZ}</h2>
    <nav aria-labelledby="a-to-z">
      <ul>
        ${[...letters].map(
          ([letter, inLetter]) =>
            html`<li>
              <a href=${letterPath(section, letter)}
                >${letter === '0' ? '0–9' : letter.toUpperCase()}</a
              >
              <data value=${String(inLetter.length)}
                >${inLetter.length.toLocaleString('en-US')}</data
              >
            </li>`,
        )}
      </ul>
    </nav>
  `;
};

export const letterMeta = (
  section: Section,
  letter: string,
  count: number,
  page = 1,
): PageMeta => ({
  path: letterPath(section, letter, page),
  title:
    page === 1 ? letterTitle(section, letter) : TEXT.pagedTitle(letterTitle(section, letter), page),
  description: `${letterTitle(section, letter)}. ${TEXT.inSection(count)} in the Star Wars archive.${count > LETTER_PAGE_SIZE ? ` ${TEXT.indexPage(page, Math.ceil(count / LETTER_PAGE_SIZE))}.` : ''}`,
  section,
});

/** Three CSS-selected link sets preserve the radio choice on navigation, without JavaScript. */
const pagination = (section: Section, letter: string, page: number, pages: number) =>
  pages < 2
    ? nothing
    : html`<nav data-pagination aria-label=${TEXT.indexPages}>
        ${['both', 'canon', 'legends'].map((era) => {
          const href = (n: number) =>
            `${letterPath(section, letter, n)}${era === 'both' ? '' : `?era=${era}`}`;
          return html`<ul data-pagination-era=${era}>
            ${page === 1 ? nothing : html`<li><a href=${href(page - 1)} rel="prev">${TEXT.previousPage}</a></li>`}
            ${Array.from({ length: pages }, (_, n) => n + 1).map((n) => html`<li><a href=${href(n)} aria-label=${TEXT.indexPage(n, pages)} aria-current=${n === page ? 'page' : undefined}>${n}</a></li>`)}
            ${page === pages ? nothing : html`<li><a href=${href(page + 1)} rel="next">${TEXT.nextPage}</a></li>`}
          </ul>`;
        })}
      </nav>`;

export const letterBody = (
  section: Section,
  letter: string,
  entries: readonly Entry[],
  archive: Archive,
  links: LinkGraph,
  page = 1,
  era = 'both',
) => html`
  ${breadcrumb(
    [
      { href: '/', label: TEXT.home },
      { href: sectionPath(section), label: SECTION_LABELS[section].plural },
    ],
    letter === '0' ? '0–9' : letter.toUpperCase(),
  )}
  <header>
    <p>${TEXT.inSection(entries.length)}</p>
    <h1>${letterTitle(section, letter)}</h1>
    ${entries.length > LETTER_PAGE_SIZE ? html`<p>${TEXT.indexPage(page, Math.ceil(entries.length / LETTER_PAGE_SIZE))}</p>` : nothing}
  </header>
  ${eraFilter(era)}
  ${page === 1 ? ranking(rankKnown(entries, archive, links, LETTER_BEST)) : nothing}
  <h2 id="a-to-z">${TEXT.aToZ}</h2>
  <ul aria-labelledby="a-to-z">
    ${entries.slice((page - 1) * LETTER_PAGE_SIZE, page * LETTER_PAGE_SIZE).map(
      (e) =>
        html`<li data-era=${e.era}>
          <a href=${e.path}
            >${displayTitle(e.title)}${
              e.era === 'legends' ? html` <small>${TEXT.legends}</small>` : ''
            }</a
          >
        </li>`,
    )}
  </ul>
  ${pagination(section, letter, page, Math.ceil(entries.length / LETTER_PAGE_SIZE))}
`;
