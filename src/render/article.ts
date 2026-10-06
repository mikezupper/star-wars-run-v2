// A Wookieepedia article's page (ADR 0008): its facts as a description list, its lead
// paragraphs, the CC BY-SA credit, and its Appearances: the works it appears in or, for a work,
// who and what appears in it. Links go to the archive's own pages; a link to an article this
// build doesn't have (the gate's sample build) is plain text.
import { nothing } from 'lit';
import { serverHtml } from '@gyral/ssr';
import type { Appearance, ArticleRecord, Rich } from '../domain/article.js';
import {
  displayTitle,
  letterPath,
  sectionPath,
  type Archive,
  type Entry,
} from '../domain/archive.js';
import { SECTIONS } from '../domain/sections.js';
import { articleDescription, fieldLabel, MARKER_LABELS, SECTION_LABELS, TEXT } from '../labels.js';
import { creditLine } from './credit.js';
import { breadcrumb, type PageMeta } from './layout.js';

/** Rich text as HTML: each link to a page in the archive, or plain text when it has none. */
export const rich = (runs: Rich, archive: Archive) =>
  runs.map((run) => {
    const path = 'link' in run ? archive.pathOf(run.link) : undefined;
    return path === undefined ? run.text : serverHtml`<a href=${path}>${run.text}</a>`;
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
    ? serverHtml`<details open><summary>${summary}</summary>${body}</details>`
    : serverHtml`<details><summary>${summary}</summary>${body}</details>`;

const markerNote = (markers: readonly string[]) => {
  const notes = markers.map((m) => MARKER_LABELS[m]).filter((n) => n !== undefined);
  return notes.length === 0 ? nothing : serverHtml` <small>(${notes.join(', ')})</small>`;
};

const linked = (text: string, link: string | undefined, archive: Archive) => {
  const path = link === undefined ? undefined : archive.pathOf(link);
  return path === undefined ? text : serverHtml`<a href=${path}>${text}</a>`;
};

const works = (list: readonly Appearance[], archive: Archive) => serverHtml`<ol>
  ${list.map(
    (a) =>
      serverHtml`<li><cite>${linked(a.text, a.link, archive)}</cite>${markerNote(a.markers)}</li>`,
  )}
</ol>`;

/** The works the subject appears in: canon (or Legends) first, then non-canon ones. */
function appearancesSection(list: readonly Appearance[], archive: Archive) {
  if (list.length === 0) return nothing;
  const main = list.filter((a) => a.noncanon !== true);
  const noncanon = list.filter((a) => a.noncanon === true);
  return serverHtml`<section aria-labelledby="appearances" data-pagefind-ignore>
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
  return serverHtml`<section aria-labelledby="cast" data-pagefind-ignore>
    <h2 id="cast">${TEXT.cast}</h2>
    ${groups.map(({ label, items }) =>
      disclosure(
        items.length,
        TEXT.castCount(items.length, label),
        serverHtml`<ul>
          ${items.map(
            (a) => serverHtml`<li>${linked(a.text, a.link, archive)}${markerNote(a.markers)}</li>`,
          )}
        </ul>`,
      ),
    )}
  </section>`;
}

export function articleBody(entry: Entry, record: ArticleRecord, archive: Archive) {
  const facts = record.fields.filter((f) => f.items.length > 0);
  return serverHtml`
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
      <h1 data-pagefind-weight="10">${displayTitle(entry.title)}</h1>
      ${
        entry.era === 'legends'
          ? serverHtml`<p data-pagefind-ignore><strong>${TEXT.legends}.</strong> ${TEXT.legendsNote}</p>`
          : nothing
      }
      <div>
        ${record.lead.map((p) => serverHtml`<p>${rich(p, archive)}</p>`)}
        ${creditLine(entry.title)}
      </div>
      ${
        facts.length === 0
          ? nothing
          : serverHtml`<section aria-labelledby="facts">
              <h2 id="facts" data-pagefind-ignore>${TEXT.facts}</h2>
              <dl data-pagefind-weight="0.5">
                ${facts.map(
                  (f) => serverHtml`<dt>${fieldLabel(f.name)}</dt>
                    ${f.items.map((item) => serverHtml`<dd>${rich(item, archive)}</dd>`)}`,
                )}
              </dl>
            </section>`
      }
      ${
        entry.section === 'media'
          ? castSection(record.appearances ?? [], archive)
          : appearancesSection(record.appearances ?? [], archive)
      }
    </article>
  `;
}
