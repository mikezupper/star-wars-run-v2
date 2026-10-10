// What the /explore/ island shows besides its own markup: the results table, the status line
// of a SQL run, and the styles (swr-7f1.7, swr-ei6). Pure view helpers, shared by the SQL editor
// and Ask the archive.
import { css, html, nothing } from '@gyral/core';
import { EXPLORE_TEXT } from '../labels.js';
import { mergeEras, type QueryResult } from '../domain/query.js';
export { mergeEras } from '../domain/query.js';

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
      grid-template-columns: minmax(0, 1fr);
      gap: 1.25rem;
      min-inline-size: 0;
    }
    *,
    *::before,
    *::after {
      box-sizing: border-box;
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
      grid-template-columns: minmax(0, 1fr);
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
      overflow-wrap: anywhere;
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
      grid-template-columns: minmax(0, 1fr);
      gap: 1rem;
      min-inline-size: 0;
    }
    .answer {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.75rem;
      min-inline-size: 0;
      padding: 1rem;
      border-inline-start: 3px solid var(--link, LinkText);
      background: var(--surface-raised, transparent);
    }
    .answer > * {
      min-inline-size: 0;
    }
    .answer h3 {
      margin: 0;
      color: var(--text, inherit);
      font-size: var(--step-1, 1.15rem);
    }
    #ask-status {
      color: var(--text, inherit);
      font-weight: 700;
    }
    [hidden] {
      display: none;
    }
    button[aria-disabled='true'] {
      cursor: progress;
    }
    .ask button[type='submit'] {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-inline-size: 8rem;
    }
    .spinner {
      inline-size: 1em;
      block-size: 1em;
      border: 2px solid currentColor;
      border-inline-end-color: transparent;
      border-radius: 50%;
    }
    @media (prefers-reduced-motion: no-preference) {
      .spinner {
        animation: spin 900ms linear infinite;
      }
    }
    @keyframes spin {
      to {
        transform: rotate(1turn);
      }
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
      color: var(--text-muted, inherit);
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
