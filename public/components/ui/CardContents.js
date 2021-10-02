import { html } from "/scripts/htm.standalone.module.js";

export const CardContentView = ({
  name,
  hair_color,
  eye_color,
  gender,
  height,
  mass,
  skin_color,
  birth_year,
}) => {
  return html`
      <td>${name}</td>
      <td>${birth_year}</td>
      <td>${gender}</td>
      <td>${hair_color}</td>
      <td>${eye_color}</td>
      <td>${height}</td>
      <td>${mass}</td>
      <td>${skin_color}</td>
  `;
};
