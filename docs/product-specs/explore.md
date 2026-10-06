# Explore: ask the archive in SQL

Bead: `swr-7f1.7`. How: [0008-wookieepedia-only.md](../design-docs/0008-wookieepedia-only.md),
section "Explore".

## Behavior

- `/explore/` offers a few ready-made questions (the tallest characters, who comes from
  Tatooine, who's in A New Hope…) and a box for any SQL query.
- Queries run in the visitor's browser. Nothing is sent to a server, and the query engine
  downloads only on the first run.
- Results show as a table, with names linking to their pages, the row count and how long the
  query took. At most 500 rows are shown, and the page says when there were more.
- The page describes its three tables: `archive` (one row per article, with numbers parsed from
  its facts), `facts` (one row per infobox value) and `appearances`.
- A query that fails says why, in plain words. If the engine can't load (offline, or blocked),
  the page says so instead of waiting forever.
- Without JavaScript, the page says Explore needs it and links to the sections.

## Acceptance criteria

- The "Who comes from Tatooine?" question lists Luke Skywalker.
- `Ctrl+Enter` in the query box runs the query.
- The page passes axe in light and dark, before and after a query.
