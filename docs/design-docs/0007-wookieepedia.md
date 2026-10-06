# ADR 0007 — Wookieepedia as a second data source

Status: **accepted** (2026-10-06), with the owner's decisions below. Spike: `swr-4g6`.
Implementation: epic `swr-7f1`.

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
3. ~~Start with canon in the six existing kinds.~~ Superseded: the owner chose all of it
   (Decisions, below).
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

## Decisions (owner, 2026-10-06)

1. **Source:** the dump, read from a local file. The owner keeps it at
   `~/Downloads/starwars_pages_current.xml.7z`; the ingest takes the path as an argument and
   never downloads it. Whether to ask Fandom about automated dump downloads stays open; until
   then, downloads are by hand.
2. **Scope: all of it.** Every article, canon and Legends, every infobox kind (about 60), not
   just the six kinds the site has today: about 227,000 pages. Legends pages are labelled as
   such.
3. **Prose: yes.** Pages show article text as well as facts, so the site's text is CC BY-SA 3.0
   with a credit line on every derived page. Code stays MIT.
4. **Images: on hold** until this epic is done (`swr-8to`).
5. **Querying: DuckDB-WASM** on an Explore page, over a Parquet snapshot fetched with HTTP range
   requests. No server. It complements, not replaces, prerendered pages (SEO, no-JS, links)
   and Pagefind (typing a name). Its engine is about 8 MB gzipped (`duckdb-eh.wasm`, 36 MB
   raw, measured on 1.33), so only the Explore page loads it.
6. **Rendering: Gyral 0.2.0.** Shared page chrome (head, header, nav, footer) stays one set of
   server-only components in `src/render/layout.ts`: written once, rendered into every page.
   Hydrated `define()` components are only for interactive parts; making the header one would
   add framework JavaScript to every page without removing any markup. Measured on Luke's page
   (0.1.0): the chrome is about 2.5 KB raw, 1.1 KB gzipped, against 2.1 KB of content. Each
   page keeps its own copy; that's what makes it complete without JavaScript.

7. **The snapshot is never stored** (not in git, Git LFS or a release). Every machine that
   builds the site rebuilds it from the dump. The ingest hashes the dump first and keeps a
   snapshot built from the same dump by the same code, so an unchanged dump costs about a
   second. Wiring this into `pnpm build`, Docker and CI is `swr-7f1.12`.

## What the ingest measured (`swr-7f1.2`, `swr-7f1.3`)

On the 2026-08-01 dump, 12 cores:

| Measure         | Value                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Articles        | 227,272: 110,469 canon (incl. real-world), 116,803 Legends                                     |
| Redirects       | 79,736                                                                                         |
| Parse failures  | 0                                                                                              |
| Commonest kinds | no infobox 58,376; `Character` 44,162; `System` 11,613; `Person` 10,591; `CelestialBody` 8,585 |
| Time            | 6 min 34 s (titles pass 45 s; parsing 5.5 min on 11 workers)                                   |
| Peak memory     | 6.5 GB with 11 workers (`--workers N` trades time for memory)                                  |
| Snapshot        | 50 MB gzipped, 278 MB raw: 12 JSON Lines shards + redirects                                    |
| Determinism     | two runs byte-identical                                                                        |

- **Parser:** wikiparser-node, not wtf_wikipedia, which flattened fields to strings (losing links)
  and dropped `{{C|…}}` text. About 28 ms per long article, nearly all inside the parser.
- **Format:** gzipped JSON Lines, sorted by title. Parquet for the Explore page will be derived
  from it (`swr-7f1.7`), so DuckDB isn't needed until then.
- **Decompression:** the 7-Zip binary from the `7zip-bin` package; no system install.

## Implementation (epic `swr-7f1`)

| Bead         | Work                                                          | Needs      |
| ------------ | ------------------------------------------------------------- | ---------- |
| `swr-7f1.1`  | Upgrade to Gyral 0.2.0; pin lit-html 3.3.0                    | —          |
| `swr-7f1.2`  | Wikitext parsing: clean infobox fields and lead prose         | `.1`       |
| `swr-7f1.3`  | Dump ingest: stream the 7z into a snapshot; choose the format | `.2`       |
| `swr-7f1.4`  | Generalize kinds to every infobox type                        | `.3`       |
| `swr-7f1.5`  | Merge swapi.info records into Wookieepedia ones               | `.3`       |
| `swr-7f1.6`  | Build at full size: measure and set budgets                   | `.4`       |
| `swr-7f1.7`  | Explore page: DuckDB-WASM over Parquet                        | `.3`       |
| `swr-7f1.8`  | Offline at scale: title index                                 | `.6`       |
| `swr-7f1.9`  | Attribution and CC BY-SA on every page                        | `.3`       |
| `swr-7f1.10` | Render article prose                                          | `.3`, `.9` |
