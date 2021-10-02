//import { curry } from "https://cdn.skypack.dev/ramda";

/// custom imports
import EventBus from "/scripts/EventBus.js";
import CommandBus from "/scripts/CommandBus.js";
import { useEventBusMixin } from "/scripts/EventBusMixin.js";

import "/components/index.js";
import "/components/nav-links.js";
import "/components/LazyLoadComponent.js";
import "/components/footer-links.js";
import { SearchInput } from "/components/search-input.js";
import { CardDetail } from "/components/card-detail.js";

const eventBus = new EventBus();
const commandBus = CommandBus();
customElements.define("search-input", useEventBusMixin(SearchInput, eventBus));
customElements.define("card-detail", useEventBusMixin(CardDetail, eventBus));

const FETCH = "*.fetch";
const RESET = "reset.search";

//HANDLERS
const fetchCommandHandler = {
  handle: (command) => {
    const { page, searchTerm, entityType } = command?.payload;
    console.log("[fetchCommandHandler] - handling: ", command);
    return fetchHandler(page, searchTerm, entityType);
  },
};

const fetchHandler = (page, searchTerm, entityType) => {
  const fetchedEntityEventName = entityType + ".fetched";
  let url = `https://api.starwars.run/api/${entityType}/?search=${searchTerm}&page=${page}`;
  return fetch(url)
    .then((response) => response.json())
    .then((json) => {
      eventBus.emit({ type: fetchedEntityEventName, payload: json });
    });
};

//Register Handlers for Commands of interest
commandBus.registerHandler(FETCH, fetchCommandHandler);
commandBus.registerHandler(RESET, {
  handle: (command) => {
    console.log("[RESET] - handling: ", command);
    document.querySelector("input").value = "";
    searchInput.setAttribute("search-term", "");
    searchInput.setAttribute("entity-type", command?.payload?.entityType);
  },
});

//Assign command to the search input - this will trigger the bus to invoke a fetch
const searchInput = document.querySelector("search-input");

searchInput.addEventListener("FetchEntityCmd", (e) => {
  console.log("[SearchInput - Listener] on event: ", e);
  const command = {
    type: "*.fetch",
    payload: e.detail,
  };

  commandBus.handle(command);
});

const selectedNavLink = document.querySelector("nav-links");
selectedNavLink.addEventListener("NavLinkClicked", (e) => {
  console.log("[selectedNavLink - Listener] on event: ", e);
  const command = {
    type: RESET,
    payload: e.detail,
  };

  commandBus.handle(command);
});
