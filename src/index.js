import xs from "xstream";
import { run } from "@cycle/run";
import { makeDOMDriver } from "@cycle/dom";
import { h1, h2, h3, h4, label, hr } from "@cycle/dom";
import { div, nav, ul, li, i } from "@cycle/dom";
import { a, span, input, button } from "@cycle/dom";
import { makeHTTPDriver } from "@cycle/http";
const main = (sources) => {
  const actions = intent(sources);
  const state$ = model(actions);
  const vdom$ = view(state$);
  return {
    DOM: vdom$,
    HTTP: actions.request$
  };
};
const intent = (sources) => {
  const searchTermChanges$ = sources.DOM.select(".search-term").events("input").map((ev) => ev.target.value).startWith(void 0);
  const entityTypeChanges$ = sources.DOM.select(".entity-type").events("click").map((ev) => ev.target.textContent).startWith("people");
  const searchInput$ = xs.combine(entityTypeChanges$, searchTermChanges$);
  const searchResponse$ = sources.HTTP.select("search-data").flatten().map((res) => res.body);
  const request$ = searchInput$.map(([entityType, searchTerm]) => ({
    searchTerm,
    entityType
  })).filter((searchInputData) => {
    return searchInputData.searchTerm && searchInputData.searchTerm.length > 1;
  }).filter((searchInputData) => {
    return searchInputData.entityType;
  }).map((searchInputData) => `https://api.starwars.run/api/${searchInputData.entityType}/?search=${searchInputData.searchTerm}`).map((url) => ({
    url,
    method: "GET",
    category: "search-data"
  }));
  return { request$, searchResponse$ };
};
const model = (actions) => {
  const state$ = actions.searchResponse$.startWith({}).map((response) => {
    return {
      ...response
    };
  });
  return state$;
};
const view = (state$) => {
  return state$.map((response) => {
    const { next, previous, results, count } = response;
    return div(".container ", [
      nav(".nav-wrapper .blue .darken-2 ", [
        a(".sidenav-trigger", {
          attrs: { "data-target": "sw-nav" }
        }, [i(".material-icons", "menu")]),
        ul(".left .hide-on-med-and-down", [
          li(".entity-type ", [a("people")]),
          li(".entity-type ", [a("starships")]),
          li(".entity-type ", [a("species")]),
          li(".entity-type", [a("vehicles")]),
          li(".entity-type", [a("films")]),
          li(".entity-type", [a("planets")])
        ]),
        ul(".sidenav", {
          attrs: { id: "sw-nav" }
        }, [
          li(".entity-type  ", [a("people")]),
          li(".entity-type ", [a("starships")]),
          li(".entity-type  ", [a("species")]),
          li(".entity-type ", [a("vehicles")]),
          li(".entity-type  ", [a("films")]),
          li(".entity-type", [a("planets")])
        ])
      ]),
      div(".row .center", [
        div(".input-field .m6", [
          i(".material-icons prefix", "search_term"),
          label(".label-icon", { atrrs: { for: "search" } }),
          input(".search-term .validate", {
            attrs: {
              type: "text",
              id: "search"
            }
          })
        ])
      ]),
      div(".row .center", [
        ul(".col .s12 ", [
          previous && li([
            a(".search-previous", { attrs: { "data-previous": previous } }, [
              i(".material-icons", "chevron_left")
            ])
          ]),
          count && li([span(".center .search-count", `Count: ${count}`)]),
          next && li([
            a(".search-next", { attrs: { "data-next": next } }, [
              i(".material-icons", "chevron_right")
            ])
          ])
        ]),
        div(".row .center", results?.map((e) => div(".card .grey .lighten-1 .col .s12 .m6", [
          div(span(".search-result-entry .card-content .white-text", e.name || e.title))
        ])))
      ])
    ]);
  });
};
const drivers = {
  DOM: makeDOMDriver("#main"),
  HTTP: makeHTTPDriver()
};
run(main, drivers);
