// How field values read on a page: numbers with separators and units, counts and ranges,
// dates, lists. Machine-readable values go in <data value> and <time datetime>.
import { serverHtml } from '@gyral/ssr';
import type { Count } from '../domain/records.js';
import { ERAS, UNITS } from '../labels.js';

const numbers = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** `1,358 kg` as `<data value="1358">`. */
export const quantity = (value: number, unit?: string) =>
  serverHtml`<data value=${String(value)}>${numbers.format(value)}${unit === undefined ? '' : unit === UNITS.percent ? unit : ` ${unit}`}</data>`;

/** `2` or `30–165`. */
export const count = (c: Count) =>
  c.min === c.max
    ? quantity(c.min)
    : serverHtml`<data value=${`${String(c.min)}-${String(c.max)}`}>${numbers.format(c.min)}–${numbers.format(c.max)}</data>`;

const dates = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

/** `May 25, 1977` in `<time datetime="1977-05-25">`. */
export const date = (iso: string) =>
  serverHtml`<time datetime=${iso}>${dates.format(new Date(`${iso}T00:00:00Z`))}</time>`;

/** `blond, grey` → `Blond, grey`. */
export const list = (items: readonly string[]): string => {
  const text = items.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** A single text value, capitalised: `male` → `Male`. */
export const text = (value: string): string => list([value]);

const ROMAN: readonly [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Episode numbers as the films write them: 4 → `IV`. */
export function roman(n: number): string {
  let rest = n;
  let out = '';
  for (const [value, numeral] of ROMAN) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

/**
 * An in-universe year with its era spelled out for readers who don't know it:
 * `19BBY` → `19<abbr title="Before the Battle of Yavin">BBY</abbr>`. Other text passes through.
 */
export const year = (value: string) => {
  const match = /^(\d+(?:\.\d+)?)(BBY|ABY)$/.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) return value;
  const era = match[2] as keyof typeof ERAS;
  return serverHtml`${match[1]}<abbr title=${ERAS[era]}>${era}</abbr>`;
};
