// A query's answer, as the API sends it and the Explore page shows it (ADR 0010): column names
// and rows of plain JSON values. Pure, shared by the server and the browser.

export type Value = string | number | boolean | null;

export interface QueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly Value[])[];
  /** True when there were more rows than the cap. */
  readonly truncated: boolean;
  readonly ms: number;
  /** Columns the server added that the query didn't ask for (`pair`); not shown as columns. */
  readonly extra?: readonly string[];
}

/** The SQL editor shows at most this many rows. */
export const MAX_QUERY_ROWS = 500;

/** Plain JSON values: DuckDB returns counts as BigInt and dates and lists as objects. */
export const plainValue = (v: unknown): Value => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return JSON.stringify(v, (_key, x: unknown) => (typeof x === 'bigint' ? Number(x) : x));
};

/** One row of Ask's table: its cells (no path, no era), where its name links, and its eras. */
export interface MergedRow {
  readonly cells: readonly Value[];
  readonly path: string | null;
  readonly eras: readonly { readonly era: string; readonly path: string | null }[];
}

/**
 * Ask's rows with canon and Legends folded together (swr-ca3.1): rows equal in everything but
 * era and path become one, whose name links to the canon page, with a badge per era linking
 * to each. Rows that differ (heights that disagree, say) stay apart, each with its own badge.
 * Identical cells are grouped even without an era column.
 */
export function mergeEras(r: QueryResult): {
  readonly columns: readonly string[];
  readonly rows: readonly MergedRow[];
} {
  const pathAt = r.columns.indexOf('path');
  const eraAt = r.columns.indexOf('era');
  // `pair` (the subject's canon path, swr-cd6) joins twins whose names differ: Darth Sidious
  // and Palpatine. Their names don't count toward "equal in everything", and the row shows the
  // canon name.
  const pairAt = r.columns.indexOf('pair');
  const nameAt = r.columns.indexOf('name');
  const keep = r.columns
    .map((_, n) => n)
    .filter((n) => n !== pathAt && n !== eraAt && n !== pairAt);
  const columns = keep.map((n) => r.columns[n] ?? '');
  const pathOf = (row: readonly Value[]) => {
    const p = pathAt >= 0 ? row[pathAt] : null;
    return typeof p === 'string' ? p : null;
  };
  const groups = new Map<
    string,
    { cells: Value[]; eras: { era: string; path: string | null }[] }
  >();
  for (const row of r.rows) {
    const cells = keep.map((n) => row[n] ?? null);
    const era = eraAt >= 0 ? row[eraAt] : null;
    const pair = pairAt >= 0 ? row[pairAt] : null;
    const key =
      typeof pair === 'string'
        ? JSON.stringify([pair, ...keep.map((n, i) => (n === nameAt ? null : cells[i]))])
        : JSON.stringify(cells);
    const group = groups.get(key) ?? { cells, eras: [] };
    if (era === 'canon') group.cells = cells;
    if (typeof era === 'string') group.eras.push({ era, path: pathOf(row) });
    else if (group.eras.length === 0) group.eras.push({ era: '', path: pathOf(row) });
    groups.set(key, group);
  }
  const rows = [...groups.values()].map(({ cells, eras }) => {
    const ordered = [...eras].sort((a, b) => (a.era === 'canon' ? -1 : b.era === 'canon' ? 1 : 0));
    return { cells, path: ordered[0]?.path ?? null, eras: ordered.filter((e) => e.era !== '') };
  });
  return { columns, rows };
}
