
import { html } from "/scripts/htm.standalone.module.js";

export const Nav = ({ active_label, links }) => {
  return html`<ul class="tabs">
    ${links.map((link) => {
      const cssClass = active_label ? "" : "is-active";
      return html`<li class="${cssClass}">
        <a href="/pages/${link}/index.html">${link}</a>
      </li>`;
    })}
  </ul>`;
};

