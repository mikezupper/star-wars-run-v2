import { describe, expect, it } from 'vitest';
import { summaryInformation } from '../../src/domain/ask-summary.js';

describe('compact summary data', () => {
  it('counts the whole list and gives at most three example subjects', () => {
    const rows = Array.from({ length: 40 }, (_, n) => [
      `Pilot ${String(n)}`,
      `/characters/pilot-${String(n)}/`,
      'canon',
    ]);
    const data = summaryInformation(['name', 'path', 'era'], rows, false);
    expect(data).toMatchObject({ kind: 'subjects', count: 40, countIsLowerBound: false });
    expect(data.examples).toEqual(
      rows.slice(0, 3).map(([name]) => ({ name, continuities: ['canon'] })),
    );
    expect(JSON.stringify(data)).not.toContain('Pilot 3');
    expect(JSON.stringify(data)).not.toContain('/characters/');
  });

  it('uses the table’s twin grouping and canonical name, even when names differ', () => {
    const data = summaryInformation(
      ['name', 'path', 'era', 'pair'],
      [
        ['Palpatine', '/characters/palpatine-legends/', 'legends', '/characters/darth-sidious/'],
        ['Darth Sidious', '/characters/darth-sidious/', 'canon', '/characters/darth-sidious/'],
        ['Yoda', '/characters/yoda/', 'canon', '/characters/yoda/'],
      ],
      true,
    );
    expect(data).toEqual({
      kind: 'subjects',
      count: 2,
      countIsLowerBound: true,
      examples: [
        { name: 'Darth Sidious', continuities: ['canon', 'legends'] },
        { name: 'Yoda', continuities: ['canon'] },
      ],
    });
  });

  it('keeps differing fact values apart, just as the table does', () => {
    expect(
      summaryInformation(
        ['name', 'era', 'height_m'],
        [
          ['Luke', 'canon', 1.72],
          ['Luke', 'legends', 1.73],
        ],
        false,
      ),
    ).toMatchObject({
      count: 2,
      examples: [
        { name: 'Luke', height_m: 1.72 },
        { name: 'Luke', height_m: 1.73 },
      ],
    });
  });

  it('preserves scalar counts, large integers, categories and every aggregate value', () => {
    expect(summaryInformation(['count'], [[227272n]], false)).toEqual({
      kind: 'values',
      truncated: false,
      values: [{ count: 227272 }],
    });
    expect(summaryInformation(['count'], [[9007199254740993n]], false)).toMatchObject({
      values: [{ count: '9007199254740993' }],
    });
    const rows = Array.from({ length: 30 }, (_, n) => [n % 2 === 0 ? 'canon' : 'legends', n]);
    expect(summaryInformation(['era', 'count'], rows, true)).toEqual({
      kind: 'values',
      truncated: true,
      values: rows.map(([era, count]) => ({ era, count })),
    });
    expect(
      summaryInformation(['species', 'path'], [["Yoda's species", '/species/yoda/']], false),
    ).toMatchObject({ values: [{ species: "Yoda's species" }] });
  });

  it('distinguishes an empty subject list from empty values', () => {
    expect(summaryInformation(['name'], [], false)).toMatchObject({ count: 0, examples: [] });
    expect(summaryInformation(['count'], [], false)).toMatchObject({ values: [] });
  });
});
