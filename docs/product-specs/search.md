# Search

Beads: `swr-3mo.6`; ranking at full size, `swr-357`.

## Behavior

- A search box is reachable from every page, and from the keyboard with `/`.
- Results appear as the visitor types, matching article titles and the text on article
  pages. Each result shows the article's title and section and links to its page.
- **The article a visitor means comes first.** Up to five title matches lead the list, the
  most linked-to first, with canon ahead of Legends when they're close. A redirect's name
  finds its article: "vader" finds Anakin Skywalker. Text matches follow.
- Results can be narrowed to one section (characters, planets and so on).
- Without JavaScript, the search form still submits to a search page, which works once
  scripts load. Every article stays reachable through the section and letter pages.

## How (summary)

Pagefind indexes the prerendered pages at build time and writes a static index to
`dist/pagefind/`, the way gyral.dev does. A Gyral island queries it in the browser. There is
no search server.

At 227,000 pages, Pagefind's text ranking buries the obvious answer: "tatooine" listed
Tatooine wine and Tatooine/3 above the planet. So the build also writes a title index to
`dist/search-titles/` (`src/domain/titles.ts`): every title and redirect, filed by the first
three letters of each word, with a score from how many articles link to it. A search fetches
one small shard, ranks its matches, and puts the best above Pagefind's results.

## Acceptance criteria

- On the full archive, each of these lists the page in its top five: `sky` (Luke and Anakin
  Skywalker), `luke` (Luke Skywalker), `vader` (Anakin Skywalker), `tatooine` (Tatooine),
  `falcon` (Millennium Falcon), `padme` (Padmé Amidala Naberrie). `pnpm smoke` checks them.
- Filtering to `planets` and typing `ta` lists Tatooine and no people.
- After one online visit, search works with the network off ([offline.md](offline.md)).
- The search island passes axe in light and dark.
