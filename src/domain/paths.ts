// The URL scheme: every page path ends with a slash and is built from slugs, never source ids
// (docs/design-docs/0002-data.md).
import type { Kind, Slug } from './records.js';

/** `/people/` */
export const kindPath = (kind: Kind): string => `/${kind}/`;

/** `/people/luke-skywalker/` */
export const recordPath = (kind: Kind, slug: Slug): string => `/${kind}/${slug}/`;
