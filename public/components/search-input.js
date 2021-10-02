import { fromEvent } from "https://cdn.skypack.dev/rxjs";
import {
  map,
  debounceTime,
  filter,
  distinctUntilChanged,
} from "https://cdn.skypack.dev/rxjs/operators";
const searchInputTemplate = document.createElement("template");
searchInputTemplate.innerHTML = `
<input class="input is-primary" type="search" id="searchTerm" placeholder="Enter a search term" />                           
`;

export class SearchInput extends HTMLElement {
  constructor() {
    super();
    this.searchTerm;
    this.page;
    this.entityType;

    //const shadowRoot = this.attachShadow({ mode: 'open' });
    this.appendChild(searchInputTemplate.content.cloneNode(true)); // true means deep clone
  }

  static get observedAttributes() {
    return ["search-term", "page", "entity-type"];
  }
  attributeChangedCallback(name, oldValue, newValue) {
    // this will fire initially as the element has no atrribute but is added when page runs
    // console.log("attribute has changed");
    if (oldValue === newValue) {
      return;
    }
    if (name === "search-term") {
      console.log("[SearchInput]", name, oldValue, newValue);
      this.searchTerm = newValue;
    }
    if (name === "page") {
      console.log("[SearchInput]", name, oldValue, newValue);
      this.page = newValue;
    }
    if (name === "entity-type") {
      console.log("[SearchInput]", name, oldValue, newValue);
      this.entityType = newValue;
    }
    if (this.searchTerm && this.entityType && this.page) {
      const fetchEntityEvent = new CustomEvent("FetchEntityCmd", {
        detail: {
          searchTerm: this.searchTerm,
          page: this.page,
          entityType: this.entityType,
        },
        bubbles: true,
        composed: true,
      });
      console.log("[SearchInput] dipatching", fetchEntityEvent);

      this.dispatchEvent(fetchEntityEvent);
    }
  }
  connectedCallback() {
    //monitor the search input for neew events to fire off
    this.searchInputBox = document.querySelector("input#searchTerm");
    var userSearchInput$ = fromEvent(this.searchInputBox, "keyup").pipe(
      map((e) => e.target.value),
      debounceTime(750),
      filter((searchTerm) => searchTerm.length > 1),
      distinctUntilChanged()
    );
    //stream all text changes to  worker
    userSearchInput$.subscribe((searchTerm) => {
      this.setAttribute("search-term", searchTerm);
      this.searchInputBox.value = searchTerm;
    });
  }
}
