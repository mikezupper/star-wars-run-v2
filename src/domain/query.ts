// A query's answer, as the API sends it and the Explore page shows it (ADR 0010): column names
// and rows of plain JSON values. Pure, shared by the server and the browser.

export type Value = string | number | boolean | null;

export interface QueryResult {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly Value[])[];
  /** True when there were more rows than the cap. */
  readonly truncated: boolean;
  readonly ms: number;
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
