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

## How (summary)

The build writes SQLite full-text indexes into the app's `pages.sqlite`: one of names and
redirects (prefix matches, with each article's link count), a trigram index of names for
suggestions, and one of each article's text. `src/server/search.ts` finds candidates there;
`src/domain/search.ts` ranks them and folds twins. The same search answers `/search/`,
`/api/search` (suggestions as you type, swr-sgf.5's second half), and Ask's lookup of the
names in a question. Search pages and `/api/search` are cached like pages: results change only
with a build.

## Acceptance criteria

- On the full archive, each of these lists the page in its top five: `sky` (Luke and Anakin
  Skywalker), `luke` (Luke Skywalker), `vader` (Anakin Skywalker), `tatooine` (Tatooine),
  `falcon` (Millennium Falcon), `padme` (Padmé Amidala Naberrie). `pnpm smoke` checks them.
- Filtering to `planets` and typing `ta` lists Tatooine and no people.
- `/search/?q=luke` lists Luke Skywalker with JavaScript off.
- Keyboard shortcuts focus the results-page input at desktop and 360px widths; from a
  phone's article page they open search with its input focused.
- The results page passes axe in light and dark.
- Search needs the network: offline, a new search shows the offline page ([offline.md](offline.md)).
