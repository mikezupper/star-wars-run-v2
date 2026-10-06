// The archive's address book (ADR 0008): every article's section, slug, URL and list letter,
// and the reverse lookup a link needs (title → URL). Pure: built from article summaries, so
// the same snapshot always gives the same URLs.
import { SECTIONS, sectionOf, type Section } from './sections.js';
import { toSlug } from './slug.js';

export interface Summary {
  readonly title: string;
  readonly era: 'canon' | 'legends';
  readonly kind?: string;
}

export interface Entry extends Summary {
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
    const entry: Entry = {
      ...summary,
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

/** A smaller archive: the first `perSection` articles of each section (the gate's sample build). */
export function sampleSummaries(summaries: Iterable<Summary>, perSection: number): Summary[] {
  const archive = buildArchive(summaries);
  return SECTIONS.flatMap((s) => (archive.bySection.get(s) ?? []).slice(0, perSection)).map(
    ({ title, era, kind }) => ({ title, era, ...(kind === undefined ? {} : { kind }) }),
  );
}

/** How a title reads on its page: without the `/Legends` suffix (the page says Legends). */
export const displayTitle = (title: string): string => title.replace(/\/Legends$/, '');
