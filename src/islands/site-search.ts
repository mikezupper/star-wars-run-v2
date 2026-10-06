// The /search/ page's island: search-as-you-type over the Pagefind index of record pages, with
// a filter by kind. Server-rendered as the no-JavaScript fallback (links to each section), then
// enhanced on `Hydrated`: it reads `?q=` and `?kind=` (the header form lands here), searches as
// you type, and keeps the address bar in step. Keys: arrows move between the box and the
// results, Escape clears. Adapted from gyral.dev's src/islands/site-search.ts.
import { css, define, focus, html, nothing, type Command } from '@gyral/core';
import { sectionPath } from '../domain/archive.js';
import { SECTIONS, type Section } from '../domain/sections.js';
import { SECTION_LABELS, TEXT } from '../labels.js';
import { readQuery, search, writeQuery, type Hit, type Query } from './pagefind.js';

export type Msg =
  | { readonly _tag: 'Started'; readonly query: Query }
  | { readonly _tag: 'Typed'; readonly text: string }
  | { readonly _tag: 'Filtered'; readonly kind: Section | undefined }
  | { readonly _tag: 'Submitted' }
  | {
      readonly _tag: 'Key';
      readonly key: 'ArrowDown' | 'ArrowUp' | 'Escape';
      readonly from: number;
    }
  | { readonly _tag: 'Found'; readonly query: Query; readonly hits: readonly Hit[] }
  | { readonly _tag: 'Failed' };

export type Result =
  | { readonly _tag: 'Empty' }
  | { readonly _tag: 'Searching' }
  | { readonly _tag: 'Found'; readonly hits: readonly Hit[] }
  | { readonly _tag: 'Failed' };

export type State =
  /** Server render and first client render: the no-JavaScript fallback. */
  | { readonly _tag: 'Static' }
  | { readonly _tag: 'Live'; readonly query: Query; readonly result: Result };

const trimmed = (q: Query): Query => ({ text: q.text.trim(), kind: q.kind });
const same = (a: Query, b: Query): boolean => a.text === b.text && a.kind === b.kind;

/** The new state and commands for a query: keep the URL in step and, unless blank, search. */
const live = (query: Query): readonly [State, readonly Command<Msg>[]] => {
  const q = trimmed(query);
  return q.text === ''
    ? [{ _tag: 'Live', query, result: { _tag: 'Empty' } }, [writeQuery<Msg>(q)]]
    : [
        { _tag: 'Live', query, result: { _tag: 'Searching' } },
        [
          writeQuery<Msg>(q),
          search(
            q,
            (hits): Msg => ({ _tag: 'Found', query: q, hits }),
            (): Msg => ({ _tag: 'Failed' }),
          ),
        ],
      ];
};

const queryOf = (s: State): Query => (s._tag === 'Live' ? s.query : { text: '', kind: undefined });

const hitsOf = (s: State): readonly Hit[] =>
  s._tag === 'Live' && s.result._tag === 'Found' ? s.result.hits : [];

/** Index of the focused result (`hit-3` → 3), or -1 for the search box. */
const indexOf = (target: EventTarget | null): number => {
  const id = target instanceof Element ? target.id : '';
  return id.startsWith('hit-') ? Number(id.slice(4)) : -1;
};

export const SiteSearch = define<State, Msg>('swr-site-search', {
  init: () => ({ _tag: 'Static' }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', text: value ?? '' }),
    Filtered: ({ value }) => ({ _tag: 'Filtered', kind: SECTIONS.find((k) => k === value) }),
    Submitted: () => ({ _tag: 'Submitted' }),
    Key: ({ key, event }) => {
      if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Escape') return undefined;
      // The one side effect a parser may have: stop the arrows moving the caret or scrolling.
      if (key !== 'Escape') event.preventDefault();
      return { _tag: 'Key', key, from: indexOf(event.target) };
    },
  },
  update: {
    Hydrated: () => [
      { _tag: 'Live', query: { text: '', kind: undefined }, result: { _tag: 'Empty' } },
      [readQuery((query): Msg => ({ _tag: 'Started', query }))],
    ],
    Started: (_s, m) => live(m.query),
    Typed: (s, m) => live({ ...queryOf(s), text: m.text }),
    Filtered: (s, m) => live({ ...queryOf(s), kind: m.kind }),
    Submitted: (s) => (hitsOf(s).length > 0 ? [s, [focus('#hit-0')]] : s),
    Key: (s, m) => {
      if (m.key === 'Escape') {
        const [state, commands] = live({ ...queryOf(s), text: '' });
        return [state, [...commands, focus('#q')]];
      }
      const last = hitsOf(s).length - 1;
      const to = Math.min(Math.max(m.from + (m.key === 'ArrowDown' ? 1 : -1), -1), last);
      return [s, [focus(to < 0 ? '#q' : `#hit-${String(to)}`)]];
    },
    // A late answer for an older query is ignored.
    Found: (s, m) =>
      s._tag === 'Live' && same(trimmed(s.query), m.query)
        ? { ...s, result: { _tag: 'Found', hits: m.hits } }
        : s,
    Failed: (s) => (s._tag === 'Live' ? { ...s, result: { _tag: 'Failed' } } : s),
  },
  view: (s, i) =>
    s._tag === 'Static'
      ? html`<p>${TEXT.searchNoScript}</p>
          <ul>
            ${SECTIONS.map((k) => html`<li><a href=${sectionPath(k)}>${SECTION_LABELS[k].plural}</a></li>`)}
          </ul>`
      : html`
          <search data-intent=${i.Key} data-intent-on="keydown">
            <form data-intent=${i.Submitted}>
              <label class="field">
                ${TEXT.searchLabel}
                <input
                  id="q"
                  name="q"
                  type="search"
                  autocomplete="off"
                  spellcheck="false"
                  aria-describedby="search-status"
                  .value=${s.query.text}
                  data-intent=${i.Typed}
                />
              </label>
              <label>
                ${TEXT.searchKindLabel}
                <select id="kind" name="kind" data-intent=${i.Filtered}>
                  <option value="" ?selected=${s.query.kind === undefined}>
                    ${TEXT.searchAllKinds}
                  </option>
                  ${SECTIONS.map(
                    (k) =>
                      html`<option value=${k} ?selected=${s.query.kind === k}>
                        ${SECTION_LABELS[k].plural}
                      </option>`,
                  )}
                </select>
              </label>
            </form>
            <p id="search-status" role="status">${statusText(s)}</p>
            ${results(hitsOf(s))}
          </search>
        `,
  // The page's design tokens (src/styles/site.css) inherit into the shadow root.
  styles: css`
    @layer component {
      :host {
        display: block;
      }
      search {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1rem;
      }
      form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
        align-items: end;
      }
      label {
        display: grid;
        gap: 0.35rem;
        font-size: var(--step--1, 0.9rem);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-muted, inherit);
      }
      input,
      select {
        font: inherit;
        min-block-size: 2.75rem;
        padding: 0.5rem 0.9rem;
        border: 1px solid var(--border, currentColor);
        border-radius: var(--radius, 0.75rem);
        background: var(--surface-raised, transparent);
        color: var(--text, inherit);
      }
      input,
      select {
        font-weight: 400;
        letter-spacing: normal;
        text-transform: none;
      }
      input {
        inline-size: 100%;
        font-size: var(--step-1, 1.25rem);
      }
      label {
        min-inline-size: 0;
      }
      .field {
        flex: 1 1 16rem;
      }
      select {
        max-inline-size: 100%;
      }
      :focus-visible {
        outline: 3px solid var(--focus, Highlight);
        outline-offset: 3px;
      }
      [role='status'],
      p {
        color: var(--text-muted, inherit);
        margin: 0;
      }
      a {
        color: var(--link, LinkText);
      }
      ol {
        display: grid;
        gap: 0.75rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      li a {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 0.2rem;
        padding: 0.9rem 1.1rem;
        border: 1px solid var(--border, currentColor);
        border-radius: var(--radius, 0.75rem);
        background: var(--surface-raised, transparent);
        color: var(--text, inherit);
        text-decoration: none;
      }
      li a:hover {
        border-color: var(--accent, currentColor);
      }
      small {
        font-size: var(--step--1, 0.85rem);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-muted, inherit);
      }
      strong {
        font-size: var(--step-1, 1.2rem);
        color: var(--link, LinkText);
      }
      span {
        color: var(--text-muted, inherit);
        overflow-wrap: anywhere;
      }
      mark {
        background: color-mix(in oklch, var(--accent, yellow) 35%, transparent);
        color: var(--text, inherit);
        border-radius: 0.2em;
      }
    }
  `,
});

const statusText = (s: Extract<State, { _tag: 'Live' }>): string => {
  const r = s.result;
  switch (r._tag) {
    case 'Empty':
      return TEXT.searchHint;
    case 'Searching':
      return TEXT.searching;
    case 'Failed':
      return TEXT.searchFailed;
    case 'Found':
      return r.hits.length === 0
        ? TEXT.noResults(s.query.text.trim())
        : TEXT.resultCount(r.hits.length, s.query.text.trim());
  }
};

const results = (hits: readonly Hit[]) =>
  hits.length === 0
    ? nothing
    : html`<ol aria-label=${TEXT.searchResults}>
        ${hits.map(
          (hit, n) =>
            html`<li>
              <a id=${`hit-${String(n)}`} href=${hit.url}>
                ${hit.kind === undefined ? nothing : html`<small>${SECTION_LABELS[hit.kind].one}</small>`}
                <strong>${hit.title}</strong>
                <span
                  >${hit.excerpt.map((run) => (run.mark ? html`<mark>${run.text}</mark>` : run.text))}</span
                >
              </a>
            </li>`,
        )}
      </ol>`;
