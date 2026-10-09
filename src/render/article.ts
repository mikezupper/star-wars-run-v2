// A Wookieepedia article's page (ADR 0008; the look, ADR 0004): a title block with its kind,
// its era and how many articles link to it; its lead paragraphs and the CC BY-SA credit; its
// facts as a description list; its Appearances (the works it appears in or, for a work, who and
// what appears in it); and the best-known articles that link to it. Links go to the archive's
// own pages; a link to an article this build doesn't have (the sample build) is plain text.
import { html, nothing } from '@gyral/core';
import type { Appearance, ArticleRecord, Field, Rich } from '../domain/article.js';
import {
  displayTitle,
  letterPath,
  sectionPath,
  type Archive,
  type Entry,
} from '../domain/archive.js';
import type { LinkGraph } from '../domain/links.js';
import { SECTIONS } from '../domain/sections.js';
import {
  articleDescription,
  fieldLabel,
  kindLabel,
  MARKER_LABELS,
  SECTION_LABELS,
  TEXT,
} from '../labels.js';
import { creditLine } from './credit.js';
import { breadcrumb, type PageMeta } from './layout.js';

/** Rich text as HTML: each link to a page in the archive, or plain text when it has none. */
export const rich = (runs: Rich, archive: Archive) =>
  runs.map((run) => {
    const path = 'link' in run ? archive.pathOf(run.link) : undefined;
    return path === undefined ? run.text : html`<a href=${path}>${run.text}</a>`;
  });

export const articleMeta = (entry: Entry): PageMeta => ({
  path: entry.path,
  title: `${displayTitle(entry.title)}${entry.era === 'legends' ? ` (${TEXT.legends})` : ''}`,
  description: articleDescription(
    displayTitle(entry.title),
    entry.section,
    entry.era === 'legends',
  ),
  section: entry.section,
  searchKind: entry.section,
});

/** Lists up to this long start open; longer ones (Luke has 700 works) start closed. */
const OPEN_UP_TO = 20;

const disclosure = (count: number, summary: string, body: unknown) =>
  count <= OPEN_UP_TO
    ? html`<details open>
        <summary>${summary}</summary>
        ${body}
      </details>`
    : html`<details>
        <summary>${summary}</summary>
        ${body}
      </details>`;

const markerNote = (markers: readonly string[]) => {
  const notes = markers.map((m) => MARKER_LABELS[m]).filter((n) => n !== undefined);
  return notes.length === 0 ? nothing : html` <small>(${notes.join(', ')})</small>`;
};

const linked = (text: string, link: string | undefined, archive: Archive) => {
  const path = link === undefined ? undefined : archive.pathOf(link);
  return path === undefined ? text : html`<a href=${path}>${text}</a>`;
};

const works = (list: readonly Appearance[], archive: Archive) =>
  html`<ol>
    ${list.map(
      (a) => html`<li><cite>${linked(a.text, a.link, archive)}</cite>${markerNote(a.markers)}</li>`,
    )}
  </ol>`;

/** The works the subject appears in: canon (or Legends) first, then non-canon ones. */
function appearancesSection(list: readonly Appearance[], archive: Archive) {
  if (list.length === 0) return nothing;
  const main = list.filter((a) => a.noncanon !== true);
  const noncanon = list.filter((a) => a.noncanon === true);
  return html`<section aria-labelledby="appearances" data-pagefind-ignore>
    <h2 id="appearances">${TEXT.appearances}</h2>
    ${main.length === 0 ? nothing : disclosure(main.length, TEXT.appearanceCount(main.length), works(main, archive))}
    ${
      noncanon.length === 0
        ? nothing
        : disclosure(
            noncanon.length,
            `${TEXT.noncanonAppearances}: ${noncanon.length.toLocaleString('en-US')}`,
            works(noncanon, archive),
          )
    }
  </section>`;
}

/** Who and what appears in a work, grouped by section; names without a page come last. */
function castSection(list: readonly Appearance[], archive: Archive) {
  const main = list.filter((a) => a.noncanon !== true);
  if (main.length === 0) return nothing;
  const sectionOf = (a: Appearance) =>
    a.link === undefined ? undefined : archive.byTitle.get(a.link)?.section;
  const groups = [
    ...SECTIONS.map((section) => ({
      label: SECTION_LABELS[section].plural,
      items: main.filter((a) => sectionOf(a) === section),
    })),
    { label: TEXT.notInArchive, items: main.filter((a) => sectionOf(a) === undefined) },
  ].filter((g) => g.items.length > 0);
  return html`<section aria-labelledby="cast" data-pagefind-ignore>
    <h2 id="cast">${TEXT.cast}</h2>
    ${groups.map(({ label, items }) =>
      disclosure(
        items.length,
        TEXT.castCount(items.length, label),
        html`<ul>
          ${items.map(
            (a) => html`<li>${linked(a.text, a.link, archive)}${markerNote(a.markers)}</li>`,
          )}
        </ul>`,
      ),
    )}
  </section>`;
}

/** The same subject in the other continuity, when the archive has both (Entry.twin). */
const counterpart = (entry: Entry, archive: Archive): Entry | undefined =>
  entry.twin === undefined ? undefined : archive.byTitle.get(entry.twin);

const plain = (runs: Rich) => runs.map((run) => run.text).join('');

/**
 * On a phone, the first few facts sit right under the title (the full list follows the lead).
 * A visual summary only: hidden from assistive tech, which reads the full list, and without
 * links, so nothing hidden can take focus. CSS shows it on narrow screens.
 */
const KEY_FACTS = 4;
const keyFacts = (facts: readonly Field[]) =>
  facts.length === 0
    ? nothing
    : html`<dl aria-hidden="true" data-pagefind-ignore>
        ${facts.slice(0, KEY_FACTS).map(
          (f) =>
            html`<div>
              <dt>${fieldLabel(f.name)}</dt>
              <dd>${f.items.map(plain).join(', ')}</dd>
            </div>`,
        )}
      </dl>`;

/** The best-known articles that link to this one. */
function linkedFromSection(entry: Entry, links: LinkGraph, archive: Archive) {
  const linkers = (links.linkedFrom.get(entry.title) ?? []).flatMap((title) => {
    const linker = archive.byTitle.get(title);
    return linker === undefined ? [] : [linker];
  });
  if (linkers.length === 0) return nothing;
  return html`<section aria-labelledby="linked-from" data-pagefind-ignore>
    <h2 id="linked-from">${TEXT.linkedFrom}</h2>
    <p>${TEXT.linkedFromNote(displayTitle(entry.title))}</p>
    <ul>
      ${linkers.map((l) => html`<li><a href=${l.path}>${displayTitle(l.title)}</a></li>`)}
    </ul>
  </section>`;
}

export function articleBody(
  entry: Entry,
  record: ArticleRecord,
  archive: Archive,
  links: LinkGraph,
) {
  const facts = record.fields.filter((f) => f.items.length > 0);
  const other = counterpart(entry, archive);
  const linkedFrom = links.counts.get(entry.title) ?? 0;
  return html`
    ${breadcrumb(
      [
        { href: '/', label: TEXT.home },
        { href: sectionPath(entry.section), label: SECTION_LABELS[entry.section].plural },
        {
          href: letterPath(entry.section, entry.letter),
          label: entry.letter === '0' ? '0–9' : entry.letter.toUpperCase(),
        },
      ],
      displayTitle(entry.title),
    )}
    <article>
      <header>
        <p data-pagefind-ignore>${kindLabel(record.kind, entry.section)}</p>
        <h1 data-pagefind-weight="10">${displayTitle(entry.title)}</h1>
        <p data-pagefind-ignore>
          <span data-era=${entry.era}>${entry.era === 'legends' ? TEXT.legends : TEXT.canon}</span>
          ${
            other === undefined
              ? nothing
              : html`<a href=${other.path} data-era=${other.era}
                  >${other.era === 'legends' ? TEXT.legendsVersion : TEXT.canonVersion}</a
                >`
          }
          ${linkedFrom === 0 ? nothing : html`<span>${TEXT.linkedFromCount(linkedFrom)}</span>`}
        </p>
        ${
          entry.era === 'legends'
            ? html`<p data-pagefind-ignore>
                <strong>${TEXT.legends}.</strong> ${TEXT.legendsNote}
              </p>`
            : nothing
        }
      </header>
      ${keyFacts(facts)}
      <div>
        ${record.lead.map((p) => html`<p>${rich(p, archive)}</p>`)} ${creditLine(entry.title)}
      </div>
      ${
        facts.length === 0
          ? nothing
          : html`<section aria-labelledby="facts">
              <h2 id="facts" data-pagefind-ignore>${TEXT.facts}</h2>
              <dl data-pagefind-weight="0.5">
                ${facts.map(
                  (f) =>
                    html`<dt>${fieldLabel(f.name)}</dt>
                      ${f.items.map((item) => html`<dd>${rich(item, archive)}</dd>`)}`,
                )}
              </dl>
            </section>`
      }
      ${
        entry.section === 'media'
          ? castSection(record.appearances ?? [], archive)
          : appearancesSection(record.appearances ?? [], archive)
      }
      ${linkedFromSection(entry, links, archive)}
    </article>
  `;
}
