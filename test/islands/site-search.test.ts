import { renderToString } from '@gyral/ssr';
import { html } from 'lit';
import { inputsFor, resolve, run, step } from '@gyral/testing';
import { describe, expect, it, vi } from 'vitest';
import { drivers, type Hit } from '../../src/islands/pagefind.js';
import { TEXT } from '../../src/labels.js';
import { SiteSearch, type Msg, type State } from '../../src/islands/site-search.js';

const spec = SiteSearch.spec;
const luke: Hit = {
  url: '/characters/luke-skywalker/',
  title: 'Luke Skywalker',
  kind: 'characters',
  excerpt: [{ text: 'Luke', mark: true }],
};
const live = (text: string, kind?: 'planets'): Extract<State, { _tag: 'Live' }> => ({
  _tag: 'Live',
  query: { text, kind },
  result: { _tag: 'Empty' },
});

describe('site search', () => {
  it('starts static, then reads the query from the URL once hydrated', () => {
    const hydrated = step(spec, { _tag: 'Static' }, { _tag: 'Hydrated' } as unknown as Msg);
    expect(hydrated.state).toEqual(live(''));
    const read = hydrated.commands[0];
    if (read === undefined) throw new Error('expected a command');
    expect(resolve(read, new URLSearchParams('q=sky&kind=planets'))).toEqual({
      _tag: 'Started',
      query: { text: 'sky', kind: 'planets' },
    });
    expect(resolve(read, new URLSearchParams('kind=droids'))).toEqual({
      _tag: 'Started',
      query: { text: '', kind: undefined },
    });
  });

  it('searches the trimmed text and keeps the URL in step', () => {
    const typed = step(spec, live(''), { _tag: 'Typed', text: ' sky ' });
    expect(typed.state).toMatchObject({ result: { _tag: 'Searching' } });
    expect(inputsFor(typed.commands, drivers.pagefind)).toEqual([{ text: 'sky', kind: undefined }]);
    expect(inputsFor(typed.commands, drivers.searchHistory)).toEqual([
      { text: 'sky', kind: undefined },
    ]);
  });

  it('applies the kind filter to the current text', () => {
    const filtered = step(spec, live('ta'), { _tag: 'Filtered', kind: 'planets' });
    expect(inputsFor(filtered.commands, drivers.pagefind)).toEqual([
      { text: 'ta', kind: 'planets' },
    ]);
  });

  it('does not search for blank text', () => {
    const blank = step(spec, live('sky'), { _tag: 'Typed', text: '   ' });
    expect(blank.state).toMatchObject({ result: { _tag: 'Empty' } });
    expect(inputsFor(blank.commands, drivers.pagefind)).toEqual([]);
  });

  it('shows results for the current query and ignores late ones', () => {
    const typed = step(spec, live(''), { _tag: 'Typed', text: 'luke' });
    const searchCommand = typed.commands.find((c) => inputsFor([c], drivers.pagefind).length > 0);
    if (searchCommand === undefined) throw new Error('expected a search');
    const found = resolve(searchCommand, [luke]);
    if (found === undefined) throw new Error('expected a message');
    expect(step(spec, typed.state, found).state).toMatchObject({
      result: { _tag: 'Found', hits: [luke] },
    });
    const { state } = run(
      spec,
      [
        { _tag: 'Typed', text: 'luke' },
        { _tag: 'Typed', text: 'leia' },
        { _tag: 'Found', query: { text: 'luke', kind: undefined }, hits: [luke] },
      ],
      { state: live('') },
    );
    expect(state).toMatchObject({ result: { _tag: 'Searching' } });
  });

  it('reports a failed index load', () => {
    expect(step(spec, live('sky'), { _tag: 'Failed' }).state).toMatchObject({
      result: { _tag: 'Failed' },
    });
    expect(step(spec, { _tag: 'Static' }, { _tag: 'Failed' }).state).toEqual({ _tag: 'Static' });
    expect(
      step(
        spec,
        { _tag: 'Static' },
        { _tag: 'Found', query: { text: 'x', kind: undefined }, hits: [] },
      ).state,
    ).toEqual({ _tag: 'Static' });
  });

  it('moves focus with the arrow keys and clears with Escape', () => {
    const withHits: State = { ...live('luke'), result: { _tag: 'Found', hits: [luke, luke] } };
    const down = step(spec, withHits, { _tag: 'Key', key: 'ArrowDown', from: -1 });
    expect(down.commands).toHaveLength(1);
    const up = step(spec, withHits, { _tag: 'Key', key: 'ArrowUp', from: 0 });
    expect(up.commands).toHaveLength(1);
    const escape = step(spec, withHits, { _tag: 'Key', key: 'Escape', from: 1 });
    expect(escape.state).toMatchObject({ query: { text: '' }, result: { _tag: 'Empty' } });
    expect(step(spec, withHits, { _tag: 'Submitted' }).commands).toHaveLength(1);
    expect(step(spec, live(''), { _tag: 'Submitted' }).commands).toHaveLength(0);
  });

  it('renders the no-JavaScript fallback on the server', async () => {
    const out = await renderToString(html`<swr-site-search></swr-site-search>`);
    expect(out).toContain(TEXT.searchNoScript);
    expect(out).toContain('href="/characters/"');
  });

  it('parses typing, the kind filter and keys into messages', () => {
    const intent = spec.intent as Record<string, (input: unknown) => unknown>;
    const parse = (name: string, input: object) => intent[name]?.(input);
    expect(parse('Typed', { value: 'sky' })).toEqual({ _tag: 'Typed', text: 'sky' });
    expect(parse('Typed', {})).toEqual({ _tag: 'Typed', text: '' });
    expect(parse('Filtered', { value: 'planets' })).toEqual({ _tag: 'Filtered', kind: 'planets' });
    expect(parse('Filtered', { value: '' })).toEqual({ _tag: 'Filtered', kind: undefined });
    expect(parse('Submitted', {})).toEqual({ _tag: 'Submitted' });
    class FakeElement {
      constructor(readonly id: string) {}
    }
    vi.stubGlobal('Element', FakeElement);
    let prevented = 0;
    const event = (id: string) => ({
      preventDefault: () => (prevented += 1),
      target: new FakeElement(id),
    });
    expect(parse('Key', { key: 'a', event: event('q') })).toBeUndefined();
    expect(parse('Key', { key: 'Escape', event: event('q') })).toMatchObject({ from: -1 });
    expect(prevented).toBe(0);
    expect(parse('Key', { key: 'ArrowDown', event: event('hit-2') })).toEqual({
      _tag: 'Key',
      key: 'ArrowDown',
      from: 2,
    });
    expect(prevented).toBe(1);
    vi.unstubAllGlobals();
  });
});

describe('site search view', () => {
  const names = Object.fromEntries(
    ['Typed', 'Filtered', 'Submitted', 'Key', 'Started', 'Found', 'Failed'].map((n) => [n, n]),
  );
  const view = async (state: State) =>
    (await renderToString(spec.view(state, names as never, { props: {} } as never))).replace(
      /<!--[^>]*-->|<\?>/g,
      '',
    );

  it('shows the hint, then progress, then a count of results with marked excerpts', async () => {
    expect(await view(live(''))).toContain(TEXT.searchHint);
    expect(await view({ ...live('sky'), result: { _tag: 'Searching' } })).toContain(TEXT.searching);
    const found = await view({ ...live('luke'), result: { _tag: 'Found', hits: [luke] } });
    expect(found).toContain(TEXT.resultCount(1, 'luke'));
    expect(found).toContain('<a id="hit-0" href="/characters/luke-skywalker/">');
    expect(found).toContain('<small>character</small>');
    expect(found).toContain('<mark>Luke</mark>');
    const two = await view({
      ...live('luke'),
      result: {
        _tag: 'Found',
        hits: [luke, { ...luke, kind: undefined, excerpt: [{ text: 'x', mark: false }] }],
      },
    });
    expect(two).toContain(TEXT.resultCount(2, 'luke'));
  });

  it('says when nothing matched or the index failed to load', async () => {
    expect(await view({ ...live('zzz'), result: { _tag: 'Found', hits: [] } })).toContain(
      TEXT.noResults('zzz'),
    );
    expect(await view({ ...live('sky'), result: { _tag: 'Failed' } })).toContain(TEXT.searchFailed);
  });

  it('marks the chosen kind in the filter', async () => {
    const html = await view(live('ta', 'planets'));
    expect(html).toMatch(/<option value="planets" selected/);
  });
});
