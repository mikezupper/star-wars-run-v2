// A Wookieepedia article as the site uses it: written by the ingest
// (src/ingest/wookieepedia/), read by the build. Values are "rich text": plain runs and links
// to other articles by title.

/** A run of text, or a run of text linking to another article by its title. */
export type Run = { readonly text: string } | { readonly text: string; readonly link: string };

/** Text with links. */
export type Rich = readonly Run[];

/** One infobox field: one item, or several when the source lists them. */
export interface Field {
  readonly name: string;
  readonly items: readonly Rich[];
}

export interface ParsedArticle {
  readonly era: 'canon' | 'legends';
  /** The infobox template's name, e.g. `Character`, `CelestialBody`; absent without one. */
  readonly kind?: string;
  readonly fields: readonly Field[];
  /** The paragraphs before the first heading. */
  readonly lead: readonly Rich[];
}

/** One article in the snapshot. */
export interface ArticleRecord extends ParsedArticle {
  readonly title: string;
}
