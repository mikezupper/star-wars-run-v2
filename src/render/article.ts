// A Wookieepedia article's page (ADR 0008): its facts as a description list, its lead
// paragraphs, and the CC BY-SA credit. Links go to the archive's own pages; a link to an
// article this build doesn't have (the gate's sample build) is plain text.
import { nothing } from 'lit';
import { serverHtml } from '@gyral/ssr';
import type { ArticleRecord, Rich } from '../domain/article.js';
import {
  displayTitle,
  letterPath,
  sectionPath,
  type Archive,
  type Entry,
} from '../domain/archive.js';
import { articleDescription, fieldLabel, SECTION_LABELS, TEXT } from '../labels.js';
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
    </article>
  `;
}
