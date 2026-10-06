import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TitleRow } from '../../src/domain/titles.js';
import { mergeHits, type Hit } from '../../src/islands/pagefind.js';

const ROWS: readonly TitleRow[] = [
  ['Tatooine wine', '/other/tatooine-wine/', 'other', 4, 0],
  ['Tatooine', '/planets/tatooine/', 'planets', 9, 0],
  ['Tatooine', '/planets/tatooine-legends/', 'planets', 9, 1],
];

/** A fresh module each time: it keeps the shards it has fetched. */
const load = async (files: Readonly<Record<string, unknown>>) => {
  vi.resetModules();
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      url in files
        ? new Response(JSON.stringify(files[url]))
        : new Response('not found', { status: 404 }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  return { fetch, ...(await import('../../src/islands/titles.js')) };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('title hits', () => {
  it('rank the shard for the query, mark Legends, and fetch each shard once', async () => {
    const { titleHits, fetch } = await load({
      '/search-titles/index.json': { split: [], keys: ['tat'] },
      '/search-titles/tat.json': ROWS,
    });
    expect(await titleHits('tatooine', undefined)).toEqual([
      { url: '/planets/tatooine/', title: 'Tatooine', kind: 'planets' },
      { url: '/planets/tatooine-legends/', title: 'Tatooine (Legends)', kind: 'planets' },
      { url: '/other/tatooine-wine/', title: 'Tatooine wine', kind: 'other' },
    ]);
    expect(await titleHits('tatooine wine', 'other')).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('give none when the index can’t be reached, and try again next time', async () => {
    const { titleHits, fetch } = await load({});
    expect(await titleHits('tatooine', undefined)).toEqual([]);
    expect(await titleHits('tatooine', undefined)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('give none for a query without a word, or a word no shard has, without fetching', async () => {
    const { titleHits, fetch } = await load({
      '/search-titles/index.json': { split: [], keys: ['tat'] },
    });
    expect(await titleHits('--', undefined)).toEqual([]);
    expect(await titleHits('zzq', undefined)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('merging', () => {
  const hit = (url: string): Hit => ({ url, title: url, kind: undefined, excerpt: [] });

  it('puts title hits first and drops Pagefind’s copies of them', () => {
    const merged = mergeHits(
      [{ url: '/planets/tatooine/', title: 'Tatooine', kind: 'planets' }],
      [hit('/other/tatooine-wine/'), hit('/planets/tatooine/')],
    );
    expect(merged.map((h) => h.url)).toEqual(['/planets/tatooine/', '/other/tatooine-wine/']);
    expect(merged[0]?.excerpt).toEqual([]);
  });

  it('keeps to twenty results', () => {
    const many = Array.from({ length: 30 }, (_, i) => hit(`/other/${String(i)}/`));
    expect(mergeHits([], many)).toHaveLength(20);
  });
});
