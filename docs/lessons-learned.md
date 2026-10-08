# Lessons learned

Real bugs found in this repo, so the next agent doesn't rediscover them. Add an entry when
you fix a bug. Style preferences don't count. Newest first.

Each entry has four parts:

- **Symptom:** what someone saw.
- **Cause:** why it happened.
- **Fix:** what changed, with the commit.
- **Guard:** the test, lint rule or check that now catches it. If there is none, say why,
  and file a bead for one.

---

## The Ask smoke query hid Luke beyond the displayed rows (2026-10-07)

- **Symptom:** the full-archive smoke test failed its Luke Skywalker link assertion for
  "Who comes from Tatooine?". The sample test and the live question passed.
- **Cause:** the stubbed SQL sorted 670 matching characters alphabetically. Luke was 348th,
  beyond Ask's 200-row display cap, so his row never reached the page.
- **Fix:** the smoke query puts the asserted article first, then sorts the rest by name
  (`swr-uvj`). It still searches the real database and keeps the link assertion.
- **Guard:** `checkAsk()` in `scripts/smoke.mjs` checks the link, accessibility and the model
  being unavailable. Run it against a full build as well as the gate's sample.

## Gyral's template locations counted as uncovered branches (2026-10-07)

- **Symptom:** upgrading to Gyral 0.3.1-next.1 left all 223 unit tests passing, but branch
  coverage fell to 77.42%. Several fully exercised page templates reported 50% branch coverage.
- **Cause:** the new `gyral:template-locations` plugin rewrites each template tag as
  `html.at?.("file:line:column") ?? html`. Its source map attributes those generated fallback
  branches to the application's template, and V8 counts the unused fallback as uncovered.
- **Fix:** `vitest.config.ts` omits that diagnostic plugin from Node tests and keeps the rest
  of the Gyral preset (`swr-72v`). Tests exercise the original tags. The dev server still uses
  the full preset and reports template source locations.
- **Guard:** the 80% coverage gate stays in place. `pnpm smoke` checks both production
  hydration and the dev server with the full preset.

## A decimal comma made a clone 183 meters tall (2026-10-06)

- **Symptom:** Explore's "Tallest characters" listed an unidentified clone navigation officer at
  183 m, the canon article for the same person said 1.83 m.
- **Cause:** The Legends article writes "1,83 meters", with a decimal comma. The number pattern
  took any comma as a thousands separator, so "1,83" became 183. 22 field values in the snapshot
  start with a decimal-comma number.
- **Fix:** In `src/domain/quantities.ts`, a comma counts only in proper thousands groups
  (`1,830`), and a number directly followed by `,<digit>` is ambiguous and isn't read.
- **Guard:** `test/domain/quantities.test.ts` covers "1,83 meters", "1,9 meters" and "2,5
  million" (not read) and "1,830 meters" (read). Found by eyeballing Explore's results on the
  full archive: worth doing after any parsing change.

## A 50 MB generated snapshot got committed on another branch (2026-10-06)

- **Symptom:** An ADR-only commit on `spike/wookieepedia` also added all of `data/wookieepedia/`
  (12 shards, 50 MB), and it was pushed to an open PR. The owner had decided the snapshot is
  never stored.
- **Cause:** The ignore rule for `data/wookieepedia/` existed only on the branch that created
  the snapshot. After switching branches, the files were untracked but not ignored, and
  `git add -A` picked them up.
- **Fix:** The commit was rebuilt with only the ADR, and the PR branch was force-pushed with
  `--force-with-lease` (owner approved); nothing had reached `main`. Every branch that touches
  Wookieepedia work now ignores `data/wookieepedia/`.
- **Guard:** Stage files by name, not with `git add -A`, after switching to a branch made
  before a new generated directory existed, and check `git show --stat` before pushing. No
  automated check yet: a pre-push size guard is a possible follow-up.

## Search failed on the dev server: no index at /pagefind/ (2026-10-05)

- **Symptom:** On `pnpm dev` (http://localhost:5500), search said "The search index didn't
  load". It worked on `pnpm preview` and in the Docker image.
- **Cause:** Pagefind builds the index from the finished pages at the end of `pnpm build`, into
  `dist/pagefind/`. The dev server renders pages per request and never serves `dist/`, so
  `/pagefind/pagefind.js` fell through to the 404 page.
- **Fix:** `scripts/dev.ts` serves `/pagefind/*` from the last build's `dist/pagefind/`. With
  no build, it answers a plain-text 404 that says to run `pnpm build`.
- **Guard:** `pnpm smoke` starts the dev server and searches on it (`checkDevServer` in
  `scripts/smoke.mjs`, from `swr-etv`). Breaking the `/pagefind/` route again fails it.

## Search failed offline: Pagefind's `?ts=` missed the precache (2026-10-05)

- **Symptom:** With the network off, /search/ showed nothing and logged "Failed to load
  Pagefind metadata", although every Pagefind file was precached.
- **Cause:** pagefind.js requests `pagefind-entry.json?ts=<timestamp>` to bust caches. Workbox
  matches precache URLs including their query, so the request missed and went to the network.
- **Fix:** `src/offline/sw.ts` passes `/^ts$/` in `ignoreURLParametersMatching`, alongside the
  search page's own `q` and `kind`.
- **Guard:** `pnpm smoke` searches with the network off (`checkOffline` in
  `scripts/smoke.mjs`).

## `pnpm format` rewrote the generated snapshot (2026-10-05)

- **Symptom:** Running `pnpm ingest` twice changed every file in `data/`, even
  `meta.json`, whose contents never change. It looked as if the ingest weren't
  deterministic.
- **Cause:** `pnpm format` had run Prettier over `data/*.json` and folded short arrays onto
  one line. The ingest then wrote its own format back. Two tools disagreeing about the same
  files.
- **Fix:** `data/` is in `.prettierignore`. Generated files belong to their generator.
- **Guard:** `test/data/committed-snapshot.test.ts` checked that every file in `data/` was
  byte-for-byte what the ingest would write. It went with the swapi.info source
  (`swr-7f1.15`); the Wookieepedia snapshot isn't committed, and `data/` stays in
  `.prettierignore`.

## The service worker precached the whole search index (2026-10-06)

- **Symptom:** The first full build (`swr-7f1.6`) wrote an 18 MB `sw.js` listing 228,489 files
  to precache: every visitor's first page load would have started downloading 131 MB of search
  index. Building that list also read every file in `dist/` into memory, 1.7 GB of it.
- **Cause:** `src/offline/precache.ts` precached all of `pagefind/`, a rule written when the
  site had 260 pages and the index was a few hundred KB. Nothing measured it at full size.
- **Fix:** the precache keeps Pagefind's runtime only; `src/offline/sw.ts` caches index chunks
  and fragments as searches fetch them. `scripts/build-sw.ts` decides by path before reading a
  file.
- **Guard:** `test/offline/precache.test.ts` checks that index chunks and fragments aren't
  precached, and the build logs the precache count and the size of `sw.js` on every run.

## Search buried the obvious answer at full size (2026-10-06)

- **Symptom:** On the full archive, "tatooine" listed Tatooine/3 and Tatooine wine but not the
  planet in its top five; "luke" listed stunt performers named Luke. The same searches passed
  on the sample build, so `pnpm check` stayed green.
- **Cause:** Pagefind ranks by text: how often and how densely a page uses the words. With
  227,000 pages there are hundreds of short pages dense with "Tatooine", and nothing tells
  Pagefind which page matters most. The sample had too few pages to show it.
- **Fix:** a title index (`src/domain/titles.ts`, swr-357) ranks title and redirect matches by
  how many articles link to each, and the search island lists its best five above Pagefind's.
- **Guard:** `SMOKE_PAGES=1000 pnpm smoke` against a full build runs the same search checks
  (`SEARCHES` in `scripts/smoke.mjs`). Run it after changing search; the gate's sample can't
  catch ranking at scale.

## The Docker build sent all of ~/Downloads to the daemon (2026-10-06)

- **Symptom:** The first `pnpm docker:build` with the dump (`swr-7f1.12`) spent 25 seconds
  "transferring dump: 4.87GB", for a 262 MB file.
- **Cause:** the dump's folder, `~/Downloads`, was the `dump` build context. BuildKit sends a
  local context folder whole, whatever the Dockerfile reads from it.
- **Fix:** `scripts/docker-build.ts` hard-links the dump into a folder of its own,
  `node_modules/.cache/swr-docker-dump/`, and uses that as the context: 275 MB sent. It's on
  the checkout's filesystem because `/tmp` here is another disk, where a link fails and the
  dump gets copied; and it's one fixed folder, reset each run, because an interrupted build
  skipped the cleanup of a temporary one. `scripts/ci-local.ts` mounts the dump file alone, not
  its folder, for the same reason.
- **Guard:** the build log shows the transfer size; it should match the dump's. Never pass a
  personal folder as a Docker context or volume.

## The dev server crashed after every answer from /api/ask (2026-10-07)

- **Symptom:** The first question on Explore got its answer; the dev server then died with
  `Unhandled 'error' event … AbortError`, so the follow-up never came back.
- **Cause:** `scripts/lib/ask.ts` aborted the upstream request on the response's `close` event,
  meaning to catch a visitor leaving mid-answer. But Node fires `close` after a response ends
  normally too, and the streamed body piped with `.pipe()` then emitted an AbortError that
  nothing handled.
- **Fix:** abort only when `!res.writableFinished`, and stream with `pipeline()` from
  `node:stream/promises`, whose errors are caught, so a broken stream ends one response, not the
  process.
- **Guard:** none automatic yet: the smoke test stubs the model. Ask two questions in a row on
  `pnpm dev` after touching the proxy.

## Explore answered from a 393-article database in dev (2026-10-07)

- **Symptom:** On `pnpm dev`, Ask the archive found nothing for most questions: "Han Solo
  (no article by that name)", "Obi-Wan Kenobi (no article…)". The same questions had worked an
  hour earlier.
- **Cause:** the dev server renders pages from the full archive, but serves search, the title
  index and Explore's database from the last build in `dist/`. `pnpm check` runs
  `pnpm build:sample`, which wrote its 20-per-section sample into the same `dist/`, so every
  gate run silently swapped the full build for the sample. It had bitten before (Explore's
  database), each time fixed by rebuilding.
- **Fix:** builds write to `DIST_DIR` (default `dist`); `pnpm build:sample` and the gate's smoke
  use `.sample/`, so the gate never touches the full build. Making that change exposed a second
  bug: Vite's watcher skips only its output folder, so with `.sample/` as the output it crawled
  `dist/`'s 456k files and the dev server took two minutes to start. `scripts/dev.ts` now ignores
  every generated folder explicitly.
- **Guard:** the gate leaves `dist/` alone by construction; the dev server's start time is in the
  smoke test (it fails after 120 s).

## Explore downloaded 96 MB before its first answer (2026-10-07)

- **Symptom:** On the full build, the first question in Explore took most of a minute on a fast
  connection, and the network panel showed one 88 MB request for `archive.duckdb` plus 8 MB of
  DuckDB-WASM. The gate's smoke test, on the sample, ran the same question in a second.
- **Cause:** ADR 0008 assumed DuckDB-WASM reads a database file with HTTP range requests, block
  by block. It doesn't: it fetches the whole file before opening it, and refuses to open it when
  whole-file reads are turned off. The sample's database is 1.3 MB, so nothing the gate measured
  showed it.
- **Fix:** ADR 0010. The database left the public site; the API runs every query on the server,
  with DuckDB opened read-only and locked down. The browser sends a question and reads a stream
  of events.
- **Guard:** ADR 0010 asks for changes to the questions side to be measured on the full build
  before they merge; `src/server/` has no browser bytes to grow. The lock-down has its own tests
  (`test/server/api.test.ts`).

## The question log couldn't be read while the API ran (2026-10-07)

- **Symptom:** In the Docker stack, opening `/data/questions.duckdb` read-only from a second
  process failed: "Could not set lock on file … Conflicting lock is held in node (PID 1)". The
  ADR said to mine the log with the DuckDB CLI, which couldn't open it either.
- **Cause:** DuckDB lets one process at a time open a database file, readers included. The API
  opened the log at start and held it for its whole life.
- **Fix:** the log opens its file only to write a row, one write at a time, and closes it. A
  write that finds a reader holding the file waits and retries for up to 30 seconds.
- **Guard:** a test in `test/server/api.test.ts` holds the file open read-only while a row is
  added, then checks both rows landed.

## Vite inlined small font files, and the CSP blocked them (2026-10-08)

- **Symptom:** After the new look's fonts went in, smoke failed on every page with console
  errors: "Loading the font 'data:font/woff2;base64,…' violates the Content Security Policy".
  The pages looked right in a quick check, because the browser fell back to the next face.
- **Cause:** Vite inlines any imported asset under 4 KB as a `data:` URI. Some fontsource
  subsets (Chakra Petch's latin-ext, a few hundred glyphs) are that small, so they arrived in the
  stylesheet as `data:` fonts, which `font-src 'self'` refuses.
- **Fix:** `build.assetsInlineLimit` in `vite.config.ts` keeps `.woff2` files as files, however
  small; the CSP is unchanged.
- **Guard:** smoke fails on any console error, which is how this surfaced.

## axe measured a button halfway through a color change (2026-10-08)

- **Symptom:** Smoke failed once with a contrast error on the header's Sections button, only on
  "/search/ with results (dark)"; the same page passed in the full dark-scheme sweep.
- **Cause:** that step switches the page from light to dark with `emulateMedia` and runs axe at
  once. Links and buttons ease their colors over 150 ms, so axe read a gray mid-crossfade text on
  a gray mid-crossfade background.
- **Fix:** the step waits until `document.getAnimations()` is empty before running axe.
- **Guard:** any later step that changes the scheme on a live page must wait the same way.

## An aborted view transition threw an unhandled error (2026-10-08)

- **Symptom:** Smoke reported a page error on /search/: "Transition was aborted because of
  invalid state. ViewTransition opt-in disabled". It didn't show on every run.
- **Cause:** `src/page.ts` restored the followed link's transition name with
  `viewTransition.finished.finally(…)`. When the browser aborts a transition, `finished` rejects,
  and `.finally()` passes the rejection on to a promise nothing handled.
- **Fix:** `finished.then(restore, restore)`: the names come back either way and nothing is left
  unhandled. A unit test rejects `finished` and checks.
- **Guard:** the test, and smoke's failure on any page error. Shipped in PR #21; fixed on the
  new-look branch.
