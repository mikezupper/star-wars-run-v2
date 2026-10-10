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
  templates, rendered on request with `renderPage()` from `@gyral/ssr` (ADR 0011).
  Interactive parts are islands built with `define()`. Since 0.3.0 Gyral has its own view layer;
  nothing here depends on Lit.
- **TypeScript** in strict mode, with `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`. No Effect.
- **Vite** for the dev server and the client build. **Vitest** for tests.
- **pnpm**, with versions pinned to match gyral.dev. `@gyral/*` is on the 0.3.1-next.9
  prerelease (2026-10-10), installed from `vendor/` until 0.3.1 is on npm
  ([vendor/README.md](../../vendor/README.md);
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
- Pages work before JavaScript loads. ADR 0011 supersedes the original prerendering
  decision: a Node app renders pages from SQLite, with Cloudflare caching its responses.
- Logic must live in `src/` for coverage to count it. `scripts/` stay thin.

## Gyral 0.2 to 0.3 (`swr-7f1.11`, 2026-10-07)

0.3.0 replaces Lit with Gyral's own view layer. The migration was small: imports
(`serverHtml` → `html` from `@gyral/core`), two `.value=` bindings the template rules now
reject, and tests that read the server's development markers. Measured on the full archive on
the same machine (0.2.0 on 2026-10-06, 0.3.0 on 2026-10-07):

| Measure                           | 0.2.0      | 0.3.0                       |
| --------------------------------- | ---------- | --------------------------- |
| `entry-client.js` (islands), gzip | 61.9 KB    | 18.7 KB, plus 2.8 KB lazily |
| Full build (227,657 pages)        | 7 min 22 s | 2 min 55 s                  |
| Prerendering alone                | 297 s      | 58 s                        |
| Peak memory                       | 10.3 GB    | 10.1 GB                     |

The lazy 2.8 KB is the hydration chunk, fetched only by pages with islands. Prerendering is 5
times faster because 0.3 renders synchronously, with no DOM shim. 0.3 also made a strict style
policy possible: the islands' `<style>` elements are allowed by hash, and `style-src` has no
`'unsafe-inline'` ([0003-hosting.md](0003-hosting.md)).

## Gyral 0.3.1 prerelease (`swr-7f1.11.8`, 2026-10-07)

Core, ssr and testing use 0.3.1-next.1 from the release bundle at commit `bd2acc9`.
The site's templates and APIs need no migration; the obsolete
`useDefineForClassFields: false` setting was removed. The Vite preset keeps hydration
enabled because pages are prerendered. The copied docs include the
[0.3.0 to 0.3.1 upgrade guide](../references/gyral/migrating-0-3-0-to-0-3-1.md).
Node tests omit the new template-location plugin because its generated fallback branches
distort V8 coverage; the dev server keeps it ([lessons learned](../lessons-learned.md)).

## Gyral 0.3.1-next.6 (`swr-6sg`, 2026-10-09)

Core, ssr and testing moved to 0.3.1-next.6 (commit `209304e`). This took in next.4's one-time
API break and next.6's error channel:

- Explore uses the two-call `define<State, Msg>()(…)`.
- `page({ head })` became `page({ extraHead })`. The site's head stays out of Gyral's managed
  head (`Head` fields) on purpose. No page changes its head in the browser, so the managed
  `data-gyral-head` markers would be dead bytes on every page. The theme script must also run
  before the stylesheet, and `page({ stylesheets })` writes stylesheets first. Only the title
  and description go through `Head`.
- Tests that call a parser directly pass its context (`{ props, state, read }`).

The copied Gyral docs now come from gyral.dev at `b6e422d`, which adds
[error-handling.md](../references/gyral/error-handling.md). What we learned using Gyral, for
its authors, is in [gyral-feedback.md](../gyral-feedback.md).

## Gyral 0.3.1-next.9 (`swr-17s`, 2026-10-10)

Core, ssr and testing use next.9, packed from the clean `78052c4` checkout. The copied docs
come from gyral.dev at `8f5a247`. `renderPage()` replaces the page/stream pair;
`clientAssetsFromManifest()` and the public SSR `styleHashes()` replace removed imports.
Node parser tests use `parse()` and payload-free intents use `true`.

`headScripts` runs the theme pick before `stylesheets`, so their ordering no longer needs
raw script markup. Static metadata stays in `extraHead` to avoid unused managed-head
markers; the title and description still use the typed head. The template rule for boolean
attributes caught the search form's `selected="false"` bug, now fixed with `?selected`.

The client build discovers components with `gyralVitePreset({ components: true })`.
`renderPage()` selects loading from rendered tags; there is no manual client entry or
per-page island flag. Component metadata is serialized into the code-only API image before
`.vite/` is removed, then restored to a Map by the renderer. Old `pages.sqlite` files still
work, including their manual Explore entry when no image asset override is supplied.
Generated `.gyral/elements.d.ts` is ignored by Git, ESLint and Prettier, included in TypeScript,
and refreshed by `gyral-types` before every typecheck.

`toNodeListener()` owns streaming bodies, headers and disconnects in the API and preview.
`gyralDevServer()` owns development transport and reloads; the archive stays loaded once,
and the route table is still cached per module version. Preview uses `assetHandler()` for
files and ranges, with the site's cache/security headers and document MIME types applied
around it. The obsolete range helper is gone.

The strict CSP and its explicit component-style imports remain. Node tests still omit the
template-location plugin because its generated fallback branches distort coverage. The
API bundle still disables code splitting and refuses output beyond `api.mjs`.
