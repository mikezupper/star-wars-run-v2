// The Explore page's tables (swr-7f1.7): the archive as rows, written to Parquet at build time
// and queried in the browser with DuckDB-WASM.
// - `archive`: one row per article: what it is, where its page is, and its numbers.
// - `facts`: one row per infobox value: the field, its text, and the article it links to.
import type { ArticleRecord } from './article.js';
import { displayTitle, type Archive } from './archive.js';
import { QUANTITY_FIELDS, quantities } from './quantities.js';

/** The numeric columns, in a fixed order (every row has all of them, null when unknown). */
export const NUMBER_COLUMNS = [...new Set(Object.values(QUANTITY_FIELDS).map((f) => f.key))].sort();

export type ArchiveRow = Readonly<Record<string, string | number | null>> & {
  readonly title: string;
  readonly name: string;
  readonly path: string;
  readonly section: string;
  readonly kind: string | null;
  readonly era: string;
};

export interface FactRow {
  readonly title: string;
  readonly field: string;
  /** 0 for the first item of a listed field. */
  readonly item: number;
  readonly text: string;
  /** The first article the value links to, if any (`Tatooine` for a homeworld). */
  readonly link: string | null;
}

/** Rows for every article the archive has a page for, in title order. */
export function exploreRows(
  archive: Archive,
  articles: ReadonlyMap<string, ArticleRecord>,
): { readonly archive: ArchiveRow[]; readonly facts: FactRow[] } {
  const archiveRows: ArchiveRow[] = [];
  const facts: FactRow[] = [];
  const titles = [...archive.byTitle.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const title of titles) {
    const entry = archive.byTitle.get(title);
    const record = articles.get(title);
    if (entry === undefined || record === undefined) continue;
    const numbers = quantities(record);
    archiveRows.push({
      title,
      name: displayTitle(title),
      path: entry.path,
      section: entry.section,
      kind: record.kind ?? null,
      era: record.era,
      ...Object.fromEntries(NUMBER_COLUMNS.map((c) => [c, numbers[c]?.value ?? null])),
    });
    for (const field of record.fields) {
      field.items.forEach((item, i) => {
        const link = item.find((r) => 'link' in r);
        facts.push({
          title,
          field: field.name,
          item: i,
          text: item.map((r) => r.text).join(''),
          link: link !== undefined && 'link' in link ? link.link : null,
        });
      });
    }
  }
  return { archive: archiveRows, facts };
}
