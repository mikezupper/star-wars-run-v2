# Product specs

What each feature must do for a visitor. A spec states the behavior and its acceptance
criteria; the design docs say how it's built. Each spec names the bead that implements it.

**Who visits:** Star Wars fans who want to look something up ("what is Boba Fett in?") or
wander from one article to the next. Many arrive from a search engine on a phone, straight
onto an article.

| Spec                     | Feature                                                       | Bead        |
| ------------------------ | ------------------------------------------------------------- | ----------- |
| [archive.md](archive.md) | Home, sections, letter pages, a page per article, appearances | `swr-7f1`   |
| [explore.md](explore.md) | SQL over the archive, in the browser                          | `swr-7f1.7` |
| [search.md](search.md)   | Find any article by name from any page                        | `swr-3mo.6` |
| [offline.md](offline.md) | Installable; visited pages and search work offline            | `swr-3mo.9` |
