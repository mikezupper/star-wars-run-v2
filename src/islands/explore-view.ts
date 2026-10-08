// What the /explore/ island shows besides its own markup: the results table, the status line
// of a SQL run, and the styles (swr-7f1.7, swr-ei6). Pure view helpers, shared by the SQL editor
// and Ask the archive.
import { css, html, nothing } from '@gyral/core';
import { EXPLORE_TEXT } from '../labels.js';
import type { QueryResult, Value } from '../domain/query.js';

/** Where a SQL run is. */
export type Result =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Running'; readonly first: boolean }
  | { readonly _tag: 'Done'; readonly result: QueryResult }
  | { readonly _tag: 'Failed'; readonly reason: string };

export function statusText(r: Result): string {
  switch (r._tag) {
    case 'Idle':
      return EXPLORE_TEXT.runHint;
    case 'Running':
      return r.first ? EXPLORE_TEXT.starting : EXPLORE_TEXT.running;
    case 'Failed':
      return EXPLORE_TEXT.failed(r.reason);
    case 'Done':
      return EXPLORE_TEXT.rows(r.result.rows.length, r.result.ms, r.result.truncated);
  }
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const cell = (v: string | number | boolean | null) =>
  v === null ? '—' : typeof v === 'number' ? numberFormat.format(v) : String(v);

const UNITS: Readonly<Record<string, string>> = {
  m: 'm',
  kg: 'kg',
  km: 'km',
  kph: 'km/h',
  hours: 'hours',
  days: 'days',
  credits: 'credits',
};

/** A column name for readers: `height_m` → "Height (m)", `era` → "Era". */
export const columnLabel = (column: string): string => {
  const parts = column.split('_');
  const unit = parts.length > 1 ? UNITS[parts.at(-1) ?? ''] : undefined;
  const words = (unit === undefined ? parts : parts.slice(0, -1)).join(' ');
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return unit === undefined ? label : `${label} (${unit})`;
};

const ERAS: Readonly<Record<string, string>> = { canon: 'Canon', legends: 'Legends' };

/**
 * The results; `name` links to `path` when both are columns, and `path` itself is hidden.
 * `readable` (Ask the archive) labels columns for readers instead of showing their SQL names.
 */

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
 * Without an era column, rows pass through as they are.
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

/** Ask's results: one row per name, labelled for readers, with Canon and Legends badges. */
function readableTable(r: QueryResult) {
  const { columns, rows } = mergeEras(r);
  const nameAt = columns.indexOf('name');
  const hasEras = r.columns.includes('era');
  return html`<div class="table" role="region" aria-label=${EXPLORE_TEXT.results} tabindex="0">
    <table>
      <thead>
        <tr>
          ${columns.map((c) => html`<th scope="col">${columnLabel(c)}</th>`)}
          ${hasEras ? html`<th scope="col">${columnLabel('era')}</th>` : nothing}
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (row) =>
            html`<tr>
              ${row.cells.map((value, n) =>
                n === nameAt && row.path !== null
                  ? html`<td><a href=${row.path}>${cell(value)}</a></td>`
                  : html`<td>${cell(value)}</td>`,
              )}
              ${
                hasEras
                  ? html`<td class="eras">
                      ${row.eras.map((e) =>
                        e.path === null
                          ? html`<span class="badge">${ERAS[e.era] ?? e.era}</span>`
                          : html`<a class="badge" href=${e.path}>${ERAS[e.era] ?? e.era}</a>`,
                      )}
                    </td>`
                  : nothing
              }
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

/**
 * The results; `name` links to `path` when both are columns, and `path` itself is hidden.
 * `readable` (Ask the archive) labels columns for readers and folds canon and Legends together.
 */
export function table(r: QueryResult, readable = false) {
  if (readable) return readableTable(r);
  const pathAt = r.columns.indexOf('path');
  const nameAt = r.columns.indexOf('name');
  const shown = r.columns
    .map((c, n) => [c, n] as const)
    .filter(([c, n]) => n !== pathAt && !(r.extra ?? []).includes(c));
  return html`<div class="table" role="region" aria-label=${EXPLORE_TEXT.results} tabindex="0">
    <table>
      <thead>
        <tr>
          ${shown.map(([c]) => html`<th scope="col">${c}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${r.rows.map(
          (row) =>
            html`<tr>
              ${shown.map(([, n]) => {
                const value = row[n] ?? null;
                const path = pathAt >= 0 ? row[pathAt] : null;
                return n === nameAt && typeof path === 'string'
                  ? html`<td><a href=${path}>${cell(value)}</a></td>`
                  : html`<td>${cell(value)}</td>`;
              })}
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

export const styles = css`
  @layer component {
    :host {
      display: grid;
      gap: 1.25rem;
    }
    ul {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    h2 {
      font-size: var(--step--1, 0.9rem);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted, inherit);
      margin: 0 0 0.5rem;
    }
    button {
      font: inherit;
      min-block-size: 2.75rem;
      padding: 0.4rem 0.9rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 999px;
      background: var(--surface-raised, transparent);
      color: var(--text, inherit);
      cursor: pointer;
    }
    button[type='submit'] {
      border: 0;
      border-radius: var(--radius, 0.75rem);
      background: var(--accent, Highlight);
      color: var(--surface, Canvas);
      font-weight: 700;
    }
    form {
      display: grid;
      gap: 0.5rem;
    }
    label {
      font-weight: 700;
    }
    textarea {
      font:
        0.95rem/1.5 ui-monospace,
        monospace;
      padding: 0.75rem;
      border: 1px solid var(--border, currentColor);
      border-radius: var(--radius, 0.75rem);
      background: var(--surface-raised, transparent);
      color: var(--text, inherit);
      inline-size: 100%;
      min-inline-size: 0;
    }
    p {
      margin: 0;
      color: var(--text-muted, inherit);
    }
    :focus-visible {
      outline: 3px solid var(--focus, Highlight);
      outline-offset: 3px;
    }
    .table {
      overflow-x: auto;
    }
    table {
      border-collapse: collapse;
      inline-size: 100%;
      font-variant-numeric: tabular-nums;
    }
    th,
    td {
      text-align: start;
      padding: 0.4rem 0.75rem;
      border-block-end: 1px solid var(--border, currentColor);
    }
    th {
      color: var(--text-muted, inherit);
      font-weight: 600;
    }
    a {
      color: var(--link, LinkText);
    }
  }

  @layer component {
    .ask {
      display: grid;
      gap: 1rem;
    }
    .eras {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .badge {
      display: inline-block;
      padding: 0.1rem 0.55rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 999px;
      font-size: 0.85em;
      text-decoration: none;
      color: var(--text, inherit);
    }
    a.badge:hover {
      border-color: var(--link, LinkText);
      color: var(--link, LinkText);
    }
    .ask form > div {
      display: flex;
      gap: 0.5rem;
    }
    .ask input {
      flex: 1;
      min-inline-size: 0;
      font: inherit;
      padding: 0.6rem 0.9rem;
      border: 1px solid var(--border, currentColor);
      border-radius: var(--radius, 0.75rem);
      background: var(--surface-raised, transparent);
      color: var(--text, inherit);
    }
    .examples {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    .steps {
      display: grid;
      gap: 0.25rem;
      margin: 0;
      padding-inline-start: 1.25rem;
      color: var(--text-muted, inherit);
    }
    .summary {
      color: var(--text, inherit);
      font-size: var(--step-1, 1.15rem);
      line-height: 1.45;
    }
    pre {
      overflow-x: auto;
      padding: 0.75rem;
      border-radius: var(--radius, 0.75rem);
      background: var(--surface-raised, transparent);
      white-space: pre-wrap;
    }
    details > summary {
      cursor: pointer;
      font-weight: 700;
    }
    details[open] > summary {
      margin-block-end: 0.75rem;
    }
  }
`;
