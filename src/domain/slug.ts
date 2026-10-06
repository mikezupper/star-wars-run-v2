/** A URL-safe name, unique within its section: `luke-skywalker`. Made only by `toSlug()`. */
export type Slug = string & { readonly __brand: 'Slug' };

/**
 * A readable URL segment for a name: lower case ASCII letters and digits joined by single
 * hyphens. Accents are dropped, not the letters under them (`Padmé Amidala` →
 * `padme-amidala`). Throws if nothing usable is left, because an article must have a page.
 */
export function toSlug(name: string): Slug {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug === '') throw new Error(`no slug can be made from the name ${JSON.stringify(name)}`);
  return slug as Slug;
}
