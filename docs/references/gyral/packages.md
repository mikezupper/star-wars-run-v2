---
title: Packages
description: Every @gyral package, what it's for, how to install it, and the optional build tools Gyral works with.
section: Reference
order: 1
---

# Packages

Gyral is a set of small packages under the `@gyral` scope on npm. Every app needs `@gyral/core`;
add the others when you need them. All packages are released together with the same version
number, are ES modules with TypeScript types, and are published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements).

## Core

| Package       | What it gives you                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gyral/core` | `define()`, intents, update and commands, stores, forms, and the view layer: `html`, `css`, `each`, `raw`, hooks. `@gyral/core/server` renders on the server, `/vite` has the preset and template compiler, `/eslint` the template rules. |

```sh
npm install @gyral/core
```

## Optional packages

| Package           | What it gives you                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gyral/http`     | The `http` driver: `get`, `request`, `submitForm`, typed errors, schema decoding. `@gyral/http/testing` has `fakeHttp`.                       |
| `@gyral/router`   | Typed route tables, `listen`, `navigate`, `setTitle`, browser and memory history.                                                             |
| `@gyral/time`     | `delay`, `debounce`, `periodic` and `animationFrames` as commands.                                                                            |
| `@gyral/ssr`      | Server rendering: `renderPage`, `page`, `contentSecurityPolicy`, `formAction`. `@gyral/ssr/static` prerenders and serves builds (Node).       |
| `@gyral/testing`  | `step`, `run`, fake drivers, virtual time, `mountSsr` and `hydrated`. `@gyral/testing/arbitraries` turns schemas into fast-check arbitraries. |
| `@gyral/devtools` | The in-page devtools panel, for development builds.                                                                                           |

```sh
npm install @gyral/http @gyral/router @gyral/time
npm install @gyral/ssr
npm install -D @gyral/testing @gyral/devtools
```

## Optional peer dependencies

No Gyral package needs another library at runtime. The build tools Gyral plugs into are optional
peer dependencies: install the ones you use.

| Package          | Optional peers                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `@gyral/core`    | `vite` ^8 (preset and compiler), `eslint` 9 or 10 (the plugin), `parse5` (compiler check) |
| `@gyral/testing` | `fast-check` ^4 (only for `@gyral/testing/arbitraries`)                                   |

Validation in `@gyral/core`, `@gyral/http` and `@gyral/ssr` accepts any
[Standard Schema](https://standardschema.dev) library; Gyral depends only on its types.

Gyral 0.2 rendered with Lit and asked your app to install it. 0.3 has its own view layer, so
Lit is gone from the dependency tree. Any custom element still works next to Gyral components,
including ones built with Lit; install that library yourself if you use it. Upgrading? See
[Migrating from 0.2 to 0.3](/docs/migrating-0-2-to-0-3/).

## The Vite preset

`gyralVitePreset()` from `@gyral/core/vite` holds the settings every Gyral app needs:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({
  ...gyralVitePreset(),
});
```

- **`plugins`**: the template compiler. In `vite build` it checks every `html` template,
  dependencies included, fails the build with a code frame on a rule violation, and replaces each
  template with a precompiled object, so the bundle doesn't carry the runtime template preparer.
  The dev server and Vitest keep the runtime path, which checks the same rules on first render.
  With `parse5` installed, the build also compares each template with a full HTML parser's
  result. If your config has plugins of its own, list both:
  `plugins: [...gyralVitePreset().plugins, mine()]`.
- **`optimizeDeps.include`**: empty by default. If Vite discovers a dependency during the first
  browser test run and reloads the page, list it: `gyralVitePreset({ optimize: ['some-dep'] })`.

Import `html` from `@gyral/core` wherever you write templates. The compiler follows that import,
and refuses an alias (`const h = html`) it can't follow. For Vitest browser tests, spread the
preset into each browser project's config too.

## The ESLint plugin

`@gyral/core/eslint` shows the compiler's template errors in your editor, with the same
messages, and checks that `each` rows read only their arguments:

```js
// eslint.config.js
import gyral from '@gyral/core/eslint';

export default [{ files: ['src/**/*.ts'], ...gyral.configs.recommended }];
```

`recommended` turns on `gyral/template` and `gyral/each-row-purity` as errors. It works without
Vite. See [Views](/docs/views/#checked-before-it-runs) for what the rules catch.

## What's inside

`@gyral/core` has no runtime dependencies. Its view layer was written for Gyral alone, from the
platform's own primitives: `<template>` cloning, constructable stylesheets, Declarative Shadow
DOM. Commands run on a small built-in runtime (one `AbortController` per task) that handles
cancellation, concurrency lanes and retries.

Apps ship only the features they use. `each`, `raw`, hooks, commands, stores and the prop builders
register themselves when your code first calls them, so an app that never calls one doesn't
bundle it, and the hydration code is a separate chunk that only server-rendered pages fetch.
Measured on Gyral's examples (gzip, production builds with the preset):

| App                      | 0.2.0    | 0.3: first load | 0.3: all chunks |
| ------------------------ | -------- | --------------- | --------------- |
| hello-world              | 12.2 KiB | 8.9 KiB         | 11.3 KiB        |
| isomorphic (SSR)         | 17.3 KiB | 13.0 KiB        | 15.6 KiB        |
| no-js-first (SSR, forms) | 18.7 KiB | 16.8 KiB        | 19.3 KiB        |

"First load" is the entry chunk and what it imports statically: what a page downloads before any
lazy `import()`. The [migration guide](/docs/migrating-0-2-to-0-3/#size) has this site's own
numbers before and after.

Browser code targets [Baseline](https://web.dev/baseline) "widely available" features. Newer
APIs, such as the Navigation API, URLPattern, invoker commands and View Transitions, are
feature-detected and used as enhancements.

## Known issues

- **Some markup isn't handled yet by the template checks**: `<select>` content under the new
  customizable-select parsing, CDATA in SVG, and `<noscript>` as raw text. Keep these out of
  templates, or put them in `raw()` on the server.
- **Deno and Cloudflare Workers are not tested yet** for server rendering (see
  [Deploying](/docs/deploying/#bun-deno-and-cloudflare-workers)).
- **Without a preload hint, the hydration chunk loads one round trip after the entry** on
  server-rendered pages. Pass `clientAssetsFromManifest()`'s `modulepreload` to `renderPage` (see
  [Static sites](/docs/static-sites/#a-static-build)); `productionServer` hands it to your app,
  with a `preload(modules)` that adds a page's lazily imported route chunks.
