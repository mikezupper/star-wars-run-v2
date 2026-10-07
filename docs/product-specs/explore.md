# Explore: ask the archive, in plain words or SQL

Beads: `swr-7f1.7` (SQL), epic `swr-ei6` (Ask the archive). How:
[0008-wookieepedia-only.md](../design-docs/0008-wookieepedia-only.md) ("Explore") and
[0009-ask.md](../design-docs/0009-ask.md).

## Ask the archive

- `/explore/` leads with a question box and a few example questions. A visitor types a question
  in plain words ("Which Wookiees fought for the Rebel Alliance?") and gets an answer: one or
  two sentences, then the results as a table with every name linking to its page.
- While it works, each step shows as it happens: reading the question, the names it looked up
  and the articles they matched, what it searched for, how many it found, writing the answer.
  The steps are announced to screen readers.
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
- Queries run in the visitor's browser. Nothing is sent to a server, and the query engine
  downloads only on the first run.
- Results show as a table, with names linking to their pages, the row count and how long the
  query took. At most 500 rows are shown, and the page says when there were more.
- The page describes its three tables: `archive` (one row per article, with numbers parsed from
  its facts), `facts` (one row per infobox value) and `appearances`.
- A query that fails says why, in plain words. If the engine can't load (offline, or blocked),
  the page says so instead of waiting forever.

Without JavaScript, the page says Explore needs it and links to the sections.

## Acceptance criteria

- Asked "Which Wookiees fought for the Rebel Alliance?", the answer lists Chewbacca, linked.
- With the AI service down, the page says so within 30 seconds.
- The "Who comes from Tatooine?" SQL question lists Luke Skywalker; `Ctrl+Enter` runs a query.
- The page passes axe in light and dark, before and after a question.
