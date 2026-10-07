// Reading rendered HTML in tests without depending on how the renderer writes it: attribute
// order isn't part of HTML's meaning (Gyral 0.3 writes static attributes before dynamic ones).

export interface Link {
  readonly href?: string;
  readonly rel?: string;
  readonly text: string;
}

const attributes = (source: string): Record<string, string> =>
  Object.fromEntries(
    [...source.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)].map((m) => [m[1] ?? '', m[2] ?? '']),
  );

/** Every `<a>` in the page: its attributes and its text, tags stripped. */
export const links = (html: string): Link[] =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    ...attributes(m[1] ?? ''),
    text: (m[2] ?? '').replace(/<[^>]*>/g, ''),
  }));

/** The first link to `href`, if the page has one. */
export const linkTo = (html: string, href: string): Link | undefined =>
  links(html).find((l) => l.href === href);
