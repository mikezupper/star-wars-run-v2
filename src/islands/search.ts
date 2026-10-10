// The header and results-page forms stay plain GET forms. Hydration adds a manual-selection
// combobox in light DOM, preserving fragment focus, labels and the shared stylesheet.
import { call, define, html, nothing, prop, type Command } from '@gyral/core';
import { askPath, looksLikeQuestion } from '../domain/ask.js';
import { searchPath, type Result, type Results } from '../domain/search.js';
import { isSection, SECTIONS, type Section } from '../domain/sections.js';
import { SECTION_LABELS, TEXT } from '../labels.js';
import { lookup, type Lookup } from './search-api.js';

interface Props {
  readonly full: boolean;
  readonly query: string;
  readonly section: string;
}

export interface State {
  readonly live: boolean;
  readonly query: string;
  readonly section: Section | undefined;
  readonly phase: 'idle' | 'loading' | 'done' | 'failed';
  readonly found: readonly Result[];
  readonly didYouMean: string | undefined;
  readonly active: number;
  readonly open: boolean;
}

export type Msg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'SectionChanged'; readonly section: Section | undefined }
  | { readonly _tag: 'Found'; readonly input: Lookup; readonly results: Results }
  | { readonly _tag: 'Failed'; readonly input: Lookup }
  | { readonly _tag: 'Focused' }
  | { readonly _tag: 'Dismissed' }
  | { readonly _tag: 'Key'; readonly key: 'ArrowDown' | 'ArrowUp' | 'Escape' | 'Enter' };

/** Six choices fit a phone palette; the ordinary submit and footer reach the complete list. */
const SUGGESTIONS = 6;

const search = (s: State): [State, Command<Msg>[]] => {
  const input = { query: s.query.trim(), section: s.section };
  return [
    {
      ...s,
      phase: input.query === '' ? 'idle' : 'loading',
      found: [],
      didYouMean: undefined,
      active: -1,
      open: input.query !== '',
    },
    [
      lookup(
        input,
        (results): Msg => ({ _tag: 'Found', input, results }),
        (): Msg => ({ _tag: 'Failed', input }),
      ),
    ],
  ];
};

const current = (s: State, input: Lookup) =>
  s.query.trim() === input.query && s.section === input.section;

export const Search = define<State, Msg, Props>()('swr-site-search', {
  shadow: false,
  props: {
    full: prop.boolean({ default: false }),
    query: prop.string({ default: '' }),
    section: prop.string({ default: '' }),
  },
  init: (props) => ({
    live: false,
    query: props.query,
    section: isSection(props.section) ? props.section : undefined,
    phase: 'idle',
    found: [],
    didYouMean: undefined,
    active: -1,
    open: false,
  }),
  intent: {
    Typed: ({ value, event }) =>
      (event as InputEvent).isComposing ? undefined : { _tag: 'Typed', query: value ?? '' },
    SectionChanged: ({ value }) => ({
      _tag: 'SectionChanged',
      section: isSection(value ?? '') ? (value as Section) : undefined,
    }),
    Focused: true,
    Dismissed: ({ event, target }) => {
      const next = (event as FocusEvent).relatedTarget;
      return next instanceof Node && target.contains(next) ? undefined : { _tag: 'Dismissed' };
    },
    Key: ({ key, event }, { state }) => {
      const e = event as KeyboardEvent;
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey || event.defaultPrevented)
        return undefined;
      if (
        ((key === 'ArrowDown' || key === 'ArrowUp') && state.found.length > 0) ||
        (key === 'Escape' && state.open) ||
        (key === 'Enter' && state.open && state.active >= 0)
      ) {
        event.preventDefault();
        return { _tag: 'Key', key };
      }
      return undefined;
    },
  },
  update: {
    Hydrated: (s) => ({ ...s, live: true }),
    Typed: (s, m) => search({ ...s, query: m.query }),
    SectionChanged: (s, m) => search({ ...s, section: m.section }),
    Found: (s, m) =>
      current(s, m.input)
        ? {
            ...s,
            phase: m.input.query === '' ? 'idle' : 'done',
            found: m.results.results.slice(0, SUGGESTIONS),
            didYouMean: m.results.didYouMean,
            active: -1,
          }
        : s,
    Failed: (s, m) => (current(s, m.input) ? { ...s, phase: 'failed', found: [], active: -1 } : s),
    Focused: (s) =>
      s.phase === 'idle' && s.query.trim() !== ''
        ? search(s)
        : { ...s, open: s.query.trim() !== '' },
    Dismissed: (s) => ({ ...s, open: false, active: -1 }),
    Key: (s, m) => {
      if (m.key === 'Escape') return { ...s, open: false, active: -1 };
      if (m.key === 'Enter')
        return s.open && s.active >= 0
          ? [s, [call('[role="option"][aria-selected="true"]', 'click')]]
          : s;
      if (s.found.length === 0) return s;
      const active =
        m.key === 'ArrowDown'
          ? (s.active + 1) % s.found.length
          : s.active < 0
            ? s.found.length - 1
            : (s.active - 1 + s.found.length) % s.found.length;
      return [
        { ...s, open: true, active },
        [call(`[data-search-option="${String(active)}"]`, 'scrollIntoView', { block: 'nearest' })],
      ];
    },
  },
  view: (s, i, { props }) => {
    const id = props.full ? 'search-q' : 'site-search-q';
    const expanded = s.live && s.open && s.query.trim() !== '';
    const status = !expanded
      ? ''
      : s.phase === 'loading'
        ? TEXT.searchLoading
        : s.phase === 'failed'
          ? TEXT.searchSuggestionsUnavailable
          : s.phase === 'done'
            ? s.found.length === 0
              ? TEXT.noResults(s.query.trim())
              : TEXT.searchSuggestionCount(s.found.length)
            : '';
    return html`<search data-intent-focusout=${i.Dismissed}>
      <form action="/search/" method="get">
        <label for=${id}>${TEXT.searchLabel}</label>
        <input
          id=${id}
          name="q"
          type="search"
          value=${s.query}
          autocomplete="off"
          placeholder=${TEXT.searchPlaceholder}
          aria-keyshortcuts="/ Control+K Meta+K"
          role=${s.live ? 'combobox' : undefined}
          aria-autocomplete=${s.live ? 'list' : undefined}
          aria-expanded=${s.live ? String(expanded) : undefined}
          aria-controls=${s.live ? `${id}-suggestions` : undefined}
          aria-activedescendant=${expanded && s.active >= 0 ? `${id}-option-${String(s.active)}` : undefined}
          data-intent=${i.Typed}
          data-intent-compositionend=${i.Typed}
          data-intent-keydown=${i.Key}
          data-intent-focusin=${i.Focused}
        />
        ${
          props.full
            ? html`<label for="search-section">${TEXT.searchKindLabel}</label>
                <select id="search-section" name="section" data-intent=${i.SectionChanged}>
                  <option value="">${TEXT.searchAllKinds}</option>
                  ${SECTIONS.map((section) => html`<option value=${section} ?selected=${s.section === section}>${SECTION_LABELS[section].plural}</option>`)}
                </select>`
            : nothing
        }
        <button type="submit">${TEXT.searchLabel}</button>
      </form>
      <p data-search-status role="status" aria-live="polite" aria-atomic="true">${status}</p>
      <div data-search-palette ?hidden=${!expanded}>
        ${s.phase === 'loading' ? html`<p>${TEXT.searchLoading}</p>` : s.phase === 'failed' ? html`<p>${TEXT.searchSuggestionsUnavailable}</p>` : s.phase === 'done' && s.found.length === 0 ? html`<p>${TEXT.noResults(s.query.trim())}</p>` : nothing}
        <ol id=${`${id}-suggestions`} role="listbox" aria-label=${TEXT.searchSuggestions}>
          ${s.found.map(
            (r, n) =>
              html`<li role="none">
                <a
                  id=${`${id}-option-${String(n)}`}
                  href=${r.path}
                  role="option"
                  tabindex="-1"
                  data-search-option=${String(n)}
                  aria-selected=${String(s.active === n)}
                >
                  <strong>${r.name}</strong
                  ><small
                    >${SECTION_LABELS[r.section].one}
                    ${r.eras.map((era) => html`<span data-era=${era.era}>${era.era === 'canon' ? TEXT.canon : TEXT.legends}</span>`)}
                  </small>
                </a>
              </li>`,
          )}
        </ol>
        ${!expanded || s.didYouMean === undefined ? nothing : html`<p>${TEXT.didYouMean} <a href=${searchPath(s.didYouMean, s.section)}>${s.didYouMean}</a>?</p>`}
        ${expanded && looksLikeQuestion(s.query) ? html`<p><a href=${askPath(s.query)}>${TEXT.askInstead}</a></p>` : nothing}
        ${expanded ? html`<p><a href=${searchPath(s.query.trim(), s.section)}>${TEXT.searchAllResults}</a></p>` : nothing}
      </div>
    </search>`;
  },
});
