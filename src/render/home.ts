// The home page: what the archive is, and a way into each section.
import { html } from '@gyral/core';
import { sectionPath, type Archive } from '../domain/archive.js';
import { SECTIONS } from '../domain/sections.js';
import { DESCRIPTION, SITE_NAME } from '../site.js';
import { SECTION_LABELS, TEXT } from '../labels.js';
import { exploreMeta } from './explore.js';
import type { PageMeta } from './layout.js';

export const homeMeta: PageMeta = {
  path: '/',
  title: SITE_NAME,
  description: DESCRIPTION,
};

export const homeBody = (archive: Archive) => html`
  <h1>${SITE_NAME}</h1>
  <p>${TEXT.homeIntro(archive.byTitle.size)}</p>
  <p><a href=${exploreMeta.path}>${TEXT.homeAsk}</a></p>
  <ul>
    ${SECTIONS.map((section) => {
      const count = archive.bySection.get(section)?.length ?? 0;
      return html`<li>
        <a href=${sectionPath(section)}>${SECTION_LABELS[section].plural}</a>
        <data value=${String(count)}>${count.toLocaleString('en-US')}</data>
        <p>${SECTION_LABELS[section].blurb}</p>
      </li>`;
    })}
  </ul>
`;
