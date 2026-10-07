// What the /explore/ island shows besides its own markup: the results table, the status line
// of a SQL run, and the styles (swr-7f1.7, swr-ei6). Pure view helpers, shared by the SQL editor
// and Ask the archive.
import { css, html } from '@gyral/core';
import { EXPLORE_TEXT } from '../labels.js';
import type { QueryResult } from './duckdb.js';

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
export function table(r: QueryResult, readable = false) {
  const pathAt = r.columns.indexOf('path');
  const nameAt = r.columns.indexOf('name');
  const shown = r.columns.map((c, n) => [c, n] as const).filter(([, n]) => n !== pathAt);
  return html`<div class="table" role="region" aria-label=${EXPLORE_TEXT.results} tabindex="0">
    <table>
      <thead>
        <tr>
          ${shown.map(([c]) => html`<th scope="col">${readable ? columnLabel(c) : c}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${r.rows.map(
          (row) =>
            html`<tr>
              ${shown.map(([, n]) => {
                const raw = row[n] ?? null;
                const value =
                  readable && r.columns[n] === 'era' && typeof raw === 'string'
                    ? (ERAS[raw] ?? raw)
                    : raw;
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
