import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  optional,
  parseCount,
  parseDate,
  parseLifespan,
  parseList,
  parseNumber,
  parseText,
} from '../../src/ingest/values.js';

const MISSING = ['unknown', 'n/a', 'N/A', 'none', 'None', '', '  '];

describe('parseText', () => {
  it.each(MISSING)('treats %j as missing', (raw) => {
    expect(parseText(raw)).toBeUndefined();
  });

  it('treats null as missing and trims everything else', () => {
    expect(parseText(null)).toBeUndefined();
    expect(parseText('  Galactic Basic ')).toBe('Galactic Basic');
  });
});

describe('parseList', () => {
  it('splits on commas and drops missing markers', () => {
    expect(parseList('blond, n/a')).toEqual(['blond']);
    expect(parseList('none')).toEqual([]);
    expect(parseList(null)).toEqual([]);
  });

  it('never returns an empty, untrimmed or missing-marker item', () => {
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.string(), fc.constantFrom(...MISSING))), (items) => {
        for (const item of parseList(items.join(','))) {
          expect(item).toBe(item.trim());
          expect(parseText(item)).toBe(item);
        }
      }),
    );
  });
});

describe('parseNumber', () => {
  it.each([
    ['172', 172],
    ['1,358', 1358],
    ['10.4 ', 10.4],
    ['0.9', 0.9],
    ['1000km', 1000],
    ['unknown', undefined],
    ['n/a', undefined],
  ])('reads %j as %j', (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });

  it.each(['1.5 (surface)', 'twelve', '1e3', '30-165'])('rejects %j', (raw) => {
    expect(() => parseNumber(raw)).toThrow(/not a number/);
  });

  it('reads back any non-negative integer written with thousands separators', () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        expect(parseNumber(n.toLocaleString('en-US'))).toBe(n);
      }),
    );
  });
});

describe('parseCount', () => {
  it('reads exact counts and ranges', () => {
    expect(parseCount('4')).toEqual({ min: 4, max: 4 });
    expect(parseCount('279,144')).toEqual({ min: 279144, max: 279144 });
    expect(parseCount('30-165')).toEqual({ min: 30, max: 165 });
    expect(parseCount('unknown')).toBeUndefined();
  });

  it.each(['165-30', '1-2-3', '-', '5-unknown'])('rejects %j', (raw) => {
    expect(() => parseCount(raw)).toThrow(/not a count/);
  });

  it('reads any ordered range', () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (a, b) => {
        const [min, max] = a <= b ? [a, b] : [b, a];
        expect(parseCount(`${String(min)}-${String(max)}`)).toEqual({ min, max });
      }),
    );
  });
});

describe('parseLifespan', () => {
  it('reads years or indefinite', () => {
    expect(parseLifespan('indefinite')).toBe('indefinite');
    expect(parseLifespan('1000')).toBe(1000);
    expect(parseLifespan('unknown')).toBeUndefined();
  });
});

describe('parseDate', () => {
  it('accepts real ISO dates', () => {
    expect(parseDate('1977-05-25')).toBe('1977-05-25');
  });

  it.each(['1977-02-30', '25/05/1977', '1977-5-25', ''])('rejects %j', (raw) => {
    expect(() => parseDate(raw)).toThrow(/not a date/);
  });
});

describe('optional', () => {
  it('omits the key when the value is missing', () => {
    expect(optional('height', undefined)).toEqual({});
    expect('height' in optional('height', undefined)).toBe(false);
    expect(optional('height', 0)).toEqual({ height: 0 });
  });
});
