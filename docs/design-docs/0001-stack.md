# ADR 0001 — Stack: TypeScript, Vite, Vitest and Gyral, prerendered

Status: **accepted** (2026-10-05)

## Context

The first starwars.run was a Cycle.js page that searched `api.starwars.run` on every
keystroke. That API is dead, Cycle.js has been mostly inactive for years, and the page had no
tests. The rebuild is a content site: search, a page per record, links between records,
offline support.

The owner builds Gyral, a Model-View-Intent framework for web components that grew out of
Cycle.js. gyral.dev and gyral-shop already use it with the toolchain and conventions this
repo follows.

## Decision

- **Gyral** (`@gyral/core`, `@gyral/ssr`) for rendering. Pages are server-only `html`
  templates, prerendered to static files with `prerender()` from `@gyral/ssr/static`.
  Interactive parts are islands built with `define()`. Since 0.3.0 Gyral has its own view layer;
  nothing here depends on Lit.
- **TypeScript** in strict mode, with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`. No Effect.
- **Vite** for the dev server and the client build. **Vitest** for tests.
- **pnpm**, with versions pinned to match gyral.dev. `@gyral/*` is on 0.3.0 (2026-10-07),
  installed from `vendor/` until it's on npm on 2026-10-10 ([vendor/README.md](../../vendor/README.md);
  `swr-7f1.11.7` switches to npm and removes the tarballs from history). The `lit-html` 3.3.0
  pin that 0.2 needed went with Lit.
- **One gate, `pnpm check`:** typecheck, lint, format, tests with coverage, build. A change
  isn't done until it passes.
- **Coverage of at least 80%** on lines, branches, functions and statements, measured over
  `src/`. Below that, `pnpm test` fails, and so does `pnpm check`.
- **CSS:** one stylesheet, written with the `modern-css` skill. Stylelint's floor is Baseline
  _newly_ available; anything newer goes inside `@supports`. No CSS framework.

## Consequences

- Gyral is days old and absent from model training data. Agents must read
  [docs/references/gyral/](../references/gyral/README.md) and the `.d.ts` files in
  `node_modules/@gyral/` rather than guess from Lit or Cycle.js. A gap found here is a Gyral
  issue as well as a bug in this repo.
- Prerendering means no server code in production and pages that work before JavaScript
  loads. Anything that needs per-request data would need a server; nothing does yet.
- Logic must live in `src/` for coverage to count it. `scripts/` stay thin.
