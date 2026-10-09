import { describe, expect, it } from 'vitest';
import type { QueryResult } from '../../src/domain/query.js';
import { columnLabel, mergeEras } from '../../src/islands/explore-view.js';

const result = (columns: string[], rows: (string | number | null)[][]): QueryResult => ({
  columns,
  rows,
  truncated: false,
  ms: 1,
});

describe('Ask’s results', () => {
  it('fold canon and Legends into one row per name, linking the canon page first', () => {
    const merged = mergeEras(
      result(
        ['name', 'path', 'era'],
        [
          ['Yoda', '/characters/yoda-legends/', 'legends'],
          ['Yoda', '/characters/yoda/', 'canon'],
          ['Qui-Gon Jinn', '/characters/qui-gon-jinn/', 'canon'],
        ],
      ),
    );
    expect(merged.columns).toEqual(['name']);
    expect(merged.rows).toEqual([
      {
        cells: ['Yoda'],
        path: '/characters/yoda/',
        eras: [
          { era: 'canon', path: '/characters/yoda/' },
          { era: 'legends', path: '/characters/yoda-legends/' },
        ],
      },
      {
        cells: ['Qui-Gon Jinn'],
        path: '/characters/qui-gon-jinn/',
        eras: [{ era: 'canon', path: '/characters/qui-gon-jinn/' }],
      },
    ]);
  });

  it('fold twins with different names by their pair, under the canon name', () => {
    const merged = mergeEras({
      ...result(
        ['name', 'path', 'era', 'pair'],
        [
          ['Palpatine', '/characters/palpatine-legends/', 'legends', '/characters/darth-sidious/'],
          ['Darth Sidious', '/characters/darth-sidious/', 'canon', '/characters/darth-sidious/'],
          ['Yoda', '/characters/yoda/', 'canon', '/characters/yoda/'],
        ],
      ),
      extra: ['pair'],
    });
    expect(merged.columns).toEqual(['name']);
    expect(merged.rows.map((r) => [r.cells, r.path, r.eras.map((e) => e.era)])).toEqual([
      [['Darth Sidious'], '/characters/darth-sidious/', ['canon', 'legends']],
      [['Yoda'], '/characters/yoda/', ['canon']],
    ]);
  });

  it('keep rows apart when their values differ', () => {
    const merged = mergeEras(
      result(
        ['name', 'path', 'era', 'height_m'],
        [
          ['Luke Skywalker', '/characters/luke-skywalker/', 'canon', 1.72],
          ['Luke Skywalker', '/characters/luke-skywalker-legends/', 'legends', 1.73],
        ],
      ),
    );
    expect(merged.rows.map((r) => [r.cells, r.eras.map((e) => e.era)])).toEqual([
      [['Luke Skywalker', 1.72], ['canon']],
      [['Luke Skywalker', 1.73], ['legends']],
    ]);
  });

  it('pass rows through without an era column, and count rows as they are', () => {
    const merged = mergeEras(result(['count'], [[21]]));
    expect(merged).toEqual({ columns: ['count'], rows: [{ cells: [21], path: null, eras: [] }] });
  });

  it('label columns for readers', () => {
    expect(columnLabel('height_m')).toBe('Height (m)');
    expect(columnLabel('max_speed_kph')).toBe('Max speed (km/h)');
    expect(columnLabel('era')).toBe('Era');
  });
});
