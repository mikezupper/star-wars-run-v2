// Scalar parsers for source strings. Each returns `undefined` for a value the source marks as
// missing, and throws for anything it doesn't recognise, so a new upstream format fails the
// ingest instead of reaching a page as nonsense.
import type { Count } from '../domain/records.js';

/** The ways swapi.info says "not known" or "doesn't apply". */
const MISSING = new Set(['unknown', 'n/a', 'none', '']);

/** Trimmed text, or `undefined` when the source marks it missing. */
export function parseText(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const text = raw.trim();
  return MISSING.has(text.toLowerCase()) ? undefined : text;
}

/** A comma-separated list (`"blue, grey"`), without missing markers or empty items. */
export function parseList(raw: string | null): readonly string[] {
  if (raw === null) return [];
  return raw
    .split(',')
    .map((item) => parseText(item))
    .filter((item): item is string => item !== undefined);
}

// Digits with optional thousands commas and decimals, and an optional unit the source
// sometimes appends (`"1000km"`).
const NUMBER = /^(-?\d[\d,]*(?:\.\d+)?)(?:\s*km)?$/;

/** A number written as a string: `"1,358"`, `"10.4 "`, `"0.9"`, `"1000km"`. */
export function parseNumber(raw: string): number | undefined {
  const text = parseText(raw);
  if (text === undefined) return undefined;
  const match = NUMBER.exec(text);
  if (match?.[1] === undefined) throw new Error(`not a number: ${JSON.stringify(raw)}`);
  return Number(match[1].replaceAll(',', ''));
}

/** A head count, exact (`"4"`) or a range (`"30-165"`). */
export function parseCount(raw: string): Count | undefined {
  const text = parseText(raw);
  if (text === undefined) return undefined;
  const [low, high, ...rest] = text.split('-');
  if (low === undefined || rest.length > 0) throw new Error(`not a count: ${JSON.stringify(raw)}`);
  const min = parseNumber(low);
  const max = high === undefined ? min : parseNumber(high);
  if (min === undefined || max === undefined || max < min) {
    throw new Error(`not a count: ${JSON.stringify(raw)}`);
  }
  return { min, max };
}

/** A species lifespan: a number of years, or `indefinite`. */
export function parseLifespan(raw: string): number | 'indefinite' | undefined {
  return raw.trim().toLowerCase() === 'indefinite' ? 'indefinite' : parseNumber(raw);
}

/** An ISO calendar date, `YYYY-MM-DD`, checked to be a real day. */
export function parseDate(raw: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : undefined;
  if (
    date === undefined ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== raw
  ) {
    throw new Error(`not a date: ${JSON.stringify(raw)}`);
  }
  return raw;
}

/**
 * `{ [key]: value }`, or `{}` when the value is missing. Spread it into a record so an
 * unknown field is absent rather than `undefined` (the tsconfig sets
 * exactOptionalPropertyTypes).
 */
export const optional = <K extends string, V>(
  key: K,
  value: V | undefined,
): Partial<Record<K, V>> => (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;
