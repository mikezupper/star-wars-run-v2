// The home page. A placeholder until the data and page beads land (swr-3mo.4, swr-3mo.5);
// its copy is rewritten in the site voice by swr-3mo.8.
import { serverHtml } from '@gyral/ssr';
import { DESCRIPTION, SITE_NAME } from '../site.js';
import type { PageMeta } from './layout.js';

export const homeMeta: PageMeta = {
  path: '/',
  title: SITE_NAME,
  description: DESCRIPTION,
};

export const homeBody = () => serverHtml`
  <h1>${SITE_NAME}</h1>
  <p>${DESCRIPTION}</p>
`;
