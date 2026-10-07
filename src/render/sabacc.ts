// /sabacc/: what the Sabacc game at sabacc.starwars.run offers, with a link to each way to play
// and to its rules (swr-j0g). Linked from every page's header.
import { html } from '@gyral/core';
import { SABACC_TEXT, TEXT } from '../labels.js';
import { SABACC } from '../site.js';
import { breadcrumb, type PageMeta } from './layout.js';

export const sabaccMeta: PageMeta = {
  path: '/sabacc/',
  title: SABACC_TEXT.title,
  description: SABACC_TEXT.description,
};

export const sabaccBody = () => html`
  ${breadcrumb([{ href: '/', label: TEXT.home }], SABACC_TEXT.title)}
  <h1>${SABACC_TEXT.title}</h1>
  <p>${SABACC_TEXT.intro}</p>
  <section aria-labelledby="ways">
    <h2 id="ways">${SABACC_TEXT.modesHeading}</h2>
    <ul>
      ${SABACC_TEXT.modes.map(
        (mode) =>
          html`<li>
            <a href=${SABACC[mode.key]} rel="external">${mode.name}</a>
            <p>${mode.about}</p>
          </li>`,
      )}
    </ul>
  </section>
  <section aria-labelledby="rules">
    <h2 id="rules">${SABACC_TEXT.rulesHeading}</h2>
    <p>
      <a href=${SABACC.rules} rel="external">${SABACC_TEXT.rules}</a>. ${SABACC_TEXT.rulesAbout}
    </p>
  </section>
`;
