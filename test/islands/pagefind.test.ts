import { afterEach, describe, expect, it, vi } from 'vitest';
import { drivers, splitExcerpt, toHit } from '../../src/islands/pagefind.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('/pagefind/pagefind.js');
});

const context = () => ({ signal: new AbortController().signal, emit: () => undefined });

describe('search results', () => {
  it('splits Pagefind excerpts into text and marks, decoding entities', () => {
    expect(splitExcerpt('Luke <mark>Sky</mark>walker &amp; R2-D2 &lt;3')).toEqual([
      { text: 'Luke ', mark: false },
      { text: 'Sky', mark: true },
      { text: 'walker & R2-D2 <3', mark: false },
    ]);
  });

  it('reads the title and the kind filter of a result', () => {
    expect(
      toHit({
        url: '/characters/luke-skywalker/',
        excerpt: '<mark>Luke</mark>',
        meta: { title: 'Luke Skywalker' },
        filters: { kind: ['characters'] },
      }),
    ).toEqual({
      url: '/characters/luke-skywalker/',
      title: 'Luke Skywalker',
      kind: 'characters',
      excerpt: [{ text: 'Luke', mark: true }],
    });
  });

  it('falls back to the URL, and to no kind, when Pagefind has neither', () => {
    expect(toHit({ url: '/x/', excerpt: '', meta: {}, filters: { kind: ['droids'] } })).toEqual({
      url: '/x/',
      title: '/x/',
      kind: undefined,
      excerpt: [],
    });
  });
});

describe('drivers', () => {
  it('search the index with the kind as a filter', async () => {
    const search = vi.fn(() =>
      Promise.resolve({
        results: [
          {
            data: () =>
              Promise.resolve({
                url: '/planets/tatooine/',
                excerpt: '<mark>Ta</mark>tooine',
                meta: { title: 'Tatooine' },
                filters: { kind: ['planets'] },
              }),
          },
        ],
      }),
    );
    const options = vi.fn(() => Promise.resolve());
    vi.doMock('/pagefind/pagefind.js', () => ({ options, search }));
    const hits = await drivers.pagefind.run({ text: 'ta', kind: 'planets' }, context());
    expect(search).toHaveBeenCalledWith('ta', { filters: { kind: 'planets' } });
    expect(options).toHaveBeenCalledWith({ baseUrl: '/' });
    expect(hits).toEqual([
      {
        url: '/planets/tatooine/',
        title: 'Tatooine',
        kind: 'planets',
        excerpt: [
          { text: 'Ta', mark: true },
          { text: 'tooine', mark: false },
        ],
      },
    ]);
  });

  it('stop waiting when a newer query switches the search away', async () => {
    const controller = new AbortController();
    const pending = drivers.pagefind.run(
      { text: 'sky', kind: undefined },
      { signal: controller.signal, emit: () => undefined },
    );
    controller.abort();
    await expect(pending).rejects.toThrow('Aborted');
  });

  it('read the query from the address bar and write it back', () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { search: '?q=sky&kind=people', href: 'https://starwars.run/search/?q=sky' },
      history: { replaceState },
    });
    const params = drivers.searchLocation.run(undefined, context()) as URLSearchParams;
    expect(params.get('q')).toBe('sky');
    void drivers.searchHistory.run({ text: 'ta', kind: 'planets' }, context());
    expect(String(replaceState.mock.calls[0]?.[2])).toBe(
      'https://starwars.run/search/?q=ta&kind=planets',
    );
    void drivers.searchHistory.run({ text: '', kind: undefined }, context());
    expect(String(replaceState.mock.calls[1]?.[2])).toBe('https://starwars.run/search/');
  });
});
