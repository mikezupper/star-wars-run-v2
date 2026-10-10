# The archive: home, sections, articles, appearances

Beads: epic `swr-7f1` (pages `swr-7f1.4`, `swr-7f1.10`; appearances `swr-7f1.13`). Data:
[0008-wookieepedia-only.md](../design-docs/0008-wookieepedia-only.md).

## Pages

| Page      | URL                            | Shows                                                                    |
| --------- | ------------------------------ | ------------------------------------------------------------------------ |
| Home      | `/`                            | What the archive is, how many articles it holds, each section with count |
| Section   | `/<section>/`                  | The section's letters, each with its number of articles                  |
| Letter    | `/<section>/letters/<letter>/` | Up to 500 articles, with numbered pages reaching the rest                |
| Article   | `/<section>/<slug>/`           | Lead prose, facts, appearances, and the Wookieepedia credit              |
| Not found | any other path (404)           | A plain way back: home and search                                        |

There are 14 sections, from `characters` to `other`; an article's infobox decides its
section. Every section has a page, even an empty one, because the header links to all of them.
Digits and symbols share the letter `0`, listed after `z`. A Legends article is marked as
Legends in lists and says so at the top of its page.

Article slugs never contain a slash, so the `letters/` namespace keeps an index distinct
from an article called “U” or “M”. Old `/<section>/<letter>/` links redirect to the index
when no article owns that path; existing article URLs keep working. Sitemaps list the
canonical index URLs and article URLs, with redirect aliases left out.

Letter indexes list 500 articles per page in title order. The first page keeps the letter
URL; later pages use `/<section>/letters/<letter>/2/`, `/3/` and so on. Each page has its own
title, canonical URL and sitemap entry, with numbered, previous and next links. The first
page also shows the best-known subjects. The index heading counts the whole letter.

Both, Canon and Legends filter the current page with CSS. Pagination links carry the chosen
continuity as `?era=canon` or `?era=legends`, including with JavaScript disabled. Page numbers
refer to the complete list, so changing continuity keeps the same page of titles.

## Jump to hyperspace

The home page's random-article link opens an article through `/random/`. In browsers that
support the effect, an ordinary click or Enter shows stars stretching outward into light
trails, then reveals the article. The jump lasts about four seconds; Escape skips it. Other
links keep their short page transitions (`swr-36w.8`).

The effect starts as the new page arrives, without delaying its request. Reduced-motion
settings, browsers without the needed view-transition features, and unavailable browser
storage use ordinary navigation. Opening in a new tab and modified clicks keep their usual
behavior. Returning with Back does not replay the jump or leave stars over the page.

A native “Animate hyperspace jumps” checkbox sits beside the link. Unchecking it remembers
the opt-out in local storage; checking it enables the effect again. Changes also reach other
open tabs. With system reduced motion on, the checkbox is disabled and the page explains why.
Browsers without the effect, and visitors without JavaScript, see only the working link.

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

- `pnpm build` writes data for every article. The app renders every article, section and
  letter index on request from SQLite, including with data from an earlier compatible build.
  Every internal link lands on its intended page (the smoke test follows them).
- A single-letter article and its letter index have distinct working URLs. A legacy letter
  URL redirects only when no article owns it, and sitemaps include both canonical pages.
- Every article appears exactly once in its letter's A–Z list across the numbered pages.
  On the full archive, each index's uncompressed HTML is below 200,000 bytes. Numbered pages
  preserve continuity, pass axe and fit at 360px; pagination works without JavaScript.
- Luke Skywalker's page lists Star Wars: Episode IV A New Hope, linked, as his first
  appearance, and has a separate list of non-canon appearances.
- A New Hope's page lists Luke Skywalker under Characters in "Who turns up here", and no
  numbered Appearances list.
- A Legends article says it's Legends; its canon namesake has a different URL
  (`luke-skywalker` and `luke-skywalker-legends`).
- Every page passes axe in light and dark, and works at 360px.
- The random-article jump shows points, then radial light trails, then its article. Escape
  skips it, and reduced motion turns it off. No temporary stars remain after the transition
  or a return with Back.
- The checkbox's opt-out survives reloads and page visits, and can be turned back on.
