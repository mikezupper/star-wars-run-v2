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
- **Guard:** `test/data/committed-snapshot.test.ts` checks that every file in `data/` is
  byte-for-byte what `snapshotFiles()` would write, so a reformat or a hand edit fails
  `pnpm check`. Fix such a failure with `pnpm ingest`, not by editing the file.
