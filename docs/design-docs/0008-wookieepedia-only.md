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

## Consequences

- Every machine that builds the site needs the dump (ADR 0007 decision 7), and `pnpm check`
  needs the snapshot. Wiring that into build, Docker and CI is `swr-7f1.12`.
- The swapi-era tests, specs and copy are rewritten against the archive as the pages land.
- Old swapi URLs (`/people/luke-skywalker/`) change (`/characters/luke-skywalker/`). This
  version of the site hasn't been deployed, so nothing links to them yet.
