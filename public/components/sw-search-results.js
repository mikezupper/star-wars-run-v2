const template = document.createElement("template");
template.innerHTML = `
    <section></section>
`;
class SwSearchResults extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({
      mode: "open",
    });
    // true means deep clone
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.listElement = this.shadowRoot.querySelector("section");
  }
  get results() {
    return this._arrayOfPosts;
  }
  set results(value) {
    this._arrayOfPosts = value;
    console.log("post-list.js ", this._arrayOfPosts);
    this._render();
  }
  _render() {
    this._arrayOfPosts.forEach((result) => {
      const button = document.createElement("button");
      // add id number to button display
      button.appendChild(document.createTextNode(result.name));
      button.addEventListener("click", (e) => {
        console.log("selected ", e);

        // we create an event and also send with it the postArray
        this.dispatchEvent(
          new CustomEvent("selectedCard", {
            detail: result,
          })
        );
      });
      this.listElement.appendChild(button);
    });
  }
}
customElements.define("sw-search-results", SwSearchResults);
