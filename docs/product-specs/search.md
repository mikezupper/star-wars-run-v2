# Search

Beads: `swr-3mo.6`; ranking at full size, `swr-357`; on the server, `swr-sgf.5` (ADR 0011).

## Behavior

- Search is reachable from every page with `/` or Ctrl/⌘+K. The shortcut focuses and selects
  the visible input on the results page or in the desktop header. On a phone, where the
  header has a link, it opens the results page and focuses its input. Typing `/` in a field
  keeps typing instead of opening search.
- Results match article names, the names articles are known by (redirects), and the text of
  each article's lead and facts. Each result shows the article's name, its section, and a link
  to each of its continuities (Canon, Legends); a text match shows the passage, the matched
  words marked.
- **The article a visitor means comes first.** Name matches lead, the most linked-to first,
  with canon ahead of Legends when they're close. Every word must start a word of the name; a
  redirect counts only as the whole query, so "vader" finds Anakin Skywalker but "sky" doesn't
  find a galaxy through an odd redirect. Text matches follow.
- A subject with a canon and a Legends article is one result (Darth Sidious and Palpatine).
- Results can be narrowed to one section (characters, planets and so on).
- When nothing matches, the page suggests a close name ("tatoine" → Tatooine). A query that
  reads like a question offers to ask it on the Explore page instead.
- Search works without JavaScript: the form submits to `/search/?q=…`, whose results are
  rendered on the server, and a results page can be shared.
- With JavaScript, the desktop header and results-page forms suggest up to six subjects
  after a short pause in typing. Each shows its section and continuity badges. Arrow keys
  choose a suggestion while focus stays in the input; Enter opens the chosen article, and
  Escape closes the palette without clearing the query. With no selection, Enter submits
  the GET form. Suggestions are ordinary links and support pointer clicks and new tabs.
- The palette announces loading, the number of suggestions, no matches and a network
  failure. Its footer reaches all results; a close spelling and a question's Ask link appear
  when applicable. Editing again cancels the previous request, and a late response cannot
  replace a newer query or section choice.

## How (summary)

The build writes SQLite full-text indexes into the app's `pages.sqlite`: one of names and
redirects (prefix matches, with each article's link count), a trigram index of names for
suggestions, and one of each article's text. `src/server/search.ts` finds candidates there;
`src/domain/search.ts` ranks them and folds twins. The same search answers `/search/`,
`/api/search` (suggestions as you type), and Ask's lookup of the
names in a question. Search pages and `/api/search` are cached like pages: results change only
with a build.

`src/islands/search.ts` enhances the server-rendered GET form in light DOM, following the
[manual-selection combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).
Its driver debounces for 150 ms and aborts the previous request when the query changes.

## Acceptance criteria

- On the full archive, each of these lists the page in its top five: `sky` (Luke and Anakin
  Skywalker), `luke` (Luke Skywalker), `vader` (Anakin Skywalker), `tatooine` (Tatooine),
  `falcon` (Millennium Falcon), `padme` (Padmé Amidala Naberrie). `pnpm smoke` checks them.
- Filtering to `planets` and typing `ta` lists Tatooine and no people.
- `/search/?q=luke` lists Luke Skywalker with JavaScript off.
- Keyboard shortcuts focus the results-page input at desktop and 360px widths; from a
  phone's article page they open search with its input focused.
- The results page and open suggestion palette pass axe in light and dark, including at
  360px. Keyboard selection keeps input focus and opens the selected canonical article.
- The header form submits with JavaScript off. Suggestions preserve the section filter;
  a failed lookup leaves the GET form usable, and stale responses cannot replace new ones.
- Search needs the network: offline, a new search shows the offline page ([offline.md](offline.md)).
