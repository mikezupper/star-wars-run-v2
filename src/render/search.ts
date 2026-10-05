// /search/: the results page the header form submits to. The island does the searching in the
// browser (src/islands/site-search.ts); without JavaScript it links to each section instead.
// Not in the sitemap and not indexed: a results page has no content of its own.
import { serverHtml } from '@gyral/ssr';
import { TEXT } from '../labels.js';
import type { PageMeta } from './layout.js';
import '../islands/site-search.js'; // registers <swr-site-search> for server rendering

export const searchMeta: PageMeta = {
  path: '/search/',
  title: TEXT.searchTitle,
  description: TEXT.searchDescription,
  islands: true,
  noindex: true,
};

export const searchBody = () => serverHtml`
  <h1>${TEXT.searchTitle}</h1>
  <swr-site-search></swr-site-search>
`;
