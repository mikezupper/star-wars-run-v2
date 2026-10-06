// /explore/: SQL over the archive, in the browser (swr-7f1.7). The island loads DuckDB-WASM only
// when a query runs; without JavaScript the page links to the sections instead.
import { serverHtml } from '@gyral/ssr';
import { EXPLORE_TEXT, TEXT } from '../labels.js';
import { breadcrumb, type PageMeta } from './layout.js';
import '../islands/explore.js'; // registers <swr-explore> for server rendering

export const exploreMeta: PageMeta = {
  path: '/explore/',
  title: EXPLORE_TEXT.title,
  description: EXPLORE_TEXT.description,
  islands: true,
};

export const exploreBody = () => serverHtml`
  ${breadcrumb([{ href: '/', label: TEXT.home }], EXPLORE_TEXT.nav)}
  <h1>${EXPLORE_TEXT.title}</h1>
  <p>${EXPLORE_TEXT.intro}</p>
  <swr-explore></swr-explore>
  <section aria-labelledby="tables">
    <h2 id="tables">${EXPLORE_TEXT.tablesHeading}</h2>
    <ul>
      <li><code>${EXPLORE_TEXT.archiveTable}</code></li>
      <li><code>${EXPLORE_TEXT.factsTable}</code></li>
      <li><code>${EXPLORE_TEXT.appearancesTable}</code></li>
    </ul>
  </section>
`;
