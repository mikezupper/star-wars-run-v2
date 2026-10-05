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
