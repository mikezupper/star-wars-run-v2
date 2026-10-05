// /offline/: what the service worker shows for a page that was never saved and can't be
// fetched (docs/product-specs/offline.md). Precached on install. Not in the sitemap and not
// indexed: it's only ever seen without a network.
import { serverHtml } from '@gyral/ssr';
import { kindPath } from '../domain/paths.js';
import { KINDS } from '../domain/records.js';
import { KIND_LABELS, TEXT } from '../labels.js';
import type { PageMeta } from './layout.js';

export const offlineMeta: PageMeta = {
  path: '/offline/',
  title: TEXT.offlineTitle,
  description: TEXT.offlineBody,
  noindex: true,
};

export const offlineBody = () => serverHtml`
  <h1>${TEXT.offlineTitle}</h1>
  <p>${TEXT.offlineBody}</p>
  <ul>
    <li><a href="/">${TEXT.notFoundHome}</a></li>
    <li><a href="/search/">${TEXT.searchTitle}</a></li>
    ${KINDS.map((kind) => serverHtml`<li><a href=${kindPath(kind)}>${KIND_LABELS[kind].plural}</a></li>`)}
  </ul>
`;
