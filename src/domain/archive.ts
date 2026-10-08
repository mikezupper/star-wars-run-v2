// The archive's address book (ADR 0008): every article's section, slug, URL and list letter,
// and the reverse lookup a link needs (title → URL). Pure: built from article summaries, so
// the same snapshot always gives the same URLs.
import { SECTIONS, sectionOf, type Section } from './sections.js';
import { toSlug } from './slug.js';

export interface Summary {
  readonly title: string;
  readonly era: 'canon' | 'legends';
  readonly kind?: string;
  /** Its twin in the other continuity, when Wookieepedia names one (src/domain/article.ts). */
  readonly counterpart?: string;
}

export interface Entry extends Summary {
  /**
   * The same subject's article in the other continuity, when the archive has both: the named
   * counterpart (either side may name it), else `X` and `X/Legends`. Always mutual.
   */
  readonly twin?: string;
  readonly section: Section;
  readonly slug: string;
  /** `/characters/luke-skywalker/` */
  readonly path: string;
  /** The list page the article is on: `a`–`z`, or `0` for anything else. */
  readonly letter: string;
}

export interface Archive {
  /** Every entry, by title. */
  readonly byTitle: ReadonlyMap<string, Entry>;
  /** Entries per section, sorted by title. */
  readonly bySection: ReadonlyMap<Section, readonly Entry[]>;
  /** The URL of a title's page, or `undefined` when the archive doesn't have it. */
  pathOf(title: string): string | undefined;
}

export const sectionPath = (section: Section): string => `/${section}/`;
export const letterPath = (section: Section, letter: string): string => `/${section}/${letter}/`;

/** The list letter for a slug: its first letter, or `0` for digits and symbols. */
export const letterOf = (slug: string): string => (/^[a-z]/.test(slug) ? slug.charAt(0) : '0');

/** A title's slug, or a fallback for titles with no Latin letters or digits. */
const slugFor = (title: string): string => {
  try {
    return toSlug(title);
  } catch {
    return 'article';
  }
};

/**
 * Builds the archive. Slugs are unique within a section; when two titles slug the same way
 * (`C-3PO` and `C3PO`?), the later title in code-unit order gets `-2`, `-3`… so the result
 * depends only on the set of titles.
 */
export function buildArchive(summaries: Iterable<Summary>): Archive {
  const sorted = [...summaries].sort((a, b) =>
    a.title < b.title ? -1 : a.title > b.title ? 1 : 0,
  );
  const twins = pairTwins(sorted);
  const byTitle = new Map<string, Entry>();
  const taken = new Map<Section, Set<string>>(SECTIONS.map((s) => [s, new Set()]));
  const bySection = new Map<Section, Entry[]>(SECTIONS.map((s) => [s, []]));
  for (const summary of sorted) {
    const section = sectionOf(summary.kind);
    const used = taken.get(section) ?? new Set<string>();
    const base = slugFor(summary.title);
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${String(n)}`;
    used.add(slug);
    const twin = twins.get(summary.title);
    const entry: Entry = {
      ...summary,
      ...(twin === undefined ? {} : { twin }),
      section,
      slug,
      path: `/${section}/${slug}/`,
      letter: letterOf(slug),
    };
    byTitle.set(summary.title, entry);
    bySection.get(section)?.push(entry);
  }
  return { byTitle, bySection, pathOf: (title) => byTitle.get(title)?.path };
}

/**
 * Canon and Legends twins, both ways. Named counterparts first (either article may name the
 * other; the pair must be one canon and one Legends article, each in no other pair), then the
 * default pairing of `X` with `X/Legends` for what's left.
 */
function pairTwins(summaries: readonly Summary[]): Map<string, string> {
  const byTitle = new Map(summaries.map((s) => [s.title, s]));
  const twins = new Map<string, string>();
  const pair = (a: Summary, b: Summary | undefined) => {
    if (b === undefined || a.era === b.era || twins.has(a.title) || twins.has(b.title)) return;
    twins.set(a.title, b.title);
    twins.set(b.title, a.title);
  };
  for (const s of summaries) {
    if (s.counterpart !== undefined) pair(s, byTitle.get(s.counterpart));
  }
  for (const s of summaries) {
    if (s.era === 'canon') pair(s, byTitle.get(`${s.title}/Legends`));
  }
  return twins;
}

/** A smaller archive: the first `perSection` articles of each section (the gate's sample build). */
export function sampleSummaries(summaries: Iterable<Summary>, perSection: number): Summary[] {
  const archive = buildArchive(summaries);
  return SECTIONS.flatMap((s) => (archive.bySection.get(s) ?? []).slice(0, perSection)).map(
    ({ title, era, kind }) => ({ title, era, ...(kind === undefined ? {} : { kind }) }),
  );
}

/** How a title reads on its page: without the `/Legends` suffix (the page says Legends). */
export const displayTitle = (title: string): string => title.replace(/\/Legends$/, '');
