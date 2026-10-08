# ADR 0008 — Wookieepedia is the only data source

Status: **accepted** (2026-10-06). Supersedes [0002-data.md](0002-data.md) (swapi.info).
Builds on ADR 0007 (`0007-wookieepedia.md`, on PR #5 until merged).

## Context

The site was built on swapi.info: 259 records with typed numbers and film links. The
Wookieepedia snapshot holds 227,272 articles, and 257 of swapi's 259 records match one of them
(the other two exist there too). swapi.info is a small, basic subset.

## Decision

1. **Wookieepedia replaces swapi.info entirely.** The swapi ingest, its `data/` snapshot and the
   swapi-to-Wookieepedia matcher are removed (`swr-7f1.15`; the matcher's PR #10 was closed
   unmerged). The two things only swapi gave us come from Wookieepedia instead:
   - **appearances**: each article's Appearances section (`swr-7f1.13`), covering every work,
     not only six films;
   - **numbers**: parsed from key infobox fields, alongside the text (`swr-7f1.14`).
2. **Build pages now, on Gyral 0.2.0.** The owner chose to see Wookieepedia pages before 0.3.0
   ships; templates are ported when it does (`swr-7f1.11`).
3. **Sections and URLs.** Every article belongs to one section, chosen by its infobox kind.
   URLs are `/<section>/<slug>/`, with the slug made from the title (`Luke Skywalker/Legends` →
   `luke-skywalker-legends`). The kind-to-section table is data (`src/domain/sections.ts`); a
   kind not in it goes to `other`.

   **Twins** (`swr-a7s`, 2026-10-08): a subject with a canon and a Legends article is one
   subject. Usually the titles are `X` and `X/Legends`; when they differ, Wookieepedia's
   `{{Top}}` names the other one (`legends=Palpatine/Legends` on `Darth Sidious`, `canon=` the
   reverse; a few articles write `leg=` and `can=`). The
   ingest keeps that as `counterpart` (snapshot version 3) and the archive pairs both ways
   (`Entry.twin`). Pages link to their twin, and lists of best-known subjects count a pair once
   under its canon name; Explore and search follow (`swr-cd6`).

   | Section         | Kinds (main ones)                                                        |
   | --------------- | ------------------------------------------------------------------------ |
   | `characters`    | Character, Droid, Family                                                 |
   | `species`       | Species, CulturalGroup                                                   |
   | `planets`       | CelestialBody, Star                                                      |
   | `places`        | Location, City, Structure, Store, RacingTrack                            |
   | `galaxy`        | System, Sector, Region, Nebula, StarCluster, TradeRoute, Galaxy          |
   | `starships`     | StarshipClass, IndividualShip, ShipSeries, SpaceStation, Fleet           |
   | `vehicles`      | RepulsorliftVehicle, GroundVehicle, AirVehicle, AquaticVehicle, Vehicle  |
   | `organizations` | Organization, MilitaryUnit, Company, Government, Religion                |
   | `events`        | Battle, War, Campaign, Mission, Duel, Event, Election, Treaty            |
   | `technology`    | Device, Weapon, Armor, Lightsaber, Artifact, DroidSeries, Clothing       |
   | `lore`          | ForcePower, Language, TitleOrPosition, Year, Era, Food, Plant, Substance |
   | `media`         | Movie, Television…, Book, ComicBook, VideoGame, Magazine…                |
   | `real-world`    | Person, RealCompany, Band, ToyLine, TradingCardSet                       |
   | `other`         | articles with no infobox (58,376: stubs, lists, disambiguation pages)    |

   Kind names are compared without underscores (`Starship_class` is `StarshipClass`).

4. **Lists are paged by letter.** A section page lists its letters with counts; each letter has
   its own page (`/characters/l/`). One page of 47,000 characters would be unusable.
5. **The gate builds a sample.** `pnpm check` prerenders the first articles of each section
   from the real snapshot, so it stays a few minutes long. `pnpm build` builds everything.
   Measuring and tuning the full build is `swr-7f1.6`.

## Numbers from infobox text (`swr-7f1.14`)

`src/domain/quantities.ts` reads numbers from the cleaned field text at build time, not at
ingest, so changing a rule needs no re-ingest. A value is read only when its shape is clear: the
first number, an optional multiplier word (million, billion…), and a unit the quantity accepts.
Length and mass need a unit; counts and credits don't. Qualifiers ("nearly", "approx.") set
`approx`; ranges ("20 to 30 meters", "6 or 7") keep `max`. Values are in one base unit per
column (`height_m`, `mass_kg`, `diameter_km`, `max_speed_kph`…). Pages still show the text.

Parse rates on the 2026-08-01 snapshot (first item of each field):

| Field      | Parsed              | Field      | Parsed          |
| ---------- | ------------------- | ---------- | --------------- |
| height     | 6,482 / 6,959 (93%) | max speed  | 945 / 971 (97%) |
| length     | 3,793 / 4,055 (94%) | weight     | 675 / 798 (85%) |
| cost       | 3,487 / 3,873 (90%) | mass       | 635 / 671 (95%) |
| crew       | 3,211 / 3,685 (87%) | lengthday  | 547 / 563 (97%) |
| passengers | 1,792 / 2,313 (77%) | mglt       | 371 / 380 (98%) |
| hyperdrive | 1,187 / 1,682 (71%) | diameter   | 261 / 284 (92%) |
| population | 977 / 1,240 (79%)   | lengthyear | 194 / 583 (33%) |

The misses are mostly not numbers ("Equipped", "Stationary", "Tall", "Over twenty million").
`lengthyear` stays low on purpose: most years are given in **local** days, which aren't
comparable to standard days, so they're left out rather than mixed in. So are numbers with a
decimal comma ("1,83 meters"): read as a thousands separator, they came out 100 times too big.

## Explore: SQL in the browser (`swr-7f1.7`)

`/explore/` runs DuckDB-WASM in the visitor's browser. No server is involved. (Superseded by
[0010-one-api.md](0010-one-api.md): queries run on the server; see the correction below.)

- **Data:** the build writes `dist/data/archive.duckdb` with three tables: `archive` (one row per
  article: title, name, path, section, kind, era, and the number columns above), `facts` (one
  row per infobox value: title, field, item, text, link) and `appearances` (below). The full
  archive is 90 MB (41 MB gzipped); it was 37 MB before `appearances`. DuckDB attaches it read-only. **Corrected 2026-10-07:** this said DuckDB-WASM fetches only the blocks a query needs, over HTTP ranges. It doesn't: for a DuckDB file it downloads all 88 MB before the first query, and won't open the file without the whole of it. The sample build's 1.3 MB database hid this. [0010-one-api.md](0010-one-api.md) moves queries to the server.
- **Why a DuckDB file, not Parquet:** reading Parquet makes DuckDB-WASM download its parquet
  extension from `extensions.duckdb.org`. The CSP allows only this origin, and should keep doing
  so; DuckDB's own file format needs no extension. In testing, the `eh` build also failed with
  "function signature mismatch" while it tried to load that extension. With the native file, it
  works.
- **Engine:** the `eh` build (WebAssembly exceptions, Baseline), self-hosted under `/duckdb/`:
  36 MB raw, about 8 MB gzipped. Only the Explore page loads it, on the first query. The service
  worker doesn't precache it.
- **Versions:** the build writes with DuckDB 1.5.6 (`@duckdb/node-api`); the browser runs 1.5.4
  (`@duckdb/duckdb-wasm` 1.33). The file pins `STORAGE_VERSION 'v1.2.0'` so the older reader
  can open it.
- **Serving:** Caddy answers range requests. The preview and dev servers do too
  (`scripts/lib/range.ts`), and the dev server serves `/data/` and `/duckdb/` from the last
  build.

## Appearances (`swr-7f1.13`)

An article's Appearances section is a list, one work per line, in the order Wookieepedia gives
it. The ingest reads the section line by line (`src/ingest/wookieepedia/appearances.ts`) rather
than as one parse, since a 700-line `{{ScrollBox}}` or `{{App}}` is mostly lists.

- **What a line names:** its first link; failing that, a citation template's title. Named
  parameters come first (`int`, the article a citation links to; then `story`, `title`,
  `episode`, `book`…), then positional ones that aren't issue numbers, URL paths or video IDs.
  `{{Film|IV}}` and `{{VaderImmortal|II}}` map the numeral to the work's title.
- **How:** marker templates after the work become codes: `1st`, `mo` (mentioned only), `flash`,
  `hologram`… Notes such as `{{C|…}}` and `{{Ab|…}}` are dropped. A `===` subheading containing
  "non-canon" marks the lines under it.
- **Resolution:** each line keeps its candidate titles in order; the first that lands on an
  article (following redirects) becomes the link. A work listed twice becomes one entry with
  both lines' markers.
- **Two meanings:** for a work (the `media` section) the list is its cast — who and what turns
  up in it, grouped on the page by section. For everything else it's the works the subject
  turns up in, numbered, since Wookieepedia orders them in-universe. The site doesn't build a
  reverse index: a work's own list is the authoritative cast.
- **Coverage (2026-08-01 dump):** 146,229 of 227,272 articles have the section, with 2,111,141
  entries; 98.7% link to an article. Most of the rest are HoloNet news items and other
  citations with no article of their own, which stay as text.
- **Explore:** the `appearances` table has one row per entry: title, item, text, link, markers
  (comma-separated codes), noncanon.

## Consequences

- Every machine that builds the site needs the dump (ADR 0007 decision 7), and `pnpm check`
  needs the snapshot. Wiring that into build, Docker and CI is `swr-7f1.12`.
- The swapi-era tests, specs and copy are rewritten against the archive as the pages land.
- Old swapi URLs (`/people/luke-skywalker/`) change (`/characters/luke-skywalker/`). This
  version of the site hasn't been deployed, so nothing links to them yet.
