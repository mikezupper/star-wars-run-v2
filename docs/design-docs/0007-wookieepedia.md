# ADR 0007 — Wookieepedia as a second data source

Status: **proposed** (2026-10-05). Spike: `swr-4g6`. Needs the owner's decision on the open
questions at the end before any implementation bead starts.

## Recommendation

**Go, with conditions.** Ingest the canon subset of Wookieepedia **from Fandom's published XML
dump, never from the API or by scraping.** Keep the site static: Pagefind scales to this size,
so no search server is needed. Facts and links come first; article prose waits for a
licensing decision.

The conditions:

1. Ask Fandom to confirm, in writing, that building a site from the published dump is
   acceptable. Their Terms of Use forbid automated access without permission (below). Until
   they answer, download the dump by hand.
2. Credit every page to its Wookieepedia article and license the derived data CC BY-SA 3.0.
   The code stays MIT.
3. Start with canon, in-universe articles of the six kinds the site already has. Legends and
   other kinds come later, if at all.
4. No images: Wookieepedia's images are fair-use material, not CC BY-SA (`swr-8to`: close as
   won't do, unless a licensed image source turns up).

## What the spike found

### Size

From the dump (`starwars_pages_current.xml.7z`, 275 MB compressed, published 2026-08-01):

| Measure                              | Count        |
| ------------------------------------ | ------------ |
| Articles (namespace 0, no redirects) | 227,272      |
| Redirects                            | 79,736       |
| Wikitext in articles                 | 834 MB       |
| Median article                       | about 1.5 KB |
| Largest seen (`Luke Skywalker`)      | 706 KB       |
| Legends articles (`{{Top\|leg}}`)    | 106,932      |
| Canon articles (category count)      | 61,430       |

Canon, in-universe articles by infobox, compared with what swapi.info has today. These counts
come from the first infobox in each article not marked Legends, so treat them as estimates
within a few percent:

| Kind on this site | Wookieepedia infobox                                     |   Canon articles | swapi.info |
| ----------------- | -------------------------------------------------------- | ---------------: | ---------: |
| people            | `Character` (16,440) and `Droid` (1,782)                 |     about 18,200 |         82 |
| planets           | `CelestialBody`                                          |      about 3,800 |         59 |
| species           | `Species`                                                |      about 3,600 |         37 |
| starships         | `StarshipClass` (991) and `IndividualShip` (1,744)       |      about 2,700 |         36 |
| vehicles          | `RepulsorliftVehicle`, `GroundVehicle`, and smaller ones |        about 680 |         39 |
| films             | `Movie` (includes non-saga films)                        |         about 80 |          6 |
| **total**         |                                                          | **about 29,000** |    **259** |

That's roughly 110 times today's site. Other canon kinds (`Structure`, `Location`, `Battle`,
`Organization`, `Weapon` and more) add tens of thousands more if the site ever widens.

### Access and terms

- **API:** `starwars.fandom.com/api.php` answers (MediaWiki 1.43). But Fandom's Terms of Use,
  as quoted in a search summary (the page itself returns HTTP 402 to automated fetches),
  forbid using "any robot, spider, scraper or other automated means to access the Services
  for any purpose without our express written permission". API access grants no extra rights.
  The spike made about a dozen read-only API requests before finding this, and will make no
  more.
- **Scraping (Firecrawl or similar):** ruled out by the same clause. The site also sits behind
  a Cloudflare bot challenge: even `robots.txt` returned "Just a moment…".
- **Dump:** Fandom publishes a current-pages dump at
  `https://s3.amazonaws.com/wikia_xml_dumps/s/st/starwars_pages_current.xml.7z`, refreshed
  roughly monthly. One download a month is the gentlest possible access, and it's the channel
  Fandom provides. Whether a script fetching it counts as "automated means" is a question
  for Fandom: condition 1.

### License

From `Wookieepedia:Copyrights`: text is **CC BY-SA 3.0 (Unported)**. Reusers must:

- **attribute**: credit Wookieepedia (or the authors in the page history), with links;
- **share alike**: release the reused material under the same license or a later version;
- **indicate changes**: say if the content was modified.

Images, audio and video on Wookieepedia are fair-use copyrighted material, not CC BY-SA.

Facts such as a height or a homeworld are generally not copyrightable in the US, but the
selection and the wording are. Treating everything derived from Wookieepedia as CC BY-SA is
the safe reading. This is not legal advice.

### Infobox data

Infobox fields are wikitext, not clean values. Luke's `hair` field is a bulleted list with a
year and a citation per item. `birth` mixes a template, a link, a date and a place. Fields
carry `<ref>` citations, `{{C|…}}` comments and `[[links]]`. The ingest needs a real
wikitext parser (for example `wikiparser-node` or `wtf_wikipedia`) and a cleaning rule per
field. Most fields should be stored as short text with their links resolved, not as
numbers. That's a change from swapi.info's typed fields.

## Architecture at this size

| Concern               | Today (259 records)                | Proposed (about 29,000)                                                                                                                                                                                                                             |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingest                | swapi.info JSON over HTTP          | Parse a dump file given on the command line. The network step becomes "download the dump" (by hand, until condition 1 is settled).                                                                                                                  |
| Snapshot in `data/`   | 7 JSON files, 190 KB, committed    | Gzipped JSON shards per kind, estimated 5–10 MB, committed so builds stay offline and reproducible. Record the dump's date and SHA-256 in `meta.json`.                                                                                              |
| Merge with swapi.info | n/a                                | Match by name within a kind; `sources` already holds one entry per source (ADR 0002). Wookieepedia wins on facts; swapi.info's typed numbers fill gaps.                                                                                             |
| Pages                 | 268, prerendered in under a second | About 29,000. Prerendering scales linearly; budget a few minutes. `dist/` may reach several hundred MB. Measure in the first bead.                                                                                                                  |
| Search                | Pagefind, whole index 1.4 MB       | Still Pagefind: it loads only the index chunks a query needs. **No search server.** Rejected: SQLite full-text search in the container, which needs a server process, can't be cached by Cloudflare, and breaks "no Node in production" (ADR 0003). |
| Offline search        | Whole index precached              | Can't precache tens of MB of fragments. Instead, precache a compact title index (slug, name and kind for every record, about 1.5 MB raw, a few hundred KB gzipped) and search titles offline. Full-text search needs the network.                   |
| Attribution           | Footer credit to swapi.info        | A credit line on every Wookieepedia-derived page, linking the source article and CC BY-SA 3.0, and saying it was modified. A license note for `data/`.                                                                                              |

## Open questions for the owner

1. **Ask Fandom first?** Recommended: email Fandom about dump-based reuse before building.
   Until they answer, the ingest reads a dump you download by hand.
2. **Scope:** canon only, in the six existing kinds (about 29,000 pages)? Or Legends too
   (roughly another 43,000 in the same kinds)?
3. **Prose:** facts and links only, or also each article's opening paragraph? Prose makes
   pages far richer, and the whole site's content then becomes CC BY-SA text.
4. **Images:** close `swr-8to` as won't do?

## Implementation beads (to file once the questions are answered)

1. Wikitext parsing: a cleaning rule per infobox field, a link resolver that follows
   redirects, and property tests against sample pages.
2. Dump ingest: stream the dump, filter canon in-universe articles, write gzipped shards,
   record the dump's date and hash.
3. Merge with swapi.info by name; record both sources.
4. Scale the build: measure prerender time and `dist/` size. One sitemap holds up to 50,000
   URLs, which is enough for canon; adding Legends would need a sitemap index.
5. Offline title index and the service worker change.
6. Attribution on every page and a license note for `data/`.
