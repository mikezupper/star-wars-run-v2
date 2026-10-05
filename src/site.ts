// Facts about the site that more than one page needs. One source, so the head tags, the
// sitemap and (later) the header and footer can't disagree.

/** The canonical origin. */
export const ORIGIN = 'https://starwars.run';

export const SITE_NAME = 'starwars.run';

export const DESCRIPTION =
  'An archive of the Star Wars saga, Episodes I to VI: every film, character, planet, species, vehicle and starship, searchable and linked to each other.';

/** An absolute URL on the canonical origin. */
export const absolute = (path: string): string => new URL(path, ORIGIN).href;
