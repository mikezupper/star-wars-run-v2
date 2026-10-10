// /search/: results rendered on the server (ADR 0011, swr-sgf.5), so search works without
// JavaScript, a results page can be shared, and Cloudflare caches each query. The form is a
// plain GET. Not in the sitemap and not indexed: a results page has no content of its own.
import { html, nothing } from '@gyral/core';
import { looksLikeQuestion } from '../domain/ask.js';
import { searchPath, type Result, type Results, type Run } from '../domain/search.js';
import { isSection, type Section } from '../domain/sections.js';
import '../islands/search.js';
import { SECTION_LABELS, TEXT } from '../labels.js';
import type { PageMeta } from './layout.js';

/** Search the archive: a query, and optionally one section, to results. */
export type SearchArchive = (query: string, section?: Section) => Results;

export const SEARCH_PATH = '/search/';

export const searchMeta: PageMeta = {
  path: SEARCH_PATH,
  title: TEXT.searchTitle,
  description: TEXT.searchDescription,
  noindex: true,
};

const excerpt = (runs: readonly Run[]) =>
  runs.length === 0
    ? nothing
    : html`<p>${runs.map((r) => (r.mark ? html`<mark>${r.text}</mark>` : r.text))}</p>`;

const result = (r: Result) =>
  html`<li>
    <a href=${r.path}>${r.name}</a>
    <small>
      ${SECTION_LABELS[r.section].one}
      ${r.eras.map(
        (e) =>
          html`<a href=${e.path} data-era=${e.era}
            >${e.era === 'legends' ? TEXT.legends : TEXT.canon}</a
          >`,
      )}
    </small>
    ${excerpt(r.excerpt)}
  </li>`;

function answer(found: Results, section?: Section) {
  const { query, results, didYouMean } = found;
  const ask = looksLikeQuestion(query)
    ? html`<p>
        <a href=${`/explore/?${new URLSearchParams({ ask: query }).toString()}`}
          >${TEXT.askInstead}</a
        >
      </p>`
    : nothing;
  if (results.length === 0) {
    return html`${ask}
      <p role="status">${TEXT.noResults(query)}</p>
      ${
        didYouMean === undefined
          ? nothing
          : html`<p>
              ${TEXT.didYouMean} <a href=${searchPath(didYouMean, section)}>${didYouMean}</a>?
            </p>`
      }`;
  }
  return html`${ask}
    <p role="status">${TEXT.resultCount(results.length, query)}</p>
    <ol aria-label=${TEXT.searchResults}>
      ${results.map(result)}
    </ol>`;
}

export const searchBody = (url: URL, search?: SearchArchive) => {
  const query = (url.searchParams.get('q') ?? '').trim();
  const asked = url.searchParams.get('section') ?? '';
  const section = isSection(asked) ? asked : undefined;
  return html`
    <h1>${TEXT.searchTitle}</h1>
    <swr-site-search full query=${query} section=${section ?? ''}></swr-site-search>
    ${
      query === ''
        ? html`<p>${TEXT.searchHint}</p>`
        : search === undefined
          ? html`<p role="status">${TEXT.searchUnavailable}</p>`
          : answer(search(query, section), section)
    }
  `;
};
