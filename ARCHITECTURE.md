# Architecture

Data comes in once, at ingest time. Every page is rendered once, at build time. The production
server only hands out files.

```
swapi.info ──► src/ingest (fetch, parse, slug, link) ──► data/*.json   (committed snapshot)
                                                              │
data/*.json ──► src/data (load) ──► src/render (route table, templates) ──► Response
                                                              │
                         scripts/dev.ts: per request ◄────────┤
                         scripts/build.ts: prerender every path → dist/
src/islands/*.ts ──► vite build ──► dist/assets/   (hydrated in the browser)
src/styles/site.css ──► vite build ──► dist/assets/
public/ ──► copied to dist/
```

`pnpm ingest` is the only step that touches the network. `pnpm build` reads `data/` and
nothing else, so a build is reproducible and works offline.

## Layers

Code may import only from the layers listed for it. A wrong import is a bug even when it
happens to work: it pulls Node code into the browser, or the network into the build.
`eslint.config.js` enforces this table: a forbidden import fails `pnpm lint` with a message
saying what to do instead. Change the table and the lint rules together.

| Layer          | Runs                 | Contains                                                     | May import                                                        |
| -------------- | -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `src/site.ts`  | server and browser   | Site-wide constants: origin, name, description               | nothing                                                           |
| `src/domain/`  | server and browser   | Record types, slugs, link resolution. Pure functions only    | `src/site.ts`                                                     |
| `src/ingest/`  | Node, `pnpm ingest`  | Fetch each source, parse at the boundary, write the snapshot | `src/domain/`, Node built-ins                                     |
| `src/data/`    | Node, build time     | Read the snapshot in `data/` into domain records             | `src/domain/`, Node built-ins                                     |
| `src/render/`  | Node, build time     | Route table, page templates (`serverHtml`), layout, sitemap  | `src/site.ts`, `src/domain/`, `src/islands/`, `@gyral/ssr`, `lit` |
| `src/islands/` | browser (and server) | Interactive Gyral components hydrated on a page (search)     | `src/site.ts`, `src/domain/`, `@gyral/core`                       |
| `scripts/`     | Node                 | Thin CLIs: dev server, build, preview, ingest, checks        | anything                                                          |

**Status today:** every layer exists except `src/islands/`, which arrives with `swr-3mo.6`.

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
**no JavaScript**. Interactive parts are islands: `define()` components rendered with
Declarative Shadow DOM and hydrated in place. See
[docs/references/gyral/server-rendering.md](docs/references/gyral/server-rendering.md).

URLs always end with a slash (`/people/luke-skywalker/`). `normalise()` in
`src/render/site.ts` makes `/people` and `/people/` the same route. Preview answers `/people`
with a 308 redirect to `/people/`.

## Output

`dist/` is a static site: `index.html` per path, `404.html`, `sitemap.xml`, hashed
`assets/`, and `public/` copied as it is. The Docker image (`swr-3mo.10`) serves it with the
cache headers described in
[docs/design-docs/0003-hosting.md](docs/design-docs/0003-hosting.md).
