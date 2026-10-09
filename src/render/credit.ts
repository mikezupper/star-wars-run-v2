// The credit line for a page built from a Wookieepedia article: the source article, the
// license, and a note that the text was changed (CC BY-SA 3.0's three conditions).
import { html } from '@gyral/core';
import { CC_BY_SA_3, wookieepediaUrl } from '../domain/attribution.js';
import { CREDIT } from '../labels.js';

export const creditLine = (title: string) =>
  html`<p>
    <small>
      ${CREDIT.before}
      <a href=${wookieepediaUrl(title)} rel="external">${CREDIT.article(title)}</a>,
      ${CREDIT.licensed} <a href=${CC_BY_SA_3} rel="license external">${CREDIT.license}</a>.
      ${CREDIT.modified}
    </small>
  </p>`;
