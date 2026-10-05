import { renderToString } from '@gyral/ssr';
import { describe, expect, it } from 'vitest';
import { count, date, list, quantity, roman, text } from '../../src/render/format.js';

const render = async (value: unknown) =>
  (await renderToString(value)).replace(/<!--[^>]*-->|<\?>/g, '');

describe('format', () => {
  it('writes quantities with separators and units', async () => {
    expect(await render(quantity(1358, 'kg'))).toBe('<data value="1358">1,358 kg</data>');
    expect(await render(quantity(40, '%'))).toBe('<data value="40">40%</data>');
    expect(await render(quantity(0.5))).toBe('<data value="0.5">0.5</data>');
  });

  it('writes exact counts and ranges', async () => {
    expect(await render(count({ min: 4, max: 4 }))).toBe('<data value="4">4</data>');
    expect(await render(count({ min: 30, max: 165 }))).toBe('<data value="30-165">30–165</data>');
  });

  it('writes dates for people and machines', async () => {
    expect(await render(date('1980-05-17'))).toBe(
      '<time datetime="1980-05-17">May 17, 1980</time>',
    );
  });

  it('capitalises lists and single values', () => {
    expect(list(['blond', 'grey'])).toBe('Blond, grey');
    expect(text('male')).toBe('Male');
  });

  it('writes episode numbers as Roman numerals', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(roman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'IX']);
  });
});
