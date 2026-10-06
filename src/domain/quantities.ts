// Numbers from infobox text (swr-7f1.14, ADR 0008): "1.72 meters (5 ft, 8 in)" → 1.72 m. The
// text stays what pages show; these values are for querying (the Explore page). A value is read
// only when its shape is clear: the first number, an optional multiplier word, and a unit the
// quantity accepts. Anything else is left out, never guessed.
import type { ArticleRecord, Rich } from './article.js';

/** A parsed value in the quantity's base unit. `max` is set for ranges ("20 to 30 meters"). */
export interface Quantity {
  readonly value: number;
  readonly max?: number;
  /** "Nearly", "about", "approx.", "up to", "over"… */
  readonly approx?: boolean;
}

type Units = Readonly<Record<string, number>>;

/** Each queryable quantity: its base unit, the units it accepts, and whether a unit is required. */
const DIMENSIONS = {
  meters: {
    units: {
      m: 1,
      meter: 1,
      meters: 1,
      metre: 1,
      metres: 1,
      cm: 0.01,
      centimeter: 0.01,
      centimeters: 0.01,
      mm: 0.001,
      millimeters: 0.001,
      km: 1000,
      kilometer: 1000,
      kilometers: 1000,
      ft: 0.3048,
      foot: 0.3048,
      feet: 0.3048,
      in: 0.0254,
      inch: 0.0254,
      inches: 0.0254,
    } satisfies Units,
    unitRequired: true,
  },
  kilometers: {
    units: {
      km: 1,
      kilometer: 1,
      kilometers: 1,
      m: 0.001,
      meter: 0.001,
      meters: 0.001,
    } satisfies Units,
    unitRequired: true,
  },
  kilograms: {
    units: {
      kg: 1,
      kilogram: 1,
      kilograms: 1,
      g: 0.001,
      gram: 0.001,
      grams: 0.001,
      ton: 1000,
      tons: 1000,
      tonne: 1000,
      tonnes: 1000,
      'metric tons': 1000,
      'metric tonnes': 1000,
      pounds: 0.45359237,
      pound: 0.45359237,
      lbs: 0.45359237,
      lb: 0.45359237,
    } satisfies Units,
    unitRequired: true,
  },
  count: { units: {} satisfies Units, unitRequired: false },
  credits: { units: { credit: 1, credits: 1, cr: 1 } satisfies Units, unitRequired: false },
  kph: {
    units: { kph: 1, kmh: 1, 'km/h': 1, 'kilometers per hour': 1, kilometres: 1 } satisfies Units,
    unitRequired: true,
  },
  mglt: { units: { mglt: 1 } satisfies Units, unitRequired: false },
  class: { units: {} satisfies Units, unitRequired: false },
  hours: {
    units: {
      'standard hours': 1,
      'standard hour': 1,
      'standard-hours': 1,
      hours: 1,
      hour: 1,
    } satisfies Units,
    unitRequired: true,
  },
  days: { units: { 'standard days': 1, days: 1, day: 1 } satisfies Units, unitRequired: true },
} as const;

type Dimension = keyof typeof DIMENSIONS;

/** Infobox field → the query column it feeds and its dimension. Several fields can feed one. */
export const QUANTITY_FIELDS: Readonly<
  Record<string, { readonly key: string; readonly dimension: Dimension }>
> = {
  height: { key: 'height_m', dimension: 'meters' },
  length: { key: 'length_m', dimension: 'meters' },
  wingspan: { key: 'wingspan_m', dimension: 'meters' },
  depth: { key: 'depth_m', dimension: 'meters' },
  diameter: { key: 'diameter_km', dimension: 'kilometers' },
  mass: { key: 'mass_kg', dimension: 'kilograms' },
  weight: { key: 'mass_kg', dimension: 'kilograms' },
  population: { key: 'population', dimension: 'count' },
  crew: { key: 'crew', dimension: 'count' },
  passengers: { key: 'passengers', dimension: 'count' },
  cost: { key: 'cost_credits', dimension: 'credits' },
  'max speed': { key: 'max_speed_kph', dimension: 'kph' },
  mglt: { key: 'mglt', dimension: 'mglt' },
  hyperdrive: { key: 'hyperdrive_class', dimension: 'class' },
  lengthday: { key: 'day_hours', dimension: 'hours' },
  lengthyear: { key: 'year_days', dimension: 'days' },
};

const MULTIPLIERS: Readonly<Record<string, number>> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
  quadrillion: 1e15,
};

const APPROX =
  /^(?:nearly|about|around|approximately|approx\.?|roughly|over|more than|up to|under|less than|almost|at least|at most|c\.|ca\.|~)\s+/i;
const NUMBER = String.raw`\d[\d,]*(?:\.\d+)?`;

const toNumber = (text: string): number => Number(text.replaceAll(',', ''));

/**
 * One value's text → a quantity in the dimension's base unit, or `undefined`.
 * Accepts "1.72 meters", "1,000 KMH", "174.2 billion", "Class 1.0", "20 to 30 meters",
 * "Nearly 1 meter", "11,300,000 (approx.)".
 */
export function parseQuantity(text: string, dimension: Dimension): Quantity | undefined {
  const spec = DIMENSIONS[dimension];
  let rest = text.trim();
  let approx = /\(approx|\bestimated\b/i.test(rest);
  // Head counts written as a role: "Pilot (1)", "Crew (5)".
  if (dimension === 'count') rest = rest.replace(/^[a-z][a-z ]*\((\d[\d,]*)\)/i, '$1');
  const qualifier = APPROX.exec(rest);
  if (qualifier !== null) {
    approx = true;
    rest = rest.slice(qualifier[0].length);
  }
  if (dimension === 'class') rest = rest.replace(/^class\s+/i, '');
  const match = new RegExp(
    String.raw`^(${NUMBER})(?:\s*(?:-|–|—|to|or)\s*(${NUMBER}))?\s*(${Object.keys(MULTIPLIERS).join('|')})?\s*`,
    'i',
  ).exec(rest);
  if (match?.[1] === undefined) return undefined;
  const after = rest.slice(match[0].length).toLowerCase();
  // The longest unit the dimension knows at the start of what follows ("kilograms in armor").
  const units: Units = spec.units;
  const unit = Object.keys(units)
    .sort((a, b) => b.length - a.length)
    .find((u) => after.startsWith(u) && !/^[a-z]/.test(after.slice(u.length)));
  let factor: number;
  if (unit !== undefined) {
    factor = units[unit] ?? 1;
  } else if (spec.unitRequired) {
    return undefined;
  } else if (dimension === 'count' || after === '' || /^[(,;:]/.test(after)) {
    // Counts may name what they count ("4 operators"); others take no unit at all.
    factor = 1;
  } else {
    return undefined;
  }
  const scale = MULTIPLIERS[(match[3] ?? '').toLowerCase()] ?? 1;
  const value = toNumber(match[1]) * scale * factor;
  const max = match[2] === undefined ? undefined : toNumber(match[2]) * scale * factor;
  if (!Number.isFinite(value) || (max !== undefined && (!Number.isFinite(max) || max < value))) {
    return undefined;
  }
  return {
    value,
    ...(max === undefined || max === value ? {} : { max }),
    ...(approx ? { approx } : {}),
  };
}

const plain = (rich: Rich): string => rich.map((r) => r.text).join('');

/** The article's queryable numbers, by column (`height_m`, `population`…), from its first item. */
export function quantities(
  article: Pick<ArticleRecord, 'fields'>,
): Readonly<Record<string, Quantity>> {
  const out: Record<string, Quantity> = {};
  for (const field of article.fields) {
    const target = QUANTITY_FIELDS[field.name.toLowerCase()];
    const first = field.items[0];
    if (target === undefined || first === undefined || target.key in out) continue;
    const q = parseQuantity(plain(first), target.dimension);
    if (q !== undefined) out[target.key] = q;
  }
  return out;
}
