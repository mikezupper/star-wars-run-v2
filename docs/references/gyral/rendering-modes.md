---
title: Rendering modes
description: Choose how each page renders - in the browser only, once at build time, or on every request - and mix all three in one app.
section: Guides
order: 11
---

# Rendering modes

A Gyral component is the same code wherever it renders. What changes is **when** its HTML is
made, and that is a choice you make per page, not per app:

| Mode            | HTML is made                  | Needs at runtime        | Use it for                                 |
| --------------- | ----------------------------- | ----------------------- | ------------------------------------------ |
| **Client**      | in the browser, by JavaScript | any static file host    | widgets inside an existing page, admin UIs |
| **Static**      | once, at build time           | any static file host    | home, docs, marketing, blog posts          |
| **Per request** | on the server, for each visit | a server (Node, Bun, …) | carts, accounts, search results, forms     |

The static and per-request modes produce the **same HTML**: a static page is a per-request page
rendered ahead of time. Both work before any JavaScript loads and hydrate in place when it does,
so you can move a page from one mode to the other without touching its components.

## Mixing modes

Most real sites mix them. This website prerenders every page and runs two live components: the
counter on the home page and the search box on the search page. [gyral-shop](https://github.com/gyraljs/gyral-shop) renders product
listings and the cart per request, because they change with every visitor.

Keep the decision next to your routes, so there is one place to read it:

```ts
// src/routes.ts
import { routes } from '@gyral/router';
import type { RenderMode } from '@gyral/ssr/static';

export const site = routes({ home: '/', about: '/about', account: '/account' });

/** How each route renders in production. */
export const modes = {
  home: 'ssg',
  about: 'ssg',
  account: 'ssr',
} as const satisfies Record<'home' | 'about' | 'account', RenderMode>;

/** Every route rendered at build time, for the prerender step. */
export const staticPaths = (): string[] =>
  (Object.keys(modes) as (keyof typeof modes)[])
    .filter((name) => modes[name] === 'ssg')
    .map((name) => site.href(name, {}));
```

`RenderMode` names them the way the rest of the ecosystem does: `ssg` (static), `ssr` (per
request) and `csr` (client). Gyral's
[isomorphic example](https://github.com/gyraljs/gyral/tree/main/examples/isomorphic) uses
exactly this table.

## Client-only builds

An app that no server renders can tell the build so, and leave the hydration code out of its
bundle:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({
  ...gyralVitePreset({ clientOnly: true }),
});
```

With `clientOnly: true` the browser bundle carries no hydration code: no seed reading and no
hydration chunk, and when your app has no other `import()`, Vite's preload helper goes too. The
fallback for [invoker commands](/docs/intent/#invoker-commands) stays only when a module may make
a component listen for `command` intents ([what the build reads](#what-the-build-reads)).
Measured on Gyral's examples (gzip, 0.3.1):

| App         | Default: first load | Default: all chunks | `clientOnly: true` |
| ----------- | ------------------- | ------------------- | ------------------ |
| hello-world | 8.42 KiB            | 10.81 KiB           | 7.35 KiB           |
| counter     | 8.34 KiB            | 10.72 KiB           | 7.27 KiB           |

"First load" is what a page downloads before any lazy `import()`; in these examples a
client-only build has nothing lazy left, so its first load is all of it.

Use it for apps that load their components with a `<script type="module">` into pages no Gyral
server wrote: widgets in an existing site, admin tools, single-page apps. Leave it off as soon
as any page is server-rendered or prerendered, including islands, and spread the same preset
into your Vitest config so tests build the way the app does. `gyralClientOnly()` is the plugin
alone, for configs that list plugins themselves.

If server-rendered markup reaches a client-only build anyway, nothing breaks twice: each
component drops the server's seed and DOM and renders fresh from its attributes, so a view is
never doubled. Development warns once and names `clientOnly`; production renders fresh
silently. The server's work is wasted, though, so treat that warning as a configuration bug.

### Starting from create-gyral

`create-gyral`'s `basic` template is client-only from the start: its `vite.config.ts` sets
`gyralVitePreset({ clientOnly: true })`, and its `vitest.config.ts` reuses that config, so tests
build the way the app does. A new app is about 7.5 KiB gzip, in one file. Keep the option while
every page renders in the browser. Delete `clientOnly: true` as soon as any page is rendered on
a server or prerendered, for example when you add `@gyral/ssr`: with it on, those components
can't hydrate and render again from scratch. The `ssr` template builds without it.

### What the build reads

To decide what a bundle needs, the build reads the code that can affect your components, not
your whole dependency tree:

- **Which modules**: your own source (everything outside `node_modules`, workspace and linked
  packages included), and installed packages that are Gyral packages or list a `@gyral/*`
  package in `dependencies`, `peerDependencies` or `optionalDependencies`, directly or through
  their own dependencies, such as a design system built on Gyral. Any other package can't
  define a component or write its spec, so it isn't read.
- **What counts**: the parsed source, not its text, so comments and type-only code never count.
  The invoker fallback stays when a module's markup has `data-intent-on="command"` or a bound
  `data-intent-on`, when it has the string `'command'` on its own (`events: ['command']`, a
  `setAttribute`), or when it uses `raw` imported from `@gyral/core` (under any alias, or
  through a module that re-exports it), whose markup is only known at run time. A function of
  another package that happens to be called `raw` doesn't count.

Every build with the preset, client-only or not, uses the same scan for three opt-in features:
view transitions, the frame lane and custom states are bundled only when a module names
`viewTransition`, `renderOnFrame` or `states` in code. Write these field names literally: a name
built at run time isn't seen, and the feature then degrades as on a browser without it
(development builds warn). A package that writes these fields for your components must depend
on Gyral to be read: if it doesn't, declare `@gyral/core` as a peer dependency in its
`package.json`.

This site server-renders its pages and hydrates two islands, so it builds without the option.

## Where to go next

- **Client only**: write components as in [Getting started](/docs/getting-started/) and load
  them with a `<script type="module">`. No server code at all, and a
  [client-only build](#client-only-builds) to match.
- **Static**: [Static sites and prerendering](/docs/static-sites/).
- **Per request**: [Server rendering](/docs/server-rendering/).
- **Shipping it**: [Deploying](/docs/deploying/) covers static hosts, Node, Bun and edge
  runtimes.
- **Less JavaScript on each page**: [Code-splitting and lazy loading](/docs/code-splitting/).
