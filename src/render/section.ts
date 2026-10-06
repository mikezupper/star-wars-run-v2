// A section's pages (ADR 0008): `/characters/` lists the letters with counts; `/characters/l/`
// lists that letter's articles. One page of 48,000 characters would be unusable.
import { serverHtml } from '@gyral/ssr';
import { displayTitle, letterPath, sectionPath, type Entry } from '../domain/archive.js';
import type { Section } from '../domain/sections.js';
import { letterTitle, sectionDescription, SECTION_LABELS, TEXT } from '../labels.js';
import { breadcrumb, type PageMeta } from './layout.js';

/** Letters in display order, with their entries: `0` (digits, symbols) after `z`. */
export function byLetter(entries: readonly Entry[]): Map<string, Entry[]> {
  const out = new Map<string, Entry[]>();
  for (const e of entries) out.set(e.letter, [...(out.get(e.letter) ?? []), e]);
  return new Map([...out].sort(([a], [b]) => (a === '0' ? 1 : b === '0' ? -1 : a < b ? -1 : 1)));
}

export const sectionMeta = (section: Section, count: number): PageMeta => ({
  path: sectionPath(section),
  title: SECTION_LABELS[section].plural,
  description: sectionDescription(section, count),
  section,
});

export const sectionBody = (
  section: Section,
  letters: ReadonlyMap<string, readonly Entry[]>,
) => serverHtml`
  ${breadcrumb([{ href: '/', label: TEXT.home }], SECTION_LABELS[section].plural)}
  <h1>${SECTION_LABELS[section].plural}</h1>
  <p>${SECTION_LABELS[section].blurb}</p>
  <nav aria-label=${TEXT.letters}>
    <ul>
      ${[...letters].map(
        ([letter, entries]) => serverHtml`<li>
          <a href=${letterPath(section, letter)}>${letter === '0' ? '0–9' : letter.toUpperCase()}</a>
          <data value=${String(entries.length)}>${entries.length.toLocaleString('en-US')}</data>
        </li>`,
      )}
    </ul>
  </nav>
`;

export const letterMeta = (section: Section, letter: string, count: number): PageMeta => ({
  path: letterPath(section, letter),
  title: letterTitle(section, letter),
  description: `${letterTitle(section, letter)}. ${TEXT.inSection(count)} in the Star Wars archive.`,
  section,
});

export const letterBody = (
  section: Section,
  letter: string,
  entries: readonly Entry[],
) => serverHtml`
  ${breadcrumb(
    [
      { href: '/', label: TEXT.home },
      { href: sectionPath(section), label: SECTION_LABELS[section].plural },
    ],
    letter === '0' ? '0–9' : letter.toUpperCase(),
  )}
  <h1>${letterTitle(section, letter)}</h1>
  <ul>
    ${entries.map(
      (e) =>
        serverHtml`<li><a href=${e.path}>${displayTitle(e.title)}${
          e.era === 'legends' ? serverHtml` <small>${TEXT.legends}</small>` : ''
        }</a></li>`,
    )}
  </ul>
`;
