// The /search/ page's island: search-as-you-type over the Pagefind index of record pages, with
// a filter by kind. Server-rendered as the no-JavaScript fallback (links to each section), then
// enhanced on `Hydrated`: it reads `?q=` and `?kind=` (the header form lands here), searches as
// you type, and keeps the address bar in step. Keys: arrows move between the box and the
// results, Escape clears. Adapted from gyral.dev's src/islands/site-search.ts.
import { css, define, focus, html, nothing, type Command } from '@gyral/core';
import { kindPath } from '../domain/paths.js';
import { KINDS, type Kind } from '../domain/records.js';
import { KIND_LABELS, TEXT } from '../labels.js';
import { readQuery, search, writeQuery, type Hit, type Query } from './pagefind.js';

export type Msg =
  | { readonly _tag: 'Started'; readonly query: Query }
  | { readonly _tag: 'Typed'; readonly text: string }
  | { readonly _tag: 'Filtered'; readonly kind: Kind | undefined }
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
    Filtered: ({ value }) => ({ _tag: 'Filtered', kind: KINDS.find((k) => k === value) }),
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
            ${KINDS.map((k) => html`<li><a href=${kindPath(k)}>${KIND_LABELS[k].plural}</a></li>`)}
          </ul>`
      : html`
          <search data-intent=${i.Key} data-intent-on="keydown">
            <form data-intent=${i.Submitted}>
              <label for="q">${TEXT.searchLabel}</label>
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
              <label for="kind">${TEXT.searchKindLabel}</label>
              <select id="kind" name="kind" data-intent=${i.Filtered}>
                <option value="" ?selected=${s.query.kind === undefined}>
                  ${TEXT.searchAllKinds}
                </option>
                ${KINDS.map(
                  (k) =>
                    html`<option value=${k} ?selected=${s.query.kind === k}>
                      ${KIND_LABELS[k].plural}
                    </option>`,
                )}
              </select>
            </form>
            <p id="search-status" role="status">${statusText(s)}</p>
            ${results(hitsOf(s))}
          </search>
        `,
  styles: css`
    @layer component {
      :host {
        display: block;
      }
      form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
        align-items: center;
      }
      input {
        flex: 1 1 16rem;
        font: inherit;
        padding: 0.5rem 0.75rem;
      }
      select {
        font: inherit;
        padding: 0.5rem;
      }
      ol {
        padding-inline-start: 0;
        list-style: none;
        display: grid;
        gap: 0.75rem;
      }
      li a {
        display: grid;
        gap: 0.125rem;
        color: inherit;
      }
      small {
        text-transform: uppercase;
        letter-spacing: 0.05em;
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
                ${hit.kind === undefined ? nothing : html`<small>${KIND_LABELS[hit.kind].one}</small>`}
                <strong>${hit.title}</strong>
                <span
                  >${hit.excerpt.map((run) => (run.mark ? html`<mark>${run.text}</mark>` : run.text))}</span
                >
              </a>
            </li>`,
        )}
      </ol>`;
