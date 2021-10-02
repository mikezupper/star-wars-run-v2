export class FetchComponent extends HTMLElement {
  constructor() {
    super();
    this.entityId;
    this.entityType;
    this.attachShadow({
      mode: "open",
    });
  }
  static get observedAttributes() {
    return ["entity-id", "entity-type"];
  }
  attributeChangedCallback(name, oldValue, newValue) {
    // this will fire initially as the element has no atrribute but is added when page runs
    console.log("attribute has changed");
    if (oldValue === newValue) {
      return;
    }
    if (name === "entity-id") {
      console.log(name, oldValue, newValue);
      this.entityId = newValue;
    }
    if (name === "entity-type") {
      console.log(name, oldValue, newValue);
      this.entityType = newValue;
    }

    if (this.entityId && this.entityType) {
      const lazyComponent = this.shadowRoot.querySelector("#component");
    }
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
    <div id="component" class="web-component">
         <div id="info" ></div>
    </div>
`;
    this.eventBus.on("people.fetched", (data) => {
      console.log(data);
      const info = this.shadowRoot.querySelector("#info");
      const cardDetail = this.shadowRoot.appendChild("card-detail");
      //cardDetail.setAttribute("sw-name", data.payload.results[0].name);
      //  info.appendChild(cardDetail);
    });
  }

  disconnectedCallback() {}
}
