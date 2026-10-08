import { describe, expect, it } from 'vitest';
import { buildArchive, type Summary } from '../../src/domain/archive.js';

const twinOf = (summaries: Summary[], title: string) =>
  buildArchive(summaries).byTitle.get(title)?.twin;

describe('canon and Legends twins', () => {
  it('pair X with X/Legends by default, both ways', () => {
    const archive = [
      { title: 'Luke Skywalker', era: 'canon' },
      { title: 'Luke Skywalker/Legends', era: 'legends' },
      { title: 'Hoth', era: 'canon' },
    ] as const satisfies Summary[];
    expect(twinOf([...archive], 'Luke Skywalker')).toBe('Luke Skywalker/Legends');
    expect(twinOf([...archive], 'Luke Skywalker/Legends')).toBe('Luke Skywalker');
    expect(twinOf([...archive], 'Hoth')).toBeUndefined();
  });

  it('pair named counterparts, from either side, before the default', () => {
    const fromCanon: Summary[] = [
      { title: 'Darth Sidious', era: 'canon', counterpart: 'Palpatine' },
      { title: 'Palpatine', era: 'legends' },
    ];
    expect(twinOf(fromCanon, 'Palpatine')).toBe('Darth Sidious');
    const fromLegends: Summary[] = [
      { title: 'Darth Sidious', era: 'canon' },
      { title: 'Palpatine', era: 'legends', counterpart: 'Darth Sidious' },
      { title: 'Darth Sidious/Legends', era: 'legends' },
    ];
    expect(twinOf(fromLegends, 'Darth Sidious')).toBe('Palpatine');
    expect(twinOf(fromLegends, 'Darth Sidious/Legends')).toBeUndefined();
  });

  it('never pair two articles of the same continuity, or a counterpart the archive lacks', () => {
    const odd: Summary[] = [
      { title: 'A', era: 'canon', counterpart: 'B' },
      { title: 'B', era: 'canon' },
      { title: 'C', era: 'legends', counterpart: 'Nowhere' },
    ];
    expect(twinOf(odd, 'A')).toBeUndefined();
    expect(twinOf(odd, 'C')).toBeUndefined();
  });
});
