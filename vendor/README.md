# Vendored Gyral 0.3.0

The `@gyral/*` 0.3.0 packages this site uses: core, ssr and testing. They were packed from
Gyral's release commit `e79abd6` (`SOURCE.json`), and they're byte-identical to the tarballs
gyral.dev vendors. The other 0.3.0 packages (devtools, http, router, time, mcp, create-gyral)
aren't used here, so they aren't copied.

**Why:** 0.3.0 is released on GitHub but won't be on npm until 2026-10-10. Vendoring lets the
upgrade (`swr-7f1.11`) land before then, and lets a fresh clone, the Docker build and local CI
install without a sibling `gyral-tarballs` folder.

**Wiring** (part of the upgrade, not yet done): `package.json` points each `@gyral/*`
dependency at `file:./vendor/…`, and `pnpm.overrides` points them there too, because the
packages depend on each other at exactly `0.3.0`, which npm doesn't have yet. The Dockerfile
copies `vendor/` before `pnpm install`.

**Removing them** once 0.3.0 is on npm:

1. In `package.json`, set every `@gyral/*` dependency to `^0.3.0` and drop their
   `pnpm.overrides` entries.
2. Delete `vendor/`, and its `COPY` line in the Dockerfile.
3. `pnpm install`, then `pnpm check`.
4. Remove the mentions of `vendor/` in `AGENTS.md` and `docs/design-docs/0001-stack.md`.
