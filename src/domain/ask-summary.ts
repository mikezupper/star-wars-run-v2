// The summary and the table share twin grouping. Lists expose only three examples; scalar
// and aggregate answers keep their actual values rather than treating a row count as an answer.
import { mergeEras, plainValue, type QueryResult } from './query.js';

export function summaryInformation(
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  truncated: boolean,
) {
  const result: QueryResult = {
    columns,
    rows: rows.map((r) => r.map(plainValue)),
    truncated,
    ms: 0,
  };
  const grouped = mergeEras(result);
  if (grouped.columns.includes('name') || grouped.columns.includes('title')) {
    return {
      kind: 'subjects',
      count: grouped.rows.length,
      countIsLowerBound: truncated,
      examples: grouped.rows.slice(0, 3).map((row) => ({
        ...Object.fromEntries(grouped.columns.map((column, n) => [column, row.cells[n]])),
        ...(row.eras.length === 0
          ? {}
          : { continuities: [...new Set(row.eras.map((e) => e.era))] }),
      })),
    };
  }
  const keep = columns
    .map((column, n) => [column, n] as const)
    .filter(([c]) => c !== 'path' && c !== 'pair');
  return {
    kind: 'values',
    truncated,
    values: result.rows.map((row) => Object.fromEntries(keep.map(([c, n]) => [c, row[n]]))),
  };
}
