# Architecture

Data comes in once, at ingest time. Every page is rendered once, at build time. The production
server only hands out files.

```
dump.7z (local file) ──► src/ingest/wookieepedia (stream, parse, link) ──► data/wookieepedia/
                                                     (rebuilt from the dump, never committed)
data/wookieepedia/ ──► src/data (load) ──► src/domain/archive (sections, slugs, URLs)
                                     └──► src/render (route table, templates) ──► Response
                                                              │
                         scripts/dev.ts: per request ◄────────┤  (archive loaded once at start)
                         scripts/build.ts: prerender every path → dist/
articles ──► src/domain/rows ──► scripts/build-database.ts ──► dist/data/archive.duckdb (Explore)
src/islands/*.ts ──► vite build ──► dist/assets/   (hydrated in the browser)
src/styles/site.css ──► vite build ──► dist/assets/
public/ ──► copied to dist/
```

Pages come from the Wookieepedia snapshot (ADR 0008). `pnpm ingest:wookieepedia` reads the
dump; `pnpm build` reads the snapshot and nothing else, so a build is reproducible and works
offline once the snapshot exists. `pnpm build:sample` (what `pnpm check` runs) builds the first
20 articles of each section plus a few well-known ones. The swapi.info code in `src/ingest/` and
`data/*.json` is no longer used and goes away with `swr-7f1.15`.

## Layers

Code may import only from the layers listed for it. A wrong import is a bug even when it
happens to work: it pulls Node code into the browser, or the network into the build.
`eslint.config.js` enforces this table: a forbidden import fails `pnpm lint` with a message
saying what to do instead. Change the table and the lint rules together.

| Layer           | Runs                                  | Contains                                                     | May import                                                                         |
| --------------- | ------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/site.ts`   | server and browser                    | Site-wide constants: origin, name, description               | nothing                                                                            |
| `src/labels.ts` | server and browser                    | Every user-facing string (copy lives here only)              | `src/domain/` (types)                                                              |
| `src/domain/`   | server and browser                    | Record types, slugs, link resolution. Pure functions only    | `src/site.ts`                                                                      |
| `src/ingest/`   | Node, `pnpm ingest`                   | Fetch each source, parse at the boundary, write the snapshot | `src/domain/`, Node built-ins                                                      |
| `src/data/`     | Node, build time                      | Read the snapshot in `data/` into domain records             | `src/domain/`, Node built-ins                                                      |
| `src/render/`   | Node, build time                      | Route table, page templates (`serverHtml`), layout, sitemap  | `src/site.ts`, `src/labels.ts`, `src/domain/`, `src/islands/`, `@gyral/ssr`, `lit` |
| `src/islands/`  | browser (and server)                  | Interactive Gyral components hydrated on a page (search)     | `src/site.ts`, `src/labels.ts`, `src/domain/`, `@gyral/core`                       |
| `src/offline/`  | build (precache list); service worker | What to precache (pure); the worker itself (`sw.ts`)         | Workbox                                                                            |
| `src/hosting/`  | build and preview                     | Response headers policy; renders the `Caddyfile`             | nothing                                                                            |
| `scripts/`      | Node                                  | Thin CLIs: dev server, build, preview, ingest, checks        | anything                                                                           |

**Status today:** every layer exists.

Logic belongs in `src/`, not `scripts/`, because coverage only measures `src/`. A script
should parse its arguments and call into `src/`.

## Parse at the boundary

External data is untrusted until it is parsed. `src/ingest/` turns raw source JSON into
domain records and fails loudly on a shape it doesn't expect. It never passes the raw
object along. The rest of the code relies on the domain types and never re-checks them.
swapi.info sends `"unknown"`, `"n/a"` and numbers with commas (`"1,000"`) as strings. Turning
those into typed values is the parser's job and nobody else's.

## Rendering

`src/render/site.ts` owns the route table. `createSite()` returns a `fetch(request)` handler
that serves every page. The dev server calls it once per request; the build calls Gyral's
`prerender()` with every path and writes `dist/<path>/index.html`.

Page templates use `serverHtml` and are never hydrated, so a page without islands ships
**no framework JavaScript**: only `src/page.ts`, a few hundred bytes for the `/` search
key. Interactive parts are islands: `define()` components rendered with Declarative Shadow DOM
and hydrated in place by `src/entry-client.ts`, which loads only on pages that set
`islands: true` (today, `/search/`). See
[docs/references/gyral/server-rendering.md](docs/references/gyral/server-rendering.md).

Search: after prerendering, `scripts/build.ts` runs Pagefind over the record pages (the ones
whose `<main>` has `data-pagefind-body`) and writes a static index to `dist/pagefind/`. The
search island loads it in the browser. A record's `<h1>` is weighted up and its relationship
lists down, so a record's own page outranks pages that merely link to it.

URLs always end with a slash (`/people/luke-skywalker/`). `normalise()` in
`src/render/site.ts` makes `/people` and `/people/` the same route. Preview answers `/people`
with a 308 redirect to `/people/`.

## Output

`dist/` is a static site: `index.html` per path, `404.html`, `sitemap.xml`, hashed
`assets/`, and `public/` copied as it is. The Docker image (`swr-3mo.10`) serves it with the
cache headers described in
[docs/design-docs/0003-hosting.md](docs/design-docs/0003-hosting.md).
