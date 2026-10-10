// Small plain-text cards, built from parsed article records; never ship the whole record.
import type { ArticleRecord } from './article.js';
import { displayTitle, type Entry } from './archive.js';
import { isSection, type Section } from './sections.js';

export interface ArticlePreview {
  readonly name: string;
  readonly path: string;
  readonly section: Section;
  readonly era: 'canon' | 'legends';
  readonly lead: string;
  readonly facts: readonly { readonly name: string; readonly value: string }[];
}

/** Only canonical article paths: section, slug and trailing slash, with no query or hash. */
export function previewPath(href: string, origin: string): string | undefined {
  if (!URL.canParse(href, origin)) return undefined;
  const url = new URL(href, origin);
  const parts = url.pathname.split('/');
  return url.origin === origin &&
    url.search === '' &&
    url.hash === '' &&
    parts.length === 4 &&
    isSection(parts[1] ?? '') &&
    /^[a-z0-9-]+$/.test(parts[2] ?? '') &&
    parts[3] === ''
    ? url.pathname
    : undefined;
}

export function articlePreview(entry: Entry, article: ArticleRecord): ArticlePreview {
  const paragraph =
    article.lead[0]
      ?.map((r) => r.text)
      .join('')
      .trim() ?? '';
  const sentence = /[.!?](?:[”"']?)(?:\s|$)/.exec(paragraph);
  const lead = paragraph.slice(0, sentence === null ? 320 : Math.min(320, sentence.index + 1));
  return {
    name: displayTitle(entry.title),
    path: entry.path,
    section: entry.section,
    era: entry.era,
    lead:
      paragraph.length > lead.length && (sentence === null || sentence.index + 1 > 320)
        ? `${lead.trimEnd()}…`
        : lead,
    facts: article.fields
      .filter((f) => f.items.length > 0)
      .slice(0, 3)
      .map((f) => ({
        name: f.name,
        value: f.items
          .slice(0, 2)
          .map((item) => item.map((r) => r.text).join(''))
          .join(' · ')
          .slice(0, 160),
      })),
  };
}
