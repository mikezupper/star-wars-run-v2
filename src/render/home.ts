// The home page (ADR 0004, "The look"): what the archive is, a question box as the way in, the
// best-known articles, and a card for each section.
import { html, nothing } from '@gyral/core';
import { displayTitle, sectionPath, type Archive, type Entry } from '../domain/archive.js';
import type { LinkGraph } from '../domain/links.js';
import { SECTIONS, type Section } from '../domain/sections.js';
import { DESCRIPTION, SITE_NAME } from '../site.js';
import { EXPLORE_TEXT, SECTION_LABELS, TEXT } from '../labels.js';
import { exploreMeta } from './explore.js';
import type { PageMeta } from './layout.js';

export const homeMeta: PageMeta = {
  path: '/',
  title: SITE_NAME,
  description: DESCRIPTION,
};

/** How many best-known characters the home page lists. */
export const BEST_KNOWN = 12;

/** A name and its articles (canon first), with the more-linked one's link count. */
export interface Known {
  readonly name: string;
  readonly entries: readonly Entry[];
  readonly links: number;
}

/**
 * A section's best-known subjects: the most-linked articles, one row per subject, so a canon
 * article and its Legends twin count once (Palpatine and Darth Sidious too). The row takes the
 * canon article's name.
 */
export function bestKnown(
  archive: Archive,
  links: LinkGraph,
  section: Section,
  count = BEST_KNOWN,
): Known[] {
  const byName = new Map<string, { entries: Entry[]; links: number }>();
  for (const entry of archive.bySection.get(section) ?? []) {
    const twin = entry.twin === undefined ? undefined : archive.byTitle.get(entry.twin);
    const canon = entry.era === 'canon' || twin === undefined ? entry : twin;
    const name = displayTitle(canon.title);
    const known = byName.get(name) ?? { entries: [], links: 0 };
    known.entries.push(entry);
    known.links = Math.max(known.links, links.counts.get(entry.title) ?? 0);
    byName.set(name, known);
  }
  return [...byName]
    .filter(([, k]) => k.links > 0)
    .sort(([a, x], [b, y]) => y.links - x.links || (a < b ? -1 : 1))
    .slice(0, count)
    .map(([name, k]) => ({
      name,
      links: k.links,
      entries: k.entries.sort((a, b) => (a.era === b.era ? 0 : a.era === 'canon' ? -1 : 1)),
    }));
}

export const homeBody = (archive: Archive, links: LinkGraph) => {
  const best = bestKnown(archive, links, 'characters');
  return html`
    <h1>${SITE_NAME}</h1>
    <p>${TEXT.homeIntro(archive.byTitle.size)}</p>
    <search>
      <form action=${exploreMeta.path} method="get">
        <label for="home-ask">${TEXT.homeAskLabel}</label>
        <input
          id="home-ask"
          name="ask"
          type="search"
          autocomplete="off"
          placeholder=${TEXT.homeAskPlaceholder}
        />
        <button type="submit">${EXPLORE_TEXT.nav}</button>
      </form>
    </search>
    ${
      best.length === 0
        ? nothing
        : html`<section aria-labelledby="best-known">
            <h2 id="best-known">${TEXT.bestKnownCharacters}</h2>
            <ol>
              ${best.map(
                (known) =>
                  html`<li>
                    <a href=${known.entries[0]?.path ?? '/'}>${known.name}</a>
                    <small
                      >${known.entries
                        .map((e) => (e.era === 'legends' ? TEXT.legends : TEXT.canon))
                        .join(' · ')}</small
                    >
                  </li>`,
              )}
            </ol>
          </section>`
    }
    <section aria-labelledby="home-sections">
      <h2 id="home-sections">${TEXT.primaryNav}</h2>
      <ul>
        ${SECTIONS.map((section) => {
          const count = archive.bySection.get(section)?.length ?? 0;
          return html`<li>
            <a href=${sectionPath(section)}>${SECTION_LABELS[section].plural}</a>
            <data value=${String(count)}>${count.toLocaleString('en-US')}</data>
            <p>${SECTION_LABELS[section].blurb}</p>
          </li>`;
        })}
      </ul>
    </section>
  `;
};
