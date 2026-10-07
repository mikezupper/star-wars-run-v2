# Architecture

Data comes in once, at ingest time. Every page is rendered once, at build time. In production,
Caddy hands out those files, and one API service answers Explore's questions (ADR 0010).

```
dump.7z (local file) ──► src/ingest/wookieepedia (stream, parse, link) ──► data/wookieepedia/
                                                     (rebuilt from the dump, never committed)
data/wookieepedia/ ──► src/data (load) ──► src/domain/archive (sections, slugs, URLs)
                                     └──► src/render (route table, templates) ──► Response
                                                              │
                         scripts/dev.ts: per request ◄────────┤  (archive loaded once at start)
                         scripts/build.ts: prerender every path → dist/
articles ──► src/domain/rows ──► scripts/build-database.ts ──► dist-api/archive.duckdb (not public)
articles ──► src/domain/titles ──► dist/search-titles/ (search: title matches first; Ask's names)
browser ──► /api/* (Caddy, or dev/preview in-process) ──► src/server (the API):
              /api/ask   ──► the model (key from the environment) + DuckDB, read-only, locked down
              /api/query ──► DuckDB, the same instance
              every question ──► DuckDB: questions.duckdb (the log, its own instance)
src/islands/*.ts ──► vite build ──► dist/assets/   (hydrated in the browser)
src/styles/site.css ──► vite build ──► dist/assets/
public/ ──► copied to dist/
```

Pages come from the Wookieepedia snapshot (ADR 0008). `pnpm ingest:wookieepedia` reads the
dump; `pnpm build` reads the snapshot and nothing else, so a build is reproducible and works
offline once the snapshot exists. `pnpm build:sample` (what `pnpm check` runs) builds the first
20 articles of each section plus a few well-known ones. Wookieepedia is the only source: the
swapi.info code and its committed `data/*.json` were removed (`swr-7f1.15`).

## Layers

Code may import only from the layers listed for it. A wrong import is a bug even when it
happens to work: it pulls Node code into the browser, or the network into the build.
`eslint.config.js` enforces this table: a forbidden import fails `pnpm lint` with a message
saying what to do instead. Change the table and the lint rules together.

| Layer           | Runs                                    | Contains                                                                    | May import                                                                                 |
| --------------- | --------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/site.ts`   | server and browser                      | Site-wide constants: origin, name, description                              | nothing                                                                                    |
| `src/labels.ts` | server and browser                      | Every user-facing string (copy lives here only)                             | `src/domain/` (types)                                                                      |
| `src/domain/`   | server and browser                      | Article types, slugs, URLs, Ask's prompts and pipeline. Pure functions only | `src/site.ts`                                                                              |
| `src/ingest/`   | Node, `pnpm ingest:wookieepedia`        | Read the dump, parse at the boundary, write the snapshot                    | `src/domain/`, Node built-ins                                                              |
| `src/data/`     | Node, build time                        | Read the snapshot in `data/wookieepedia/` into articles                     | `src/domain/`, Node built-ins                                                              |
| `src/render/`   | Node, build time                        | Route table, page templates (`html`), layout, sitemap                       | `src/site.ts`, `src/labels.ts`, `src/domain/`, `src/islands/`, `@gyral/core`, `@gyral/ssr` |
| `src/islands/`  | browser (and server)                    | Interactive Gyral components: search, Explore (a client of the API)         | `src/site.ts`, `src/labels.ts`, `src/domain/`, `@gyral/core`                               |
| `src/offline/`  | build (precache list); service worker   | What to precache (pure); the worker itself (`sw.ts`)                        | Workbox                                                                                    |
| `src/hosting/`  | build and preview                       | Headers policy, the `Caddyfile`                                             | `src/domain/`                                                                              |
| `src/server/`   | Node, the API service (and dev/preview) | `/api/ask`, `/api/query`, the question log; DuckDB, the model               | `src/hosting/`, Node built-ins                                                             |
| `scripts/`      | Node                                    | Thin CLIs: dev server, build, preview, ingest, checks                       | anything                                                                                   |

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
that serves every page. The dev server calls it once per request; the build calls Gyral's
`prerender()` with every path and writes `dist/<path>/index.html`.

Page templates use `html` from `@gyral/core`, rendered on the server and never hydrated, so a
page without islands ships **no framework JavaScript**: only `src/page.ts`, a few hundred bytes
for the `/` search key. Interactive parts are islands: `define()` components rendered with
Declarative Shadow DOM. `src/entry-client.ts` imports them, and Gyral hydrates each one in
place, loading its hydration code lazily. The entry loads only on pages that set
`islands: true` (today, `/search/` and `/explore/`). See
[docs/references/gyral/server-rendering.md](docs/references/gyral/server-rendering.md).

Search: after prerendering, `scripts/build.ts` runs Pagefind over the article pages (the ones
whose `<main>` has `data-pagefind-body`) and writes a static index to `dist/pagefind/`. The
search island loads it in the browser. An article's `<h1>` is weighted up, its facts down, and
its Appearances list left out, so an article's own page outranks pages that merely link to it.

URLs always end with a slash (`/people/luke-skywalker/`). `normalise()` in
`src/render/site.ts` makes `/people` and `/people/` the same route. Preview answers `/people`
with a 308 redirect to `/people/`.

## Output

`dist/` is a static site: `index.html` per path, `404.html`, `sitemap.xml`, hashed
`assets/`, and `public/` copied as it is. The Docker image (`swr-3mo.10`) serves it with the
cache headers described in
[docs/design-docs/0003-hosting.md](docs/design-docs/0003-hosting.md).
