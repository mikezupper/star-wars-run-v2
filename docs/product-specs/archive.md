# The archive: home, sections, articles, appearances

Beads: epic `swr-7f1` (pages `swr-7f1.4`, `swr-7f1.10`; appearances `swr-7f1.13`). Data:
[0008-wookieepedia-only.md](../design-docs/0008-wookieepedia-only.md).

## Pages

| Page      | URL                    | Shows                                                                    |
| --------- | ---------------------- | ------------------------------------------------------------------------ |
| Home      | `/`                    | What the archive is, how many articles it holds, each section with count |
| Section   | `/<section>/`          | The section's letters, each with its number of articles                  |
| Letter    | `/<section>/<letter>/` | Every article in that section starting with that letter                  |
| Article   | `/<section>/<slug>/`   | Lead prose, facts, appearances, and the Wookieepedia credit              |
| Not found | any other path (404)   | A plain way back: home and search                                        |

There are 14 sections, from `characters` to `other`; an article's infobox decides its
section. Every section has a page, even an empty one, because the header links to all of them.
Digits and symbols share the letter `0`, listed after `z`. A Legends article is marked as
Legends in lists and says so at the top of its page.

## Articles

- **Lead:** the paragraphs before the first heading, with each link to an article in the
  archive kept as a link, and other links as plain text.
- **Facts:** the infobox, field by field. A field with several values lists each one.
- **Credit:** every article names and links its Wookieepedia source and CC BY-SA 3.0
  ([CONTENT-LICENSE.md](../../CONTENT-LICENSE.md)).

## Appearances

Wookieepedia's Appearances section means two things, and the page shows each its own way:

- **On a work** (anything in `media`: a film, an episode, a novel), it's the cast: who and what
  turns up in it. The page shows it as "Who turns up here", grouped by section, with entries
  that have no article last.
- **On anything else**, it's the works the subject turns up in. The page numbers them in
  Wookieepedia's order, which follows the story, and puts non-canon works in a list of their
  own.

Each entry links to its article when the archive has one, and notes how the subject appears:
first appearance, mentioned only, in a flashback, as a hologram and so on. A list longer than
20 entries starts closed. The lists aren't indexed for search.

## Acceptance criteria

- `pnpm build` writes a page for every article, section and letter, and every link on them
  lands on a page (the smoke test follows them).
- Luke Skywalker's page lists Star Wars: Episode IV A New Hope, linked, as his first
  appearance, and has a separate list of non-canon appearances.
- A New Hope's page lists Luke Skywalker under Characters in "Who turns up here", and no
  numbered Appearances list.
- A Legends article says it's Legends; its canon namesake has a different URL
  (`luke-skywalker` and `luke-skywalker-legends`).
- Every page passes axe in light and dark, and works at 360px.
