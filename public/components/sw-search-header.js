class SwSearchHeader extends HTMLElement {
  constructor() {
    super();
    this.searchTerm;
    this.page;
    this.entityType;
    this.attachShadow({
      mode: "open",
    });
    this.shadowRoot.innerHTML = `
        <div id="search-header"></div>
    `;
  }
  static get observedAttributes() {
    return ["search-term", "page", "entity-type"];
  }
  attributeChangedCallback(name, oldValue, newValue) {
    // this will fire initially as the element has no atrribute but is added when page runs
    console.log("attribute has changed");
    if (oldValue === newValue) {
      return;
    }
    if (name === "search-term") {
      console.log(name, oldValue, newValue);
      this.searchTerm = newValue;
    }
    if (name === "page") {
      console.log(name, oldValue, newValue);
      this.page = newValue;
    }
    if (name === "entity-type") {
      console.log(name, oldValue, newValue);
      this.entityType = newValue;
    }
    console.log("vals", this.searchTerm, this.entityType, this.page);
    if (this.searchTerm && this.entityType && this.page) {
      console.log(" all here ... lets search!");
      let url = new URL(`https://api.starwars.run/api/${this.entityType}/`);
      url.searchParams.set("search", this.searchTerm);
      if (this.page) url.searchParams.set("page", this.page);

      console.log("[URL] " + url);

      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          const { count, next, previous, results } = data;
          let i;
          let output = "<br>";
          const info = this.shadowRoot.getElementById("search-header");
          info.innerHTML = "";

          output += '<div class="card">';
          output +=
            "count: <b>" +
            count +
            "</b><br> Next: <b>" +
            next +
            "</b><br> Previous: ";
          output += "<b>" + previous + "</b><br>";
          output += "</div>";
          info.innerHTML += output;
          this.dispatchEvent(
            new CustomEvent("searchResultFound", {
              detail: results,
              bubbles: true,
              composed: true,
            })
          );
        });
    }
  }

  connectedCallback() {
    // When component is added to DOM
    console.log("connectedCallback...!!!!!!");
  }

  disconnectedCallback() {
    // when component is removed from DOM
    console.log("disconnectedCallback...");
  }
}

customElements.define("sw-search-header", SwSearchHeader);
