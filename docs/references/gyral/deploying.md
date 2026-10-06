---
title: Deploying
description: Ship a Gyral app to a static host, a Node server or Bun, with the right cache headers and a strict Content Security Policy.
section: Guides
order: 14
---

# Deploying

What you deploy depends on how your pages [render](/docs/rendering-modes/):

- **Only static and client-rendered pages**: a folder of files. Any static host serves it.
- **Any page rendered per request**: a small server that runs your app, plus the same files.

Either way, the build output is ordinary: HTML, content-hashed JavaScript and CSS, and your
public files. Gyral adds no runtime service of its own.

## Static hosts

Build with the layout from [Static sites and prerendering](/docs/static-sites/): Vite and the
prerender step both write to `dist/`. Put headers files in `public/`, which Vite copies into
`dist/` as they are. On every host the build command is `npm run build` and the output
directory is `dist`; what differs is where response headers (CSP, caching) go:

| Host             | Response headers                                     |
| ---------------- | ---------------------------------------------------- |
| Cloudflare Pages | a `_headers` file in the output                      |
| Netlify          | a `_headers` file in the output, or `netlify.toml`   |
| Vercel           | `headers` in `vercel.json` (framework preset: Other) |
| GitHub Pages     | not configurable; use a `<meta>` CSP (see below)     |

GitHub Pages builds in a GitHub Actions workflow that uploads `dist` as its Pages artifact.

This website is the worked example: it builds with `pnpm run build` on Cloudflare Pages, with
`NODE_VERSION` set to 24 and a `_headers` file for its security and cache headers.

Hosts that serve `about/index.html` for `/about/` (all four above do) need no rewrite rules.
Set the host's 404 page to your prerendered `404.html` if you render one.

## Node

When some pages render per request, build into two folders and run Gyral's production server.
`npm create gyral@latest my-app -- --template ssr` sets this up for you; this is what it
generates.

```ts
// src/counter.ts
import { define, html } from '@gyral/core';

export const Counter = define<{ readonly count: number }, { readonly _tag: 'Increment' }>(
  'my-counter',
  {
    init: () => ({ count: 0 }),
    intent: { Increment: () => ({ _tag: 'Increment' }) },
    update: { Increment: (s) => ({ count: s.count + 1 }) },
    view: (s, i) => html`
      <output aria-live="polite">${s.count}</output>
      <button type="button" data-intent=${i.Increment}>Increment</button>
    `,
  },
);
```

```ts
// server/app.ts
import { Hono } from 'hono';
import { html } from 'lit';
import { renderPage } from '@gyral/ssr';
import '../src/counter.js';

/** Paths rendered at build time into dist/static. Everything else renders per request. */
export const staticPaths: readonly string[] = ['/'];

export function createApp({ clientEntry }: { readonly clientEntry: string }): Hono {
  const app = new Hono();
  app.get('/', () =>
    renderPage({ title: 'Home', body: html`<my-counter></my-counter>`, scripts: [clientEntry] }),
  );
  app.get('/hello/:name', (c) =>
    renderPage({ title: 'Hello', body: html`<h1>Hello, ${c.req.param('name')}</h1>` }),
  );
  return app;
}
```

```ts
// server/prod.ts
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { productionServer } from '@gyral/ssr/static';
import { createApp } from './app.js';

const app = await productionServer({
  distDir: fileURLToPath(new URL('../dist', import.meta.url)),
  createApp,
});

serve({ fetch: app.fetch, port: Number(process.env['PORT'] ?? 3000) });
```

`productionServer({ distDir, createApp })` expects Vite's output in `dist/client/` (with
`build.manifest: true`) and prerendered pages in `dist/static/`. It answers:

| Request                        | Served from                | `cache-control`                       |
| ------------------------------ | -------------------------- | ------------------------------------- |
| `GET /assets/*`                | `dist/client/assets/`      | `public, max-age=31536000, immutable` |
| `GET` of a prerendered path    | `dist/static/…/index.html` | `public, max-age=0, must-revalidate`  |
| anything else (and every POST) | your app                   | `no-cache`, unless your app set one   |

Asset paths that resolve outside `dist/client/` are refused. Its `fetch` is a plain
`(Request) => Response` function: serve it with `@hono/node-server` as above, or mount it as a
route in a larger Hono app.

## Bun, Deno and Cloudflare Workers

`renderPage` returns a web-standard streaming `Response`, so per-request rendering fits any
runtime that speaks `fetch`:

```js
// Bun
Bun.serve({ fetch: app.fetch });

// Deno
Deno.serve(app.fetch);

// Cloudflare Workers
export default { fetch: app.fetch };
```

How far each one is tested today:

- **Bun**: `renderPage` with Declarative Shadow DOM output was checked by hand on Bun 1.3.14.
  It isn't part of Gyral's CI.
- **Deno and Cloudflare Workers**: not tested yet. Check that Lit's server renderer
  (`@lit-labs/ssr`) runs there before you rely on it.
- **`@gyral/ssr/static`** (`prerender`, `productionServer`) reads and writes files with
  `node:fs`. Use it in Node at build time; on an edge runtime, serve the static files from the
  platform's asset hosting instead.

## Cache headers

`cacheHeaders` from `@gyral/ssr/static` holds the three policies `productionServer` uses, for
when you write your own server:

```ts
// server/cache.ts
import { Hono } from 'hono';
import { html } from 'lit';
import { renderPage } from '@gyral/ssr';
import { cacheHeaders } from '@gyral/ssr/static';

export const app = new Hono();

// A personalised page: never reuse it for another visitor without asking the server.
app.get('/account', () =>
  renderPage(
    { title: 'Account', body: html`<h1>Your account</h1>` },
    {
      headers: cacheHeaders.dynamic,
    },
  ),
);
```

| Policy       | Value                                 | For                                        |
| ------------ | ------------------------------------- | ------------------------------------------ |
| `immutable`  | `public, max-age=31536000, immutable` | content-hashed files (`/assets/*`)         |
| `revalidate` | `public, max-age=0, must-revalidate`  | prerendered pages, which a rebuild changes |
| `dynamic`    | `no-cache`                            | pages rendered per request                 |

On a static host, set the same policies in its headers file. This site's `_headers` gives
`/assets/*` the `immutable` policy and leaves pages at the host's default revalidation.

## Content Security Policy

Gyral works under a strict policy. It needs:

- **No `'unsafe-eval'`.** This website's components hydrate and run under a policy without it,
  and its build fails on any CSP violation.
- **No inline scripts.** Hydration seeds are `data-gyral-seed` attributes, not script
  elements, and your client entry is a module file.
- **Inline styles.** Declarative Shadow DOM writes each component's styles as a `<style>`
  element inside its `<template>`, and `renderPage`'s `styles` option writes `<style>` in the
  head. Allow them with `style-src 'self' 'unsafe-inline'`, or list their hashes.

A good starting point:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
```

This website's policy is the same, plus `font-src` and `connect-src` for its own files and
`'wasm-unsafe-eval'`, which only its search index needs. On GitHub Pages, which
can't set headers, put the policy in a
`<meta http-equiv="Content-Security-Policy">` element through `renderPage`'s `head` option;
`frame-ancestors` doesn't work there.

## Checklist

- Build for production and test it before deploying: hydration problems can appear only in
  bundled builds. `@gyral/testing`'s `mountSsr` and `hydrated` make that a
  [unit test](/docs/testing/#ssr-and-hydration-tests).
- Cache hashed assets for a year and pages not at all (or with revalidation).
- Serve a CSP header. Gyral needs nothing beyond inline styles.
- Pin one Lit version for the whole app (see [Packages](/docs/packages/#known-issues)).
