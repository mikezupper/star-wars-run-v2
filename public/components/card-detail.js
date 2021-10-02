import { CardContentView } from "/components/ui/CardContents.js";
import { render, html } from "/scripts/htm.standalone.module.js";

const cardDetailTemplate = document.createElement("template");
cardDetailTemplate.innerHTML = `
<table class="table" id="card-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Birth Year</th>
      <th>Gender</th>
      <th>Hair Color</th>
      <th>Eye Color</th>
      <th>Height</th>
      <th>Weight</th>
      <th>Skin Color</th>
    </tr>
  </thead>
</table>
`;

export class CardDetail extends HTMLElement {
  constructor() {
    super();
    //const shadowRoot = this.attachShadow({ mode: "closed" });
  }

  connectedCallback() {
    const table = this.querySelector("table");
    const entities = [
      "people.fetched",
      "starships.fetched",
      "planets.fetched",
      "films.fetched",
      "species.fetched",
      "vehicles.fetched",
      "starships.fetched",
    ];
    entities.map((e) => {
      this.eventBus.on(e, (data) => {
        while (this.hasChildNodes()) {
          this.lastChild.remove();
        }
        const table = cardDetailTemplate.content.cloneNode(true);
        const { results } = data?.payload;
        const tbody = document.createElement("tbody");
        table.appendChild(tbody);
        results.map((result) => {
          const div = document.createElement("tr");
          div.classList.add("p-5")
          tbody.appendChild(div);
          render(html`<${CardContentView} ...${result} />`, div);
        });
        this.appendChild(table);
      });
    });
    // this.eventBus.on("reset.search", (e) => {
    //   console.log('adfa')
    //   const tbody = document.createElement("tbody");
    //   if (tbody) while (tbody.hasChildNodes()) tbody.lastChild.remove();
    // });
  }

  disconnectedCallback() {}
}
