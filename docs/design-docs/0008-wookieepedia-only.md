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

`/explore/` runs DuckDB-WASM in the visitor's browser. No server is involved.

- **Data:** the build writes `dist/data/archive.duckdb` with two tables: `archive` (one row per
  article: title, name, path, section, kind, era, and the number columns above) and `facts` (one
  row per infobox value: title, field, item, text, link). The full archive is 37 MB (18 MB
  gzipped). DuckDB attaches it read-only and fetches only the blocks a query needs, through
  HTTP range requests.
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

## Consequences

- Every machine that builds the site needs the dump (ADR 0007 decision 7), and `pnpm check`
  needs the snapshot. Wiring that into build, Docker and CI is `swr-7f1.12`.
- The swapi-era tests, specs and copy are rewritten against the archive as the pages land.
- Old swapi URLs (`/people/luke-skywalker/`) change (`/characters/luke-skywalker/`). This
  version of the site hasn't been deployed, so nothing links to them yet.
