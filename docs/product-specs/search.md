# Search

Bead: `swr-3mo.6`.

## Behavior

- A search box is reachable from every page, and from the keyboard with `/`.
- Results appear as the visitor types, matching record names and the text on record
  pages. Each result shows the record's name and type and links to its page.
- Results can be narrowed to one type (people, planets and so on).
- Without JavaScript, the search form still submits to a search page, which works once
  scripts load. Every record stays reachable through the list pages.

## How (summary)

Pagefind indexes the prerendered pages at build time and writes a static index to
`dist/pagefind/`, the way gyral.dev does. A Gyral island queries it in the browser. There is
no search server, and swapi.info's own `?search=` is ignored by the server anyway
([0002-data.md](../design-docs/0002-data.md)).

## Acceptance criteria

- Typing `sky` lists Luke Skywalker, Anakin Skywalker and Shmi Skywalker, each linking to
  their record page.
- Filtering to `planets` and typing `ta` lists Tatooine and no people.
- After one online visit, search works with the network off ([offline.md](offline.md)).
- The search island passes axe in light and dark.
