// Attribution for Wookieepedia-derived content (CONTENT-LICENSE.md, ADR 0007): where each
// article lives on Wookieepedia, and the license its text is under.

export const WOOKIEEPEDIA = 'https://starwars.fandom.com/wiki/';
export const CC_BY_SA_3 = 'https://creativecommons.org/licenses/by-sa/3.0/';

/**
 * The article's address on Wookieepedia, encoded as MediaWiki writes it: spaces become
 * underscores, and `:`, `/`, `,` and `@` stay readable (`Star_Wars:_Episode_IV_A_New_Hope`).
 */
export const wookieepediaUrl = (title: string): string =>
  WOOKIEEPEDIA +
  encodeURIComponent(title.replace(/ /g, '_'))
    .replace(/%3A/gi, ':')
    .replace(/%2F/gi, '/')
    .replace(/%2C/gi, ',')
    .replace(/%40/gi, '@');
