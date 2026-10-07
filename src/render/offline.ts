// /offline/: what the service worker shows for a page that was never saved and can't be
// fetched (docs/product-specs/offline.md). Precached on install. Not in the sitemap and not
// indexed: it's only ever seen without a network.
import { html } from '@gyral/core';
import { sectionPath } from '../domain/archive.js';
import { SECTIONS } from '../domain/sections.js';
import { SECTION_LABELS, TEXT } from '../labels.js';
import type { PageMeta } from './layout.js';

export const offlineMeta: PageMeta = {
  path: '/offline/',
  title: TEXT.offlineTitle,
  description: TEXT.offlineBody,
  noindex: true,
};

export const offlineBody = () => html`
  <h1>${TEXT.offlineTitle}</h1>
  <p>${TEXT.offlineBody}</p>
  <ul>
    <li><a href="/">${TEXT.notFoundHome}</a></li>
    <li><a href="/search/">${TEXT.searchTitle}</a></li>
    ${SECTIONS.map((s) => html`<li><a href=${sectionPath(s)}>${SECTION_LABELS[s].plural}</a></li>`)}
  </ul>
`;
