---
title: Rendering modes
description: Choose how each page renders - in the browser only, once at build time, or on every request - and mix all three in one app.
section: Guides
order: 10
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

Most real sites mix them. This website prerenders every page and runs one live component, the
counter on the home page. [gyral-shop](https://github.com/gyraljs/gyral-shop) renders product
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

## Where to go next

- **Client only**: write components as in [Getting started](/docs/getting-started/) and load
  them with a `<script type="module">`. No server code at all.
- **Static**: [Static sites and prerendering](/docs/static-sites/).
- **Per request**: [Server rendering](/docs/server-rendering/).
- **Shipping it**: [Deploying](/docs/deploying/) covers static hosts, Node, Bun and edge
  runtimes.
- **Less JavaScript on each page**: [Code-splitting and lazy loading](/docs/code-splitting/).
