// The best-known subjects among some articles: the most-linked first, one row per subject, so a
// canon article and its Legends twin count once (Darth Sidious and Palpatine too). The home,
// section and letter pages rank this way (ADR 0004, "The look").
import { displayTitle, type Archive, type Entry } from './archive.js';
import type { LinkGraph } from './links.js';
import type { Section } from './sections.js';

/** A subject: its articles here (canon first), its name, and the more-linked article's count. */
export interface Known {
  readonly name: string;
  readonly entries: readonly Entry[];
  readonly links: number;
}

/** Which continuities a subject's articles here are in. */
export const eraOf = (known: Known): 'canon' | 'legends' | 'both' => {
  const eras = new Set(known.entries.map((e) => e.era));
  return eras.size > 1 ? 'both' : (known.entries[0]?.era ?? 'canon');
};

/**
 * The `count` best-known subjects among `entries`. Twins group under the canon article; the row
 * takes the canon name when the canon article is among `entries`, else its own (Palpatine on the
 * P page, not Darth Sidious).
 */
export function rankKnown(
  entries: Iterable<Entry>,
  archive: Archive,
  links: LinkGraph,
  count: number,
): Known[] {
  const groups = new Map<string, { entries: Entry[]; links: number }>();
  for (const entry of entries) {
    const twin = entry.twin === undefined ? undefined : archive.byTitle.get(entry.twin);
    const key = entry.era === 'canon' || twin === undefined ? entry.title : twin.title;
    const group = groups.get(key) ?? { entries: [], links: 0 };
    group.entries.push(entry);
    group.links = Math.max(group.links, links.counts.get(entry.title) ?? 0);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((g) => g.links > 0)
    .map((g) => {
      const sorted = g.entries.sort((a, b) => (a.era === b.era ? 0 : a.era === 'canon' ? -1 : 1));
      return { name: displayTitle(sorted[0]?.title ?? ''), entries: sorted, links: g.links };
    })
    .sort((a, b) => b.links - a.links || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, count);
}

/** A section's best-known subjects. */
export const bestKnown = (
  archive: Archive,
  links: LinkGraph,
  section: Section,
  count = 12,
): Known[] => rankKnown(archive.bySection.get(section) ?? [], archive, links, count);
