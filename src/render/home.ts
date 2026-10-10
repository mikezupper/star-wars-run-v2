// The home page (ADR 0004, "The look"): what the archive is, a question box as the way in, the
// best-known articles, and a card for each section.
import { html, nothing } from '@gyral/core';
import { sectionPath, type Archive } from '../domain/archive.js';
import { bestKnown } from '../domain/known.js';
import type { LinkGraph } from '../domain/links.js';
import { SECTIONS } from '../domain/sections.js';
import { DESCRIPTION, SITE_NAME } from '../site.js';
import { EXPLORE_TEXT, SECTION_LABELS, TEXT } from '../labels.js';
import { exploreMeta } from './explore.js';
import { RANDOM_PATH } from './site.js';
import type { PageMeta } from './layout.js';

export const homeMeta: PageMeta = {
  path: '/',
  title: SITE_NAME,
  description: DESCRIPTION,
};

/** How many best-known characters the home page lists. */
export const BEST_KNOWN = 12;

export const homeBody = (archive: Archive, links: LinkGraph) => {
  const best = bestKnown(archive, links, 'characters', BEST_KNOWN);
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
    <div class="hyperspace-jump">
      <p><a href=${RANDOM_PATH}>${TEXT.randomArticle}</a></p>
      <div class="hyperspace-setting" data-hyperspace-setting hidden>
        <label>
          <input type="checkbox" data-hyperspace-toggle checked />
          ${TEXT.hyperspaceAnimation}
        </label>
        <small id="hyperspace-note" hidden>${TEXT.hyperspaceReducedMotion}</small>
      </div>
    </div>
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
