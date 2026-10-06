import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseQuantity, quantities } from '../../src/domain/quantities.js';
import { fixtureSiteData } from '../fixtures/archive.js';

describe('parseQuantity', () => {
  it.each([
    ['1.72 meters (5 ft, 8 in)', 'meters', { value: 1.72 }],
    ['73 kilograms', 'kilograms', { value: 73 }],
    ['158 pounds', 'kilograms', { value: 158 * 0.45359237 }],
    ['120 kilograms in armor', 'kilograms', { value: 120 }],
    ['12,928 km', 'kilometers', { value: 12928 }],
    ['1,830 meters', 'meters', { value: 1830 }],
    ['174.2 billion', 'count', { value: 174.2e9 }],
    ['11,300,000 (approx.)', 'count', { value: 11.3e6, approx: true }],
    ['Pilot (1)', 'count', { value: 1 }],
    ['4 operators', 'count', { value: 4 }],
    ['6 or 7', 'count', { value: 6, max: 7 }],
    ['20 to 30 meters', 'meters', { value: 20, max: 30 }],
    ['1.5—2 meters', 'meters', { value: 1.5, max: 2 }],
    ['Nearly 1 meter', 'meters', { value: 1, approx: true }],
    ['3,000 credits', 'credits', { value: 3000 }],
    ['1,000 KMH', 'kph', { value: 1000 }],
    ['800 km/h', 'kph', { value: 800 }],
    ['75 MGLT', 'mglt', { value: 75 }],
    ['Class 1.0', 'class', { value: 1 }],
    ['24 standard hours', 'hours', { value: 24 }],
    ['304 standard days', 'days', { value: 304 }],
  ] as const)('%j as %s → %j', (text, dimension, expected) => {
    const q = parseQuantity(text, dimension);
    expect(q?.value).toBeCloseTo(expected.value, 6);
    expect(q?.max).toBe('max' in expected ? expected.max : undefined);
    expect(q?.approx).toBe('approx' in expected ? expected.approx : undefined);
  });

  it.each([
    ['Tall', 'meters'],
    ['4:33', 'meters'],
    ['Over twenty million', 'count'],
    ['Equipped', 'class'],
    ['364 local days', 'days'],
    ['1,000 parsecs', 'meters'],
    ['5 apples', 'credits'],
    ['30-10 meters', 'meters'],
    ['1,83 meters', 'meters'],
    ['2,5 million', 'count'],
    ['1,9 meters', 'meters'],
  ] as const)('leaves %j as %s alone', (text, dimension) => {
    expect(parseQuantity(text, dimension)).toBeUndefined();
  });

  it('reads back any number with thousands separators and a unit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e12 }), (n) => {
        expect(parseQuantity(`${n.toLocaleString('en-US')} meters`, 'meters')?.value).toBe(n);
        expect(parseQuantity(`${n.toLocaleString('en-US')} credits`, 'credits')?.value).toBe(n);
      }),
    );
  });

  it('never throws, whatever the text', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom('meters', 'count', 'kph', 'class', 'days' as const),
        (text, d) => {
          expect(() => parseQuantity(text, d)).not.toThrow();
        },
      ),
    );
  });
});

describe('quantities', () => {
  it("reads Luke's height and mass from his real infobox", () => {
    const luke = fixtureSiteData().articles.get('Luke Skywalker');
    expect(luke && quantities(luke)).toMatchObject({
      height_m: { value: 1.72 },
      mass_kg: { value: 73 },
    });
  });

  it('takes the first field that feeds a column, and its first item', () => {
    expect(
      quantities({
        fields: [
          { name: 'Weight', items: [[{ text: '5 kg' }], [{ text: '9 kg' }]] },
          { name: 'mass', items: [[{ text: '7 kg' }]] },
          { name: 'hair', items: [[{ text: 'Blond' }]] },
        ],
      }),
    ).toEqual({ mass_kg: { value: 5 } });
  });
});
