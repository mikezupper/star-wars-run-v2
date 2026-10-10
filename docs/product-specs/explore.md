# Explore: ask the archive, in plain words or SQL

Beads: `swr-7f1.7` (SQL), epic `swr-ei6` (Ask the archive). How:
[0008-wookieepedia-only.md](../design-docs/0008-wookieepedia-only.md) ("Explore") and
[0009-ask.md](../design-docs/0009-ask.md), [0010-one-api.md](../design-docs/0010-one-api.md).

## Ask the archive

- `/explore/` leads with a question box and a few example questions. A visitor types a question
  in plain words ("Which Wookiees fought for the Rebel Alliance?") and gets an answer: one or
  two sentences, then the results as a table with every name linking to its page.
- Submitting shows “Searching…” on the button and “Reading your question…” below the box
  immediately, before the server replies. A second submit is ignored while it works.
- Progress, the answer and any failure appear directly below the question. One current phase
  is visible and announced to screen readers: reading the question, searching the archive or
  writing the answer. The button keeps keyboard focus as its label changes; finishing does
  not move focus.
- The answer has a heading and a result count, counting the rows after canon and Legends are
  folded together. An empty answer says no results were found. A failure has a Retry button
  that asks the same question with the same conversation.
- Example questions start expanded under “Try”. After a question is submitted, they collapse
  under “Try another question”, below the answer; they can still be opened. Selecting an
  example starts a fresh conversation and focuses the question box as the examples close.
- The answer is checkable: "How I answered" lists the steps and the query, and opens the query
  in the SQL editor.
- Follow-ups refine the last answer ("only the ones from Kashyyyk"); a question that stands on
  its own starts fresh. "Start over" forgets the conversation.
- `/explore/?ask=<question>` asks the question on arrival.
- A note under the box says questions go to an AI service. When it can't be reached, the page
  says so and points to the SQL editor; when a question can't be turned into a query, it asks
  for the question another way.

## SQL

- "Write SQL yourself" opens a few ready-made questions and a box for any SQL query.
- Queries run on the site's server, on a read-only copy of the archive that can't reach files,
  the network or anything else. A query is stopped after 10 seconds. Nothing heavy downloads:
  a first answer costs one request.
- Results show as a table, with names linking to their pages, the row count and how long the
  query took. At most 500 rows are shown, and the page says when there were more.
- The page describes its three tables: `archive` (one row per article, with numbers parsed from
  its facts), `facts` (one row per infobox value) and `appearances`.
- A query that fails says why, in plain words. If the server can't be reached (offline, or
  down), the page says so instead of waiting forever.

Without JavaScript, the page says Explore needs it and links to the sections.

## Acceptance criteria

- Asked "Which Wookiees fought for the Rebel Alliance?", the answer lists Chewbacca, linked.
- With the AI service down, the page says so within 30 seconds.
- With the first API response held back, progress appears immediately, repeated Enter submits
  make one request, and examples do not displace the answer. Follow-ups, Retry and `?ask=` work.
- The "Who comes from Tatooine?" SQL question lists Luke Skywalker; `Ctrl+Enter` runs a query.
- The page passes axe in light and dark, before, during and after a question, and fits a
  360 px viewport.
