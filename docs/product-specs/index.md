# Product specs

What each feature must do for a visitor. A spec states the behavior and its acceptance
criteria; the design docs say how it's built. Each spec names the bead that implements it.

**Who visits:** Star Wars fans who want to look something up ("which films is Boba Fett
in?") or wander from one record to the next. Many arrive from a search engine on a phone,
straight onto a record page.

| Spec                     | Feature                                                    | Bead        |
| ------------------------ | ---------------------------------------------------------- | ----------- |
| [records.md](records.md) | Home, a list page per type, a page per record, cross-links | `swr-3mo.5` |
| [search.md](search.md)   | Find any record by name from any page                      | `swr-3mo.6` |
| [offline.md](offline.md) | Installable; visited pages and search work offline         | `swr-3mo.9` |
