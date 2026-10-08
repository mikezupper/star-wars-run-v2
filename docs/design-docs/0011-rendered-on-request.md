# ADR 0011 — Pages rendered on request, SQLite for pages and search, view transitions

Status: **proposed** (2026-10-08). Supersedes parts of [0003-hosting.md](0003-hosting.md)
(the static `dist/` served by Caddy, Pagefind and the offline search index) and
[0010-one-api.md](0010-one-api.md) ("DuckDB is the one database engine").

## Context

Every page is prerendered: 227,657 of them, into a `dist/` of 3.8 GB in 467,013 files. Pagefind's
index is 952 MB of that, and the title index another 100 MB. The site image is 1.6 GB, and a
change to one template means regenerating every page.

Rendering itself is cheap. The prerender makes all 227,657 pages in about 60 seconds on one
thread: about 0.3 ms a page. `src/render/site.ts` already turns a `Request` into a `Response`,
and the dev server already calls it for every request. Gyral's static and per-request modes
produce the same HTML, so the templates and islands don't change; only when the HTML is made
does.

Search is the hard part to keep static. Pagefind indexes built HTML, ships a large index, and
can't share its ranking with Ask, which resolves names through a separate title index.

## Decision

1. **Pages are rendered on request** by a Node service: the API's service (ADR 0010) grows to
   serve pages too. Caddy stays in front for the hashed assets, icons, headers and compression,
   and forwards everything else. The browser receives the same HTML as today; the two islands
   (the header search and Explore) hydrate as before. No client-side routing.
2. **Cloudflare caches the pages.** Content changes only on a deploy, so pages are sent with
   `public, max-age=300, s-maxage=604800, stale-while-revalidate=86400,
stale-if-error=604800` and an `ETag` from the build. A deploy purges Cloudflare's cache. Cold
   pages in the long tail will still reach the server; at 0.3 ms a render plus one lookup, that
   is fine.
3. **Two engines, each for its kind of work, built from the same snapshot in the same build:**
   - **SQLite serves:** an article by its path, and full-text search. Node 24's built-in
     `node:sqlite` (SQLite 3.51, no dependency) has FTS5, checked on 2026-10-08: prefix
     queries for search as you type, bm25 ranking with title weights, highlighted snippets,
     accent folding (`padme` finds Padmé) and a trigram tokenizer for typos. Opened read-only.
   - **DuckDB answers questions:** Explore's SQL, Ask's queries and the question log, as in
     ADR 0010. DuckDB's full-text search is an extension, which the locked-down instance
     can't load, and it has no prefix search.
4. **Search moves to the server.**
   - `GET /api/search?q=` returns the top matches as you type: one row per name, with its
     section and Canon and Legends badges.
   - `/search/?q=` is a results page rendered on the server: it works without JavaScript, can
     be shared, and is cached by Cloudflare per query.
   - Ranking: exact titles, then redirects ("the Rebel Alliance"), then title prefixes, then
     full text; better-linked articles first within each. "Did you mean" from the trigram index
     when nothing matches.
   - Ask resolves names through the same search, replacing the title index.
   - Pagefind, the title index and `'wasm-unsafe-eval'` in the CSP go.
5. **View transitions between pages:** `@view-transition { navigation: auto; }`, the header
   kept in place, a list link growing into the article's heading (`pageswap` and
   `pagereveal`), and a `Speculation-Rules` header so a hovered link's page is fetched before
   the click. Off under `prefers-reduced-motion`; browsers without cross-document transitions
   navigate as before. This doesn't depend on the rest and ships first.

## Consequences

- The site image shrinks from 1.6 GB to a few MB; the app image carries two database files.
  The build keeps the ingest and loses the prerender of 467k files and the Pagefind crawl.
- Search no longer works offline. Pages already visited still do; the offline search index
  was never workable at this size (`swr-7f1.8`).
- A server can fail where files can't. Health checks, restarts and Cloudflare's stale copies
  (`stale-if-error`, to be confirmed in production) cover it.
- A spike measures page latency from SQLite under load (p50 and p95, uncached), memory and
  image size before the build switches over. If it disappoints, this ADR is revisited.
- The production Docker and compose work waits for this, so it's done once, on the new shape.
