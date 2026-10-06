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

/**
 * One entry of an article's Appearances section. For a work (a film, an episode, a novel…), it's
 * someone or something that appears in it; for anything else, a work the subject appears in.
 * Either way, `markers` say how it appears.
 */
export interface Appearance {
  /** The entry as written. */
  readonly text: string;
  /** Its article, when the archive has it. */
  readonly link?: string;
  /**
   * How the subject appears, as Wookieepedia's marker codes: `1st` first appearance, `mo`
   * mentioned only, `1stm` first mentioned, `imo` indirect mention, `flash` flashback,
   * `hologram`, `po` picture only, `voice`, `vision`… Empty for an ordinary appearance.
   */
  readonly markers: readonly string[];
  /** Listed under a non-canon subheading. */
  readonly noncanon?: true;
}

export interface ParsedArticle {
  readonly era: 'canon' | 'legends';
  /** The infobox template's name, e.g. `Character`, `CelestialBody`; absent without one. */
  readonly kind?: string;
  readonly fields: readonly Field[];
  /** The paragraphs before the first heading. */
  readonly lead: readonly Rich[];
  /** The Appearances section, in its order (for a work, its cast; else, its works). */
  readonly appearances?: readonly Appearance[];
}

/** One article in the snapshot. */
export interface ArticleRecord extends ParsedArticle {
  readonly title: string;
}
