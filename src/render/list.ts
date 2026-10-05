// A section's list page, `/people/`: every record of one kind, each linking to its page.
// Films keep release order (an ordered list); everything else is alphabetical.
import { serverHtml } from '@gyral/ssr';
import { kindPath, recordPath } from '../domain/paths.js';
import type { AnyRecord, Dataset, Kind } from '../domain/records.js';
import { KIND_BLURBS, listDescription, listTitle, TEXT } from '../labels.js';
import { breadcrumb, type PageMeta } from './layout.js';
import { recordName } from './record.js';

export const listMeta = (kind: Kind, data: Dataset): PageMeta => ({
  path: kindPath(kind),
  title: listTitle(kind),
  description: listDescription(kind, data[kind].length),
  section: kind,
});

const byName = (a: AnyRecord, b: AnyRecord) => a.name.localeCompare(b.name, 'en');

export function listBody(kind: Kind, data: Dataset) {
  const records: readonly AnyRecord[] = data[kind];
  const items = (kind === 'films' ? records : [...records].sort(byName)).map(
    (r) => serverHtml`<li><a href=${recordPath(kind, r.slug)}>${recordName(r)}</a></li>`,
  );
  return serverHtml`
    ${breadcrumb([{ href: '/', label: TEXT.home }], listTitle(kind))}
    <h1>${listTitle(kind)}</h1>
    <p>${KIND_BLURBS[kind]}</p>
    ${kind === 'films' ? serverHtml`<ol>${items}</ol>` : serverHtml`<ul>${items}</ul>`}
  `;
}
