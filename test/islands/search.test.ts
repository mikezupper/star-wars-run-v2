import { html } from '@gyral/core';
import { renderToString } from '@gyral/ssr';
import { initial, inputsFor, parse, resolve, step } from '@gyral/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Search, type State } from '../../src/islands/search.js';
import { searchDriver } from '../../src/islands/search-api.js';
import type { Result } from '../../src/domain/search.js';
import { TEXT } from '../../src/labels.js';

const props = { full: false, query: '', section: '' };
const spec = Search.spec;
const subject: Result = {
  name: 'Luke Skywalker',
  path: '/characters/luke-skywalker/',
  section: 'characters',
  eras: [
    { era: 'canon', path: '/characters/luke-skywalker/' },
    { era: 'legends', path: '/characters/luke-skywalker-legends/' },
  ],
  excerpt: [],
};
const state = (changes: Partial<State> = {}): State => ({
  ...initial(spec, props).state,
  live: true,
  ...changes,
});
const ready = () =>
  state({
    query: 'luke',
    found: [subject, { ...subject, name: 'Other Luke', path: '/characters/other-luke/' }],
    phase: 'done',
    open: true,
  });
const input = { query: 'luke', section: undefined };
const view = async (s: State, full = false) =>
  renderToString(
    spec.view(
      s,
      {
        Typed: 'Typed',
        SectionChanged: 'SectionChanged',
        Focused: 'Focused',
        Dismissed: 'Dismissed',
        Key: 'Key',
      },
      { props: { ...props, full }, read: () => undefined as never },
    ),
  );

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('search suggestions', () => {
  it('keeps SSR forms usable and preserves their query and section', async () => {
    const out = await renderToString(
      html`<swr-site-search full query="luke" section="characters"></swr-site-search>`,
    );
    expect(out).toContain('method="get"');
    expect(out).toContain('action="/search/"');
    expect(out).toContain('id="search-q"');
    expect(out).toContain('value="luke"');
    expect(out).not.toContain('role="combobox"');
    expect(out).not.toContain('shadowrootmode');
    expect(out).not.toContain('data-intent-submit');
    expect(out).toMatch(/<option[^>]*value="characters"[^>]*selected/);
    const before = initial(spec, props).state;
    expect(step(spec, before, { _tag: 'Hydrated', serverRendered: true }).state).toEqual({
      ...before,
      live: true,
    });
  });

  it('switches lookups on edits, section changes and clearing', () => {
    const typed = step(spec, state(), { _tag: 'Typed', query: ' luke ' });
    expect(inputsFor(typed.commands, searchDriver)).toEqual([input]);
    expect(typed.state).toMatchObject({ phase: 'loading', open: true, active: -1 });
    const command = typed.commands[0];
    if (command === undefined) throw new Error('Missing lookup');
    const found = resolve(command, { query: 'luke', results: [subject] });
    if (found === undefined) throw new Error('Missing reply');
    expect(step(spec, typed.state, found).state.found).toEqual([subject]);
    const changed = step(spec, typed.state, { _tag: 'SectionChanged', section: 'planets' });
    expect(inputsFor(changed.commands, searchDriver)).toEqual([
      { query: 'luke', section: 'planets' },
    ]);
    const cleared = step(spec, ready(), { _tag: 'Typed', query: '' });
    expect(cleared.state).toMatchObject({ open: false, found: [], phase: 'idle' });
    expect(inputsFor(cleared.commands, searchDriver)).toEqual([{ query: '', section: undefined }]);
  });

  it('rejects late success and failure, and does not reopen a dismissed palette', () => {
    const later = state({ query: 'vader' });
    expect(
      step(spec, later, { _tag: 'Found', input, results: { query: 'luke', results: [subject] } })
        .state,
    ).toBe(later);
    expect(step(spec, later, { _tag: 'Failed', input }).state).toBe(later);
    const filtered = state({ query: 'luke', section: 'planets' });
    expect(
      step(spec, filtered, { _tag: 'Found', input, results: { query: 'luke', results: [subject] } })
        .state,
    ).toBe(filtered);
    const closed = step(spec, ready(), { _tag: 'Dismissed' }).state;
    expect(
      step(spec, closed, { _tag: 'Found', input, results: { query: 'luke', results: [subject] } })
        .state.open,
    ).toBe(false);
    expect(step(spec, ready(), { _tag: 'Failed', input }).state.phase).toBe('failed');
    expect(step(spec, closed, { _tag: 'Focused' }).state.open).toBe(true);
    expect(step(spec, state({ query: 'luke' }), { _tag: 'Focused' }).commands).toHaveLength(1);
    expect(step(spec, state(), { _tag: 'Focused' }).state.open).toBe(false);
  });

  it('selects with arrows while keeping DOM focus, opens the selected link, and dismisses without clearing', () => {
    let s = ready();
    s = step(spec, s, { _tag: 'Key', key: 'ArrowDown' }).state;
    expect(s.active).toBe(0);
    expect(step(spec, s, { _tag: 'Key', key: 'ArrowUp' }).state.active).toBe(1);
    expect(step(spec, ready(), { _tag: 'Key', key: 'ArrowUp' }).state.active).toBe(1);
    expect(step(spec, { ...s, active: 1 }, { _tag: 'Key', key: 'ArrowDown' }).state.active).toBe(0);
    const enter = step(spec, s, { _tag: 'Key', key: 'Enter' });
    expect(enter.commands[0]?.input).toMatchObject({ method: 'click' });
    const escaped = step(spec, s, { _tag: 'Key', key: 'Escape' }).state;
    expect(escaped).toMatchObject({ open: false, active: -1, query: 'luke' });
    expect(step(spec, escaped, { _tag: 'Key', key: 'Enter' }).commands).toEqual([]);
    expect(step(spec, state(), { _tag: 'Key', key: 'ArrowDown' }).commands).toEqual([]);
  });

  it('leaves ordinary submission, editing keys, modifiers and composition to the browser', () => {
    const key = (key: string, s = ready(), extra = {}) => {
      const event = Object.assign(new Event('keydown', { cancelable: true }), extra);
      const parsed = parse(Search, 'Key', { key, event }, { state: s, props });
      return { parsed, prevented: event.defaultPrevented };
    };
    for (const k of ['Home', 'End', 'ArrowLeft', 'a', 'Tab']) expect(key(k).parsed).toBeUndefined();
    expect(key('Enter').prevented).toBe(false);
    expect(key('ArrowDown').prevented).toBe(true);
    expect(key('Enter', { ...ready(), active: 0 }).prevented).toBe(true);
    expect(key('Escape').prevented).toBe(true);
    for (const extra of [
      { isComposing: true },
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
    ])
      expect(key('ArrowDown', ready(), extra).parsed).toBeUndefined();
    expect(
      parse(
        Search,
        'Typed',
        { value: 'luke', event: Object.assign(new Event('input'), { isComposing: true }) },
        { state: state(), props },
      ),
    ).toBeUndefined();
    expect(parse(Search, 'Typed', { value: 'luke' }, { state: state(), props })).toEqual({
      _tag: 'Typed',
      query: 'luke',
    });
    expect(parse(Search, 'SectionChanged', { value: 'bogus' }, { state: state(), props })).toEqual({
      _tag: 'SectionChanged',
      section: undefined,
    });
  });

  it('renders badges, active-descendant semantics, announcements, failure, typo and Ask handoff', async () => {
    const out = await view({ ...ready(), active: 0 });
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-expanded="true"');
    expect(out).toContain('aria-activedescendant="site-search-q-option-0"');
    expect(out).toContain('aria-selected="true"');
    expect(out).toContain('data-era="canon"');
    expect(out).toContain('data-era="legends"');
    expect(out).toContain(TEXT.searchSuggestionCount(2));
    expect(await view(state({ query: 'luke', phase: 'loading', open: true }))).toContain(
      TEXT.searchLoading,
    );
    expect(await view(state({ query: 'luke', phase: 'failed', open: true }))).toContain(
      TEXT.searchSuggestionsUnavailable,
    );
    expect(
      await view(
        state({ query: 'who is luke?', phase: 'done', open: true, didYouMean: 'Luke' }),
        true,
      ),
    ).toContain('/explore/?ask=who%20is%20luke%3F');
    expect(
      await view(state({ query: 'tatoine', phase: 'done', open: true, didYouMean: 'Tatooine' })),
    ).toContain('/search/?q=Tatooine');
    const many = step(spec, ready(), {
      _tag: 'Found',
      input,
      results: { query: 'luke', results: Array.from({ length: 8 }, () => subject) },
    });
    expect(many.state.found).toHaveLength(6);
    expect(await view(state())).toContain('aria-expanded="false"');
  });
});

describe('suggestions driver', () => {
  const ctx = (signal = new AbortController().signal) => ({ signal, emit: () => undefined });
  it('debounces a cacheable same-origin GET and preserves the section', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ query: 'ta', results: [] }))),
    );
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    const pending = searchDriver.run({ query: 'ta', section: 'planets' }, ctx(signal));
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    await expect(pending).resolves.toEqual({ query: 'ta', results: [] });
    expect(fetch).toHaveBeenCalledWith('/api/search?q=ta&section=planets', {
      signal,
    });
  });
  it('clears without fetching and cancels before fetching', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(searchDriver.run({ query: '', section: undefined }, ctx())).resolves.toEqual({
      query: '',
      results: [],
    });
    const controller = new AbortController();
    const pending = searchDriver.run(input, ctx(controller.signal));
    const rejected = expect(pending).rejects.toThrow();
    controller.abort();
    await rejected;
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reports a server failure through the command failure mapper', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 503 }))),
    );
    const pending = searchDriver.run(input, ctx());
    const rejected = expect(pending).rejects.toThrow('Search unavailable');
    await vi.advanceTimersByTimeAsync(150);
    await rejected;
  });
});
