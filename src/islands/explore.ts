// The /explore/ page's island (swr-7f1.7): SQL over the archive in the browser. Server-rendered as
// the no-JavaScript fallback (links to each section), then enhanced on `Hydrated`: pick a
// question or write SQL, run it with the button or Ctrl+Enter, and read the results; a `name`
// column links to its page when the row has a `path`.
import { css, define, html, nothing, type Command } from '@gyral/core';
import { sectionPath } from '../domain/archive.js';
import { SECTIONS } from '../domain/sections.js';
import { EXPLORE_TEXT, SECTION_LABELS } from '../labels.js';
import { runQuery, type QueryResult } from './duckdb.js';

export type Msg =
  | { readonly _tag: 'Typed'; readonly sql: string }
  | { readonly _tag: 'Run' }
  | { readonly _tag: 'Preset'; readonly index: number }
  | { readonly _tag: 'Done'; readonly sql: string; readonly result: QueryResult }
  | { readonly _tag: 'Failed'; readonly sql: string; readonly reason: string };

export type Result =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Running'; readonly first: boolean }
  | { readonly _tag: 'Done'; readonly result: QueryResult }
  | { readonly _tag: 'Failed'; readonly reason: string };

export type State =
  | { readonly _tag: 'Static' }
  | {
      readonly _tag: 'Live';
      readonly sql: string;
      readonly result: Result;
      /** False until a query has run: the first one also starts the engine. */
      readonly started: boolean;
    };

const FIRST_SQL = EXPLORE_TEXT.presets[0].sql;

const run = (s: Extract<State, { _tag: 'Live' }>): [State, Command<Msg>[]] => {
  const sql = s.sql;
  return [
    { ...s, result: { _tag: 'Running', first: !s.started }, started: true },
    [
      runQuery(
        sql,
        (result): Msg => ({ _tag: 'Done', sql, result }),
        (reason): Msg => ({ _tag: 'Failed', sql, reason }),
      ),
    ],
  ];
};

export const Explore = define<State, Msg>('swr-explore', {
  init: () => ({ _tag: 'Static' }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', sql: value ?? '' }),
    Run: ({ event, key }) => {
      if (event.type === 'keydown') {
        if (
          key !== 'Enter' ||
          !((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey)
        ) {
          return undefined;
        }
        event.preventDefault();
      }
      return { _tag: 'Run' };
    },
    Preset: ({ value }) => ({ _tag: 'Preset', index: Number(value) }),
  },
  update: {
    Hydrated: () => ({ _tag: 'Live', sql: FIRST_SQL, result: { _tag: 'Idle' }, started: false }),
    Typed: (s, m) => (s._tag === 'Live' ? { ...s, sql: m.sql } : s),
    Run: (s) => (s._tag === 'Live' && s.sql.trim() !== '' ? run(s) : s),
    Preset: (s, m) => {
      const preset = EXPLORE_TEXT.presets[m.index];
      return s._tag === 'Live' && preset !== undefined ? run({ ...s, sql: preset.sql }) : s;
    },
    // A late answer to SQL that has since changed is ignored.
    Done: (s, m) =>
      s._tag === 'Live' && s.sql === m.sql
        ? { ...s, result: { _tag: 'Done', result: m.result } }
        : s,
    Failed: (s, m) =>
      s._tag === 'Live' && s.sql === m.sql
        ? { ...s, result: { _tag: 'Failed', reason: m.reason } }
        : s,
  },
  view: (s, i) =>
    s._tag === 'Static'
      ? html`<p>${EXPLORE_TEXT.noScript}</p>
          <ul>
            ${SECTIONS.map((k) => html`<li><a href=${sectionPath(k)}>${SECTION_LABELS[k].plural}</a></li>`)}
          </ul>`
      : html`
          <section aria-labelledby="questions">
            <h2 id="questions">${EXPLORE_TEXT.questions}</h2>
            <ul>
              ${EXPLORE_TEXT.presets.map(
                (p, n) =>
                  html`<li>
                    <button type="button" value=${String(n)} data-intent=${i.Preset}>
                      ${p.label}
                    </button>
                  </li>`,
              )}
            </ul>
          </section>
          <form data-intent=${i.Run}>
            <label for="sql">${EXPLORE_TEXT.sqlLabel}</label>
            <div data-intent=${i.Run} data-intent-on="keydown">
              <textarea
                id="sql"
                rows="8"
                spellcheck="false"
                aria-describedby="hint status"
                .value=${s.sql}
                data-intent=${i.Typed}
              ></textarea>
            </div>
            <p id="hint">${EXPLORE_TEXT.runHint}</p>
            <button type="submit">${EXPLORE_TEXT.run}</button>
          </form>
          <p id="status" role="status">${statusText(s.result)}</p>
          ${s.result._tag === 'Done' ? table(s.result.result) : nothing}
        `,
  styles: css`
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
  `,
});

function statusText(r: Result): string {
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

/** The results; `name` links to `path` when both are columns, and `path` itself is hidden. */
function table(r: QueryResult) {
  const pathAt = r.columns.indexOf('path');
  const nameAt = r.columns.indexOf('name');
  const shown = r.columns.map((c, n) => [c, n] as const).filter(([, n]) => n !== pathAt);
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
