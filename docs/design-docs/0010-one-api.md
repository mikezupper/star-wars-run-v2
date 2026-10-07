# ADR 0010 — Static content, one API: Ask, SQL and the question log on the server

Status: **accepted** (2026-10-07). Epic `swr-ys4`. Supersedes parts of
[0008-wookieepedia-only.md](0008-wookieepedia-only.md) ("Explore") and
[0009-ask.md](0009-ask.md) (where Ask's steps run, the question log's store).

## Context

The site is two kinds of thing:

- **Content:** 227,000 article pages, sections, search and offline. Read-only, rebuilt when the
  dump changes (rarely). Prerendered to static files, served by Caddy, cached by Cloudflare.
- **Questions:** Ask the archive and the SQL editor. Ask needs a server (the model's key); the
  question log needs a place to write.

The questions side grew piece by piece, and stopped being one design:

1. **Explore ran SQL in the browser** with DuckDB-WASM, on the premise that it reads only the
   blocks a query needs over HTTP ranges (0008). That's false for a DuckDB database file: the
   WASM build downloads the whole file before it can open it, and refuses to open it at all
   when whole-file reads are disallowed. Measured on the full archive (2026-10-07): the first
   query, even a lookup of one title, downloads 88 MB of database plus 8 MB of engine. Only
   Parquet supports partial reads, and Parquet makes DuckDB-WASM fetch an extension from a
   third-party domain, which the CSP rightly blocks. The 1.3 MB sample database the gate builds
   hid this.
2. **Ask** (0009) added a server for the model's key, but kept the pipeline in the browser:
   five round trips through a pass-through proxy, and the same 96 MB download before the first
   answer.
3. **The question log** added a second, different server (Node with SQLite) that the browser
   had to call after each question.

One feature in three places, two database engines, and 96 MB per visitor before an answer.

Hosting is settled: a VPS running Docker, behind Cloudflare (0003). (v2.starwars.run is a
static deployment of the earlier swapi build; Cloudflare's static hosting can't hold this one:
it allows 100,000 files and 25 MiB per file, and the build is about 466,000 files with an 88 MB
database.)

## Decision

**Content stays static. Everything that answers a question moves into one API service.**

```
browser ──► Caddy ──► static files: pages, search (Pagefind), title index, offline
                 └──► /api/* ──► api (Node) ──► DuckDB: archive.duckdb (read-only)
                                     │            DuckDB: questions.duckdb (the log)
                                     └──► the model's endpoint (key from the environment)
```

1. **One API service** (`src/server/`, its own container, Node 24) answers:
   - `POST /api/ask`: the whole Ask pipeline (plan, resolve names, write SQL, check and run it,
     summarize), streamed back as server-sent events, one per step, then the answer. The browser
     sends a question and its history; it never sees the model or the key.
   - `POST /api/query`: the SQL editor's queries, with the same checks: one `SELECT`, a row cap,
     a time limit.
     The pure parts (prompts, checks, row merging) stay in `src/domain/` and move unchanged.
2. **DuckDB is the one database engine, on the server.**
   - **The archive:** the build's `archive.duckdb`, opened read-only from the API's own disk, so
     a query reads only what it needs. Visitors' SQL runs in an instance locked down after the
     database is attached: `enable_external_access = false` (no files, no network, no
     extensions), `lock_configuration = true`, a memory limit and a statement time limit.
   - **The question log:** `questions.duckdb` on a volume, in a separate DuckDB instance that
     visitors' SQL can't reach. The API opens it only to write a row, so the DuckDB CLI can read it
     while the API runs; mining it can join the archive: `ATTACH` both.
     SQLite and `node:sqlite` go; so does DuckDB-WASM (and its 8 MB engine in `dist/duckdb/`).
3. **The database leaves the public site.** The build writes it next to `dist/`, not in it;
   the API image carries it with the title index and Ask's schema. Caddy serves no `.duckdb`.
4. **The browser's Explore island becomes a thin client:** a question box that reads the event
   stream, and a SQL box that posts to `/api/query`. Results render as before (one row per
   name, Canon and Legends badges).
5. **Locally,** the dev and preview servers run the same API handler in-process, from `.env`,
   with the full build's database (`dist/` stays the full build; the gate builds `.sample/`).
   The smoke test stubs the model on the server side, not by intercepting the browser.
6. **Two containers in production** (`compose.yaml`): `site` (Caddy, static files, forwards
   `/api/*`) and `api` (Node, DuckDB, the model's settings in its environment, the log on a
   volume). The API owns `ASK_ORIGIN`, `ASK_KEY` and `ASK_MODEL`; Caddy no longer needs them.

**Assumed:** visitors write nothing but the question log (no accounts, favorites or uploads). A
feature that lets visitors write data would need an application database and its own ADR.

## Consequences

- A visitor's first answer costs one request and a few KB, not 96 MB; Ask and SQL work on a
  phone. Explore still needs the network, as Ask always did; content pages and search stay
  offline-capable.
- Every question and SQL query runs on the VPS: DuckDB on a local, read-only file is cheap, but
  it's now our CPU and memory, bounded by the limits above. No rate limit, as the owner chose.
- Running visitors' SQL on the server is the one new risk; the lock-down settings, the separate
  log instance and the read-only attach are what keep it a query engine and nothing more. Tests
  check that `read_csv('/etc/passwd')`, `ATTACH`, `INSTALL`, `COPY` and writes all fail.
- The gate tests the sample; scale problems hide there (search ranking, the 96 MB download).
  Changes to the questions side are also measured on the full build before they merge.

## Measured (2026-10-07, the full archive)

- Before: a first answer downloaded 88 MB of database and 8 MB of engine. After: no database
  bytes reach the browser; Explore's JavaScript is part of the 21 KB (gzip) entry bundle.
- A ready-made SQL question runs in 6 ms on the server; Ask answers in about 7 seconds, nearly
  all of it the model.
