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

`@gyral/core` runs commands with [Effect](https://effect.website) 3, which handles cancellation,
concurrency lanes and retries. It is an implementation detail: Gyral's public API is plain
TypeScript with plain functions, objects and promises, the published type declarations never
mention Effect (a check in Gyral's build enforces it), and you never need to learn it. It is a
regular dependency of `@gyral/core`, bundled into your app like any other.

Browser code targets [Baseline](https://web.dev/baseline) "widely available" features. Newer
APIs, such as the Navigation API, URLPattern, invoker commands and View Transitions, are
feature-detected and used as enhancements.
