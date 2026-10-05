// The home page: what the site is, and a way into each section.
import { serverHtml } from '@gyral/ssr';
import { kindPath } from '../domain/paths.js';
import { KINDS, type Dataset } from '../domain/records.js';
import { DESCRIPTION, SITE_NAME } from '../site.js';
import { KIND_LABELS, TEXT } from '../labels.js';
import type { PageMeta } from './layout.js';

export const homeMeta: PageMeta = {
  path: '/',
  title: SITE_NAME,
  description: DESCRIPTION,
};

export const homeBody = (data: Dataset) => serverHtml`
  <h1>${SITE_NAME}</h1>
  <p>${TEXT.homeIntro}</p>
  <ul>
    ${KINDS.map(
      (kind) => serverHtml`<li>
        <a href=${kindPath(kind)}>${KIND_LABELS[kind].plural}</a>
        <data value=${String(data[kind].length)}>${String(data[kind].length)}</data>
      </li>`,
    )}
  </ul>
`;
