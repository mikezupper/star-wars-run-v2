# Vendored Gyral 0.3.1-next.9

The `@gyral/*` packages this site uses: core, ssr and testing, all at 0.3.1-next.9.
They were copied from `gyral-tarballs/release-0.3.1-next.9/`, packed from Gyral's
`next` branch at commit `78052c4` with a clean checkout. `SOURCE.json` preserves the
release provenance; it lists the whole release, including packages this site doesn't use.
`SHA256SUMS` contains the release's checksums for the three tarballs and `SOURCE.json`.

**Why:** this is a prerelease for testing, not yet on npm. Vendoring lets a fresh clone,
the Docker build and local CI
install without a sibling `gyral-tarballs` folder.

**Wiring:** `package.json` points each `@gyral/*`
dependency at `file:./vendor/…`, and `pnpm.overrides` points them there too, because the
packages depend on core at exactly `0.3.1-next.9`. The Dockerfile
copies `vendor/` before `pnpm install`.

Verify the copied files from this directory with `sha256sum -c SHA256SUMS`.
For API changes, read the
[0.3.0 to 0.3.1 upgrade guide](../docs/references/gyral/migrating-0-3-0-to-0-3-1.md).

**Removing them** once stable 0.3.1 is on npm:

1. In `package.json`, set every `@gyral/*` dependency to `^0.3.1` and drop their
   `pnpm.overrides` entries.
2. Delete `vendor/`, and its `COPY` lines in the Dockerfile.
3. `pnpm install`, then `pnpm check`.
4. Remove the mentions of `vendor/` in `AGENTS.md` and `docs/design-docs/0001-stack.md`.
