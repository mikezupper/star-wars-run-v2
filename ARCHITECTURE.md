# Architecture

Data comes in once, at ingest time. The build turns it into data files; pages render on request
from one of them, and Cloudflare caches the result (ADR 0011). In production, Caddy serves the
static files and forwards everything else to one app: every page, and Explore's questions
(ADR 0010).

```
dump.7z (local file) ──► src/ingest/wookieepedia (stream, parse, link) ──► data/wookieepedia/
                                                     (rebuilt from the dump, never committed)
data/wookieepedia/ ──► src/data (load) ──► src/domain/archive (sections, slugs, URLs)
                                     └──► src/render (route table, templates) ──► Response
                                                              │
                         scripts/dev.ts: per request ◄────────┤  (archive loaded once at start)
                         src/server/app.ts: per request ◄─────┘  (from dist-api/pages.sqlite)
articles ──► src/domain/links ──► src/server/pages.ts ──► dist-api/pages.sqlite (not public)
articles ──► src/domain/rows ──► scripts/build-database.ts ──► dist-api/archive.duckdb (not public)
browser ──► any page (Caddy, or preview in-process) ──► src/server/app.ts ──► src/render
browser ──► /api/* (Caddy, or dev/preview in-process) ──► src/server (the API):
              /api/ask   ──► the model (key from the environment) + DuckDB, read-only, locked down
              /api/query ──► DuckDB, the same instance
              every question ──► DuckDB: questions.duckdb (the log, its own instance)
src/islands/*.ts ──► vite build ──► dist/assets/   (hydrated in the browser)
src/styles/site.css ──► vite build ──► dist/assets/
public/ ──► copied to dist/
```

Pages come from the Wookieepedia snapshot (ADR 0008). `pnpm ingest:wookieepedia` reads the local
dump; `pnpm build` refreshes that snapshot when needed, then reads it to write the databases
and public files. Neither step needs the network. `pnpm build:sample` (what `pnpm check` runs) builds the first
20 articles of each section plus a few well-known ones. Wookieepedia is the only source: the
swapi.info code and its committed `data/*.json` were removed (`swr-7f1.15`).

## Layers

Code may import only from the layers listed for it. A wrong import is a bug even when it
happens to work: it pulls Node code into the browser, or the network into the build.
`eslint.config.js` enforces this table: a forbidden import fails `pnpm lint` with a message
saying what to do instead. Change the table and the lint rules together.

| Layer                                                 | Runs                                  | Contains                                                                                    | May import                                                                                 |
| ----------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/site.ts`                                         | server and browser                    | Site-wide constants: origin, name, description                                              | nothing                                                                                    |
| `src/labels.ts`                                       | server and browser                    | Every user-facing string (copy lives here only)                                             | `src/domain/` (types)                                                                      |
| `src/domain/`                                         | server and browser                    | Article types, slugs, URLs, Ask's prompts and pipeline. Pure functions only                 | `src/site.ts`                                                                              |
| `src/ingest/`                                         | Node, `pnpm ingest:wookieepedia`      | Read the dump, parse at the boundary, write the snapshot                                    | `src/domain/`, Node built-ins                                                              |
| `src/data/`                                           | Node, build time                      | Read the snapshot in `data/wookieepedia/` into articles                                     | `src/domain/`, Node built-ins                                                              |
| `src/render/`                                         | Node, build and request time          | Route table, page templates (`html`), layout, sitemap                                       | `src/site.ts`, `src/labels.ts`, `src/domain/`, `src/islands/`, `@gyral/core`, `@gyral/ssr` |
| `src/islands/`                                        | browser (and server)                  | Search suggestions and Explore's Gyral components and API clients                           | `src/site.ts`, `src/labels.ts`, `src/domain/`, `@gyral/core`                               |
| `src/page.ts`, `src/hyperspace.ts`, `src/previews.ts` | browser                               | Page controls, native view transitions and article previews                                 | each other, `src/site.ts`, `src/labels.ts`, `src/domain/`                                  |
| `src/offline/`                                        | build (precache list); service worker | What to precache (pure); the worker itself (`sw.ts`)                                        | Workbox                                                                                    |
| `src/hosting/`                                        | build and preview                     | Headers policy, the `Caddyfile`                                                             | `src/domain/`                                                                              |
| `src/server/`                                         | Node, the app (and dev/preview)       | Pages on request from SQLite; `/api/ask`, `/api/query`, the question log; DuckDB, the model | `src/render/`, `src/hosting/`, `src/domain/`, Node built-ins                               |
| `scripts/`                                            | Node                                  | Thin CLIs: dev server, build, preview, ingest, checks                                       | anything                                                                                   |

**Status today:** every layer exists.

Logic belongs in `src/`, not `scripts/`, because coverage only measures `src/`. A script
should parse its arguments and call into `src/`.

## Parse at the boundary

External data is untrusted until it is parsed. `src/ingest/wookieepedia/` turns raw wikitext
into articles: infobox fields and lead prose as text with links, and the Appearances list. It
never passes wikitext along, and an article it can't parse is counted as a failure, not
written. The rest of the code relies on the domain types and never re-checks them. Templates,
references and markup are the parser's problem and nobody else's.

## Rendering

`src/render/site.ts` owns the route table. `createSite()` returns a `fetch(request)` handler
that serves every page. The dev server calls it with the snapshot in memory; the app
(`src/server/app.ts`) calls it with `src/server/pages.ts`, which reads one article from
`pages.sqlite` when its page renders, and adds the ETag and Cache-Control (ADR 0011).

Page templates use `html` from `@gyral/core` and stay server-rendered. The page module handles
the `/` search key, theme controls, service worker registration and the random-article
hyperspace transition; it is render-blocking so `pagereveal` is registered before the first
frame. Interactive parts are `define()` islands: search suggestions use light DOM so the
native GET form, fragment focus and shared stylesheet work before hydration; Explore uses
Declarative Shadow DOM. Gyral's Vite preset discovers their client modules, and `renderPage()`
loads only the components whose tags it rendered. Search appears on every page; Explore
loads on `/explore/`. The server imports each component for rendering.
`src/render/assets.ts` stores the component
Map as JSON entries for `pages.sqlite` and the API bundle, then restores it for rendering.
The API image embeds these assets before `.vite/` is removed, so new code can render old
data without reading a client manifest at runtime. See
[docs/references/gyral/server-rendering.md](docs/references/gyral/server-rendering.md).

Search runs on the server: SQLite full-text indexes in `pages.sqlite`, queried by
`src/server/search.ts` and ranked by `src/domain/search.ts` (names first, then text; twins
folded). It renders `/search/` and answers `/api/search` and Ask's name lookups
([docs/product-specs/search.md](docs/product-specs/search.md)).

Article previews use the same SQLite file. `src/server/pages.ts` reads one article for
`/api/preview?path=…`; `src/domain/preview.ts` limits it to plain text, a first sentence and
three facts. Search and preview GET responses use the public page cache policy. The browser's
`src/previews.ts` installs one native popover for main-content links on devices with a fine
pointer and hover, and keeps a bounded cache. It needs no Gyral island.

URLs always end with a slash (`/characters/luke-skywalker/`). The app answers `/characters`
with a 308 redirect to `/characters/`, and an unknown path with the 404 page. Letter indexes
use `/<section>/letters/<letter>/`, with `/2/`, `/3/` and so on for lists beyond 500 articles.
These paths cannot collide with an article slug. Old letter
URLs redirect to those indexes unless an article owns the old path. Article paths stay the
same in SQLite and DuckDB, so this routing change works with data from earlier builds.

## Output

`dist/` holds the public files: hashed `assets/`, `404.html` (for Caddy's own errors), the
service worker, and `public/` copied as it is. A local data build also writes sitemaps there
for preview and smoke. `dist-api/` holds the private data: `pages.sqlite` (article records and
SQLite search indexes), `archive.duckdb` and `ask-schema.json`.

Production images are built without the archive. The site image serves the public files;
the app image mounts the data read-only and renders pages and sitemaps from the current
routes and archive. Its bundled asset references override those stored by an earlier data
build, and its ETags include both the data build and the code (ADR 0011,
[docs/design-docs/0003-hosting.md](docs/design-docs/0003-hosting.md)).
