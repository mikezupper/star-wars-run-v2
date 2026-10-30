---
title: Packages
description: Every @gyral package, what it's for, how to install it, and the optional build tools Gyral works with.
useWhen: choosing which @gyral package to install, checking sizes, or reading known issues
section: Reference
order: 1
---

# Packages

Gyral is a set of small packages under the `@gyral` scope on npm, plus `create-gyral`, which
sets up a new app. Every app needs `@gyral/core`; add the others when you need them. All ten
packages are released together with the same version number (0.3.8), are ES modules with
TypeScript types, and are published from GitHub Actions with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements).

## Core

| Package       | What it gives you                                                                                                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gyral/core` | `define()`, intents and `on()`, update and commands, subscriptions, stores, forms, `subscription()`, and the view layer: `html`, `svg`, `css`, `each`, `keyed`, `raw`, hooks. `/vite` has `gyral()`, the Vite plugins (template compiler, component loading, element typings), `/eslint` the lint rules. |

```sh
npm install @gyral/core
```

`@gyral/core/storage` and `@gyral/core/indexeddb` are optional entry points in the same
package. They provide separate native [localStorage and IndexedDB drivers](/docs/browser-storage/).
Apps that do not import them carry no storage driver code.

## Optional packages

| Package           | What it gives you                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gyral/http`     | The `http` driver: `get`, `request`, `submitForm`, typed errors, schema decoding. `@gyral/http/testing` has `fakeHttp`.                                                                                                                                                                |
| `@gyral/router`   | Typed route tables, `listen`, `navigate`, `setHead`, browser and memory history.                                                                                                                                                                                                       |
| `@gyral/time`     | `delay`, `debounce` and `every` as commands; an app that only delays doesn't bundle `every`.                                                                                                                                                                                           |
| `@gyral/ssr`      | Server rendering: `renderPage`, `renderToString`, `contentSecurityPolicy`, `styleHashes`, `formAction`. `@gyral/ssr/static` prerenders and serves builds and writes component style hashes, `@gyral/ssr/node` mounts a fetch handler on Node's `http` and runs the development server. |
| `@gyral/testing`  | `step`, `run`, `viewOf`, `subscriptionsFor`, `outputsIn`, `mount`, `parse`, fake drivers, virtual time, `mountSsr` and `hydrated`. `@gyral/testing/vitest` renders server markup for browser tests.                                                                                    |
| `@gyral/devtools` | The in-page devtools panel, for development builds.                                                                                                                                                                                                                                    |
| `@gyral/mcp`      | An MCP server for coding agents: it searches these docs, looks up exact API signatures, reads the examples, scaffolds components and typechecks snippets against your project. Hosted at `https://mcp.gyral.dev/mcp`.                                                                  |
| `@gyral/codemod`  | Rewrites an app's source for a release's API changes, `npx @gyral/codemod 0.3.8`, and lists what it leaves for you. Run it with `npx`; there is nothing to install.                                                                                                                    |

```sh
npm install @gyral/http @gyral/router @gyral/time
npm install @gyral/ssr
npm install -D @gyral/testing @gyral/devtools
```

The same `@gyral/http` installation includes optional `@gyral/http/sse` and
`@gyral/http/websocket` entries for [native network streams](/docs/network-streams/).
The fetch entry does not include those transports.

`@gyral/mcp` is a stdio server your agent starts with `npx -y @gyral/mcp`, from your project
directory. It answers from the docs, API and examples of its own version, bundled at build time,
so it works offline. `gyral-mcp http` runs a read-only Streamable HTTP server instead; Gyral hosts one at
`https://mcp.gyral.dev/mcp`, with no token. Setup for Claude Code,
VS Code, Cursor, Codex and other clients is in
[Use Gyral with coding agents](/docs/coding-agents/).

## create-gyral

`npm create gyral@latest` asks for a directory and a template, `basic` (client-rendered) or
`ssr` (server-rendered and hydrated), and writes an app that depends on the matching `@gyral/*`
release. [Getting started](/docs/getting-started/#create-a-project) walks through it.

## Optional peer dependencies

No Gyral package asks you to install another library at runtime. The build tools Gyral plugs
into are optional peer dependencies: install the ones you use.

| Package          | Optional peers                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `@gyral/core`    | `vite` ^8 (preset and compiler), `eslint` 9 or 10 (the plugin), `parse5` (compiler check) |
| `@gyral/ssr`     | `vite` ^8 (the development server in `@gyral/ssr/node`)                                   |
| `@gyral/testing` | `vitest` ^4.1 or ^5 (only for `@gyral/testing/vitest`)                                    |
| `@gyral/mcp`     | `typescript` 5 or 6 (for `check_snippet`, which uses your project's compiler)             |

Validation in `@gyral/core`, `@gyral/http` and `@gyral/ssr` accepts any
[Standard Schema](https://standardschema.dev) library; Gyral depends only on its types.

Any custom element works next to Gyral components, including ones built with Lit; install that
library yourself if you use it. Upgrading an existing app? See
[Versioning and stability](/docs/versioning/).

### One version of every package

`@gyral/http`, `@gyral/router`, `@gyral/time`, `@gyral/ssr`, `@gyral/testing` and
`@gyral/devtools` take `@gyral/core` as a peer dependency at their own exact version, so they
always use your app's copy of core: give every `@gyral/*` package the same version. Your
package manager reports a mismatch when it installs (pnpm lists the unmet peer, npm stops with
`ERESOLVE`), and a package that loads with another release of core throws
[G0016](/errors/#G0016) in development, naming both versions.

## The Vite plugins

`gyral()` from `@gyral/core/vite` returns the Vite plugins every Gyral app needs. Put it in the
config's `plugins`, beside any plugins of your own (`plugins: [gyral(), mine()]`); its settings
come through the plugins themselves, so there is nothing to spread or merge:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyral } from '@gyral/core/vite';

export default defineConfig({
  plugins: [gyral()],
});
```

- **The template compiler.** In `vite build` it checks every `html` and `svg` template,
  dependencies included, fails the build with a code frame on a rule violation, and replaces each
  template with a precompiled object, so the bundle doesn't carry the runtime template preparer.
  The dev server and Vitest keep the runtime path, which checks the same rules on first render;
  there a template-locations plugin tells the runtime where each template is written, so its
  errors and hydration mismatches name your file, line and column. With `parse5` installed, the
  build also compares each template with a full HTML parser's result.
- **Server code under `vite dev`.** Vite, not Node, loads `@gyral/*` (and your dependencies that
  use them) in server code, so server rendering there gets development output and shares one
  copy of `@gyral/core`.
- **Pre-bundling.** The dev server and Vitest pre-bundle the browser entry points of every
  Gyral package installed for the app, and of your direct dependencies that use Gyral (a design
  system, a widget library), all together, so they never load a second copy of `@gyral/core`
  partway through a run. `gyral()` also warns once when `@gyral/core` is installed more than once
  ([G0015](/errors/#G0015)): pin one version with your package manager's overrides.
- **`optimize: 'auto'`** points Vite's startup scan at the modules that define components, and
  at a Vitest browser project's tests, so Vite finds everything they import before the first
  page or test loads instead of reloading partway through. It is on by default when Vite runs as
  a custom server (`appType: 'custom'`, as the [development server](/docs/server-rendering/#development-server)
  does); set it yourself in a Vitest browser project. A list adds dependencies to pre-bundle,
  `gyral({ optimize: ['some-dep'] })`, and `optimize: false` turns the scan off.
- **`clientOnly: true`**, for apps no server renders, leaves the hydration code out of the
  browser bundle. See [Client-only builds](/docs/rendering-modes/#client-only-builds).
- **`components: true`** loads each component's module once its tag is on the page, so pages
  need no client entry. See
  [Code splitting](/docs/code-splitting/#load-components-by-whats-on-the-page).
- **`types`**: `gyral()` writes [element typings](/docs/components/#anatomy-of-define) to
  `.gyral/elements.d.ts` by scanning `src`; `types: false` turns that off.

Import `html` from `@gyral/core` wherever you write templates. The compiler follows that import,
and refuses an alias (`const h = html`) it can't follow. For Vitest browser tests, add `gyral()`
to each browser project's config too ([Testing](/docs/testing/#browser-tests)).

`gyralVitePreset(options)` returns the same plugins as `{ plugins, optimizeDeps }`, for a config
that spreads it in. `npx @gyral/codemod 0.3.8` rewrites such a config to `plugins: [gyral()]`
where it can prove the result the same, and lists the configs it leaves.

## The ESLint plugin

`@gyral/core/eslint` shows the compiler's template errors in your editor, with the same
messages, checks that `each` rows read only their arguments, and finds intent parsers no
template names:

```js
// eslint.config.js
import gyral from '@gyral/core/eslint';

export default [{ files: ['src/**/*.ts'], ...gyral.configs.recommended }];
```

`recommended` turns on `gyral/template`, `gyral/each-row-purity` and `gyral/intent-event` (an
[`on()` parser](/docs/intent/#parsers-typed-by-their-event) bound to another event) as errors,
and `gyral/unused-intent` and `gyral/prefer-built-in` as warnings. `gyral/prefer-built-in` finds
hand-written versions of what Gyral has built in and names the built-in: a dialog opened with
`showModal()` (`?modal`), `.focus()` in a driver (the `focus()` command), `JSON.parse` of an
attribute or prop (`prop.json()`), a subscription that drops repeated values by hand (`equals`),
a record of drivers outside tests (a list), and a parser that checks the event's type, modifier
keys, `Number(value)` of a number input or `composedPath()[0]` (`on()`). It works without Vite.
See [Views](/docs/views/#checked-before-it-runs) for what the template rules catch.

## Publishing a component library

A package of Gyral components, such as a design system or a set of widgets, must share the
app's copy of `@gyral/core`: a stylesheet from `css` or a store made by another copy doesn't work
in the app's. List core as a peer dependency with a caret range, and as a dev dependency at the
version you develop against:

```json
{
  "peerDependencies": { "@gyral/core": "^0.3.8" },
  "devDependencies": { "@gyral/core": "0.3.8" }
}
```

- **A peer, never a dependency.** A dependency pinned to one version installs a second core
  whenever the app has another one ([G0015](/errors/#G0015)); a peer uses the app's.
- **A caret range**: `^0.3.8` is 0.3.8 up to, but not including, 0.4.0. Its lower bound is the
  oldest core you test against. Gyral's own packages pin core exactly because they use its
  internals; a library uses the public API, so any core in the range works. Other Gyral packages
  the library imports, such as `@gyral/http`, are caret peers too.
- **Public entry points only**: `@gyral/core`, `@gyral/core/storage` and the other documented
  entries, never `@gyral/core/internal` or a file path, which change in any release. Import
  `html`, `svg` and `css` from `@gyral/core` itself where you write templates, so the app's
  template compiler sees them.
- **Templates as written.** Publish ES modules with their `html` templates as they are. The
  app's build compiles every template it bundles, `node_modules` included, and reads every
  installed package that lists `@gyral/core`, as a peer too, for the features its components
  use ([what the build reads](/docs/rendering-modes/#what-the-build-reads)).
- **Test against the range**: run the library's tests with the lowest core its range allows and
  with the newest. `npx @gyral/mcp@0.3.8 skill --check` in its CI keeps the
  [agent skill](/docs/coding-agents/#the-agent-skill) it carries on the version it develops
  against.

## What's inside

`@gyral/core` has no runtime dependencies. Its view layer was written for Gyral alone, from the
platform's own primitives: `<template>` cloning, constructable stylesheets, Declarative Shadow
DOM. Commands run on a small built-in runtime (one `AbortController` per task) that handles
cancellation, concurrency lanes and retries.

Apps ship only the features they use. `each`, `raw`, hooks, commands, stores and the prop builders
register themselves when your code first calls them, so an app that never calls one doesn't
bundle it, and the hydration code is a separate chunk that only server-rendered pages fetch.
Measured on Gyral's examples at 0.3.8 (KiB gzip, production builds with `gyral()`):

| App                      | First load | All chunks |
| ------------------------ | ---------- | ---------- |
| hello-world              | 9.7        | 12.1       |
| hello-world, client-only | 8.6        | 8.6        |
| isomorphic (SSR)         | 15.6       | 18.6       |
| no-js-first (SSR, forms) | 20.0       | 20.1       |

"First load" is the entry chunk and what it imports statically: what a page downloads before any
lazy `import()`. The no-js-first example loads its components
[by what's on the page](/docs/code-splitting/#load-components-by-whats-on-the-page), so its first
load counts what a page with every component preloads, the hydration chunk included. Builds leave
out view transitions, the frame lane and custom states unless a module names their spec field (the
build reads your code and the packages that depend on Gyral; see [what the build
reads](/docs/rendering-modes/#what-the-build-reads)), `on()` is bundled only by apps that call it,
and production builds print short
[error codes](/errors/) instead of messages. [Error handling](/docs/error-handling/), which every
app carries, costs about 0.75 KiB. The client-only row is the same app built with
[`clientOnly: true`](/docs/rendering-modes/#client-only-builds). The isomorphic example
routes, and the router's [scroll and focus handling](/docs/routing/#scroll-and-focus) costs it
about 0.5 KiB of first load; the History API code (about 0.75 KiB) loads only in browsers without
the Navigation API.

Browser code targets [Baseline](https://web.dev/baseline) "widely available" features. Newer
APIs, such as the Navigation API, URLPattern, invoker commands and View Transitions, are
feature-detected and used as enhancements.

## Known issues

- **Some markup isn't handled yet by the template checks**: `<select>` content under the new
  customizable-select parsing, CDATA in SVG, and `<noscript>` as raw text. Keep these out of
  templates, or put them in `raw()` on the server.
- **Deno and Cloudflare Workers have only had a spot check** for server rendering: a
  `renderPage` bundle ran on Deno and in a local Workers runtime, but adapters, deployed edge
  behavior, bindings and assets aren't tested (see
  [Deploying](/docs/deploying/#bun-deno-and-cloudflare-workers)).
- **Without a preload hint, the hydration chunk loads one round trip after the entry** on
  server-rendered pages. Pass `clientAssetsFromManifest()`'s `modulepreload` to `renderPage` (see
  [Static sites](/docs/static-sites/#a-static-build)); `productionServer` hands it to your app,
  with an `assets(modules)` that adds a page's lazily imported route chunks.
