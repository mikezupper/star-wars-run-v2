---
title: Packages
description: Every @gyral package, what it's for, how to install it, and the peer dependencies your app provides.
section: Reference
order: 1
---

# Packages

Gyral is a set of small packages under the `@gyral` scope on npm. Every app needs `@gyral/core`;
add the others when you need them. All packages are released together with the same version
number, are ES modules with TypeScript types, and are published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements).

## Core

| Package       | What it gives you                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@gyral/core` | `define()`, intents, update and commands, stores, forms, the view helpers, and Lit's `html`/`css` re-exported. `@gyral/core/vite` has the Vite preset. |

```sh
npm install @gyral/core lit
```

## Optional packages

| Package           | What it gives you                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gyral/http`     | The `http` driver: `get`, `request`, `submitForm`, typed errors, schema decoding. `@gyral/http/testing` has `fakeHttp`.                                 |
| `@gyral/router`   | Typed route tables, `listen`, `navigate`, `setTitle`, browser and memory history.                                                                       |
| `@gyral/time`     | `delay`, `debounce`, `periodic` and `animationFrames` as commands.                                                                                      |
| `@gyral/ssr`      | Server rendering: `renderPage`, `page`, `formAction`. `@gyral/ssr/hydrate` is the client side; `@gyral/ssr/static` prerenders and serves builds (Node). |
| `@gyral/testing`  | `step`, `run`, fake drivers, virtual time, `mountSsr` and `hydrated`. `@gyral/testing/arbitraries` turns schemas into fast-check arbitraries.           |
| `@gyral/devtools` | The in-page devtools panel, for development builds.                                                                                                     |

```sh
npm install @gyral/http @gyral/router @gyral/time
npm install @gyral/ssr @lit-labs/ssr @lit-labs/ssr-client
npm install -D @gyral/testing @gyral/devtools
```

## Peer dependencies

Lit must exist **once** in an app. Two copies mean two `LitElement` classes and two template
systems, and server-rendered pages stop hydrating. So the Lit packages are peer dependencies:
your app installs them, and every Gyral package uses your copy.

| Package                                       | Peer dependencies                                                 |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `@gyral/core`, `@gyral/devtools`              | `lit` ^3.3                                                        |
| `@gyral/ssr`                                  | `lit` ^3.3, `@lit-labs/ssr` ^4.1, `@lit-labs/ssr-client` ^1.1.8   |
| `@gyral/testing`                              | `fast-check` ^4, optional (only for `@gyral/testing/arbitraries`) |
| `@gyral/http`, `@gyral/router`, `@gyral/time` | none beyond `@gyral/core`                                         |

Import Lit's helpers (`html`, `css`, `nothing`, `repeat`, `live`, …) from `@gyral/core`. Import
`lit` directly only for plain `LitElement` classes.

Validation in `@gyral/core`, `@gyral/http` and `@gyral/ssr` accepts any
[Standard Schema](https://standardschema.dev) library; Gyral depends only on its types.

## Known issues

**Lists leak DOM nodes on lit-html 3.3.1 and later.** Since lit-html 3.3.1, removing items
rendered with `repeat()` leaves one comment node behind per removed item
([lit/lit#5010](https://github.com/lit/lit/issues/5010),
[lit/lit#5298](https://github.com/lit/lit/issues/5298), both open as of October 2026). A list
that changes often keeps growing the DOM, and bulk changes get slow: in Gyral's benchmark,
clearing 1,000 rows took about 3.7 seconds on lit-html 3.3.3 and 56 ms on 3.3.0. It affects
every Lit-based app, not only Gyral.

Until Lit ships a fix, pin lit-html to 3.3.0 in your app. With pnpm, in `package.json`:

```json
{
  "pnpm": { "overrides": { "lit-html": "3.3.0" } }
}
```

With npm, the same object goes under a top-level `"overrides"` key:
`"overrides": { "lit-html": "3.3.0" }`. Then reinstall and check that only one version is
installed (`pnpm why lit-html` or `npm ls lit-html`).

Since Gyral 0.2.0, development builds warn once in the console when an affected lit-html is
loaded, and apps created with `npm create gyral` come with the pin already in place.

## The Vite preset

`gyralVitePreset()` from `@gyral/core/vite` holds the two settings every Gyral app needs:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({
  ...gyralVitePreset(),
});
```

- **`resolve.dedupe`** of the Lit packages, so a linked or second copy of Gyral can't bring its
  own Lit. Without it you'd see "Multiple versions of Lit loaded", or a hydration mismatch with
  duplicated DOM.
- **`optimizeDeps.include`** of the Lit modules Gyral uses, so Vite doesn't discover them during
  the first browser test run and reload the page. If your app imports other Lit modules
  directly, add them: `gyralVitePreset({ optimize: ['lit/directives/unsafe-html.js'] })`.

For Vitest browser tests, spread the preset into each browser project's config too.

## What's inside

`@gyral/core` has no runtime dependencies besides Lit. Commands run on a small built-in runtime
(one `AbortController` per task) that handles cancellation, concurrency lanes and retries; a
check in Gyral's build fails if another runtime dependency is added. Gyral 0.1 used
[Effect](https://effect.website) for this; 0.2.0 replaced it without changing the public API,
which cut an empty app from about 49 KB to 11.9 KB gzipped
([why](https://github.com/gyraljs/gyral/blob/main/docs/design-docs/0015-runtime-size-spike.md)).

Browser code targets [Baseline](https://web.dev/baseline) "widely available" features. Newer
APIs, such as the Navigation API, URLPattern, invoker commands and View Transitions, are
feature-detected and used as enhancements.
