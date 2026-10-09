---
title: Deploying
description: Ship a Gyral app to a static host, a Node server or Bun, with the right cache headers and a strict Content Security Policy.
section: Guides
order: 15
---

# Deploying

What you deploy depends on how your pages [render](/docs/rendering-modes/):

- **Only static and client-rendered pages**: a folder of files. Any static host serves it.
- **Any page rendered per request**: a small server that runs your app, plus the same files.

Either way, the build output is ordinary: HTML, content-hashed JavaScript and CSS, and your
public files. Gyral adds no runtime service of its own.

## Static hosts

Build with the layout from [Static sites and prerendering](/docs/static-sites/): Vite and the
prerender step both write to `dist/`. Put fixed headers files in `public/`, which Vite copies
into `dist/` as they are, and write the Content Security Policy at build time
([Headers and CSP](/docs/static-sites/#headers-and-csp)). On every host the build command is
`npm run build` and the output directory is `dist`; what differs is where response headers (CSP,
caching) go:

| Host             | Response headers                                     |
| ---------------- | ---------------------------------------------------- |
| Cloudflare Pages | a `_headers` file in the output                      |
| Netlify          | a `_headers` file in the output, or `netlify.toml`   |
| Vercel           | `headers` in `vercel.json` (framework preset: Other) |
| GitHub Pages     | not configurable; use a `<meta>` CSP (see below)     |

GitHub Pages builds in a GitHub Actions workflow that uploads `dist` as its Pages artifact.

This website is the worked example: it builds with `pnpm run build` on Cloudflare Pages, with
`NODE_VERSION` set to 24. Its `_headers` file holds the security and cache headers, and the build
adds the Content Security Policy to it.

Hosts that serve `about/index.html` for `/about/` (all four above do) need no rewrite rules.
Set the host's 404 page to your prerendered `404.html` if you render one.

## Node

When some pages render per request, build into two folders and run Gyral's production server.
`npm create gyral@latest my-app -- --template ssr` sets up a project like this one; the files
below are a trimmed-down version.

```ts
// src/counter.ts
import { define, html } from '@gyral/core';

export const Counter = define<{ readonly count: number }, { readonly _tag: 'Increment' }>()(
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
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import type { AppAssets } from '@gyral/ssr/static';
import '../src/counter.js';

/** Paths rendered at build time into dist/static. Everything else renders per request. */
export const staticPaths: readonly string[] = ['/'];

export function createApp({ clientEntry, modulepreload, stylesheets }: AppAssets): Hono {
  const app = new Hono();
  app.get('/', () =>
    renderPage({
      title: 'Home',
      body: html`<my-counter></my-counter>`,
      scripts: [clientEntry],
      modulepreload,
      stylesheets,
    }),
  );
  app.get('/hello/:name', (c) =>
    renderPage({ title: 'Hello', body: html`<h1>Hello, ${c.req.param('name')}</h1>` }),
  );
  return app;
}
```

```ts
// server/prod.ts
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { toNodeListener } from '@gyral/ssr/node';
import { productionServer } from '@gyral/ssr/static';
import { createApp } from './app.js';

const app = await productionServer({
  distDir: fileURLToPath(new URL('../dist', import.meta.url)),
  createApp,
});

// origin: the public origin request URLs are built on (by default, the Host header).
createServer(toNodeListener(app.fetch, { origin: 'https://example.com' })).listen(
  Number(process.env['PORT'] ?? 3000),
);
```

`productionServer({ distDir, createApp })` expects Vite's output in `dist/client/` (with
`build.manifest: true`) and prerendered pages in `dist/static/`. It reads the manifest once and
hands `createApp` the client entry, the chunks to preload with it as `modulepreload` (Gyral's
hydration chunk included) and the hashed CSS the entry imports as `stylesheets`. A page whose
route module is imported lazily spreads `assets(['src/routes/product.ts'])` (also given to
`createApp`) into `renderPage` instead: it returns `{ modulepreload, stylesheets }` with that
module, its imports and its CSS added. It answers:

| Request                                  | Served from                                 | `cache-control`                       |
| ---------------------------------------- | ------------------------------------------- | ------------------------------------- |
| `GET`/`HEAD /assets/*`                   | `assetsDir` (default `dist/client/assets/`) | `public, max-age=31536000, immutable` |
| `GET`/`HEAD` of a prerendered path       | `staticDir` (default `dist/static/`)        | `public, max-age=0, must-revalidate`  |
| anything else (other `GET`s, every POST) | your app                                    | `no-cache`, unless your app set one   |

Assets carry their `content-type`, `content-length` and `x-content-type-options: nosniff`, and
stay in memory once served (up to a bound; `cache: false` reads them from disk every time). A
malformed URL is a 400. A path that leads outside `assetsDir`, or a missing file, is a 404 with
`cache-control: no-store`, so a CDN never caches a miss while a deploy lands. Pass
`staticDir: false` if nothing is prerendered, so page requests don't look for a file first.
A single `Range` request (`bytes=0-1023`) gets `206 Partial Content` with that slice, so an
imported video or audio file can seek; every asset says `accept-ranges: bytes`. A range past the
end is a 416, and several ranges or a malformed header get the whole file.

Served under a path, with Vite's `base: '/app/'`? Pass the same base to `productionServer`:
`productionServer({ distDir, createApp, base: '/app/' })` puts it in front of the entry,
preload and stylesheet URLs and serves assets at `/app/assets/`. For a static build, pass it to
the manifest helpers as their last argument:
`clientAssetsFromManifest(path, entry, [], { base: '/app/' })`.

After a deploy, tabs opened before it still ask for the old release's chunks. To keep serving
them, point `assetsDir` at a volume that keeps every release's files, or use `assetHandler`
from `@gyral/ssr/static` on its own. It answers under `/assets/` and returns `undefined` for
any other path, so it fits in front of any router:

```ts
// server/assets.ts
import { assetHandler } from '@gyral/ssr/static';

// A volume that keeps the hashed files of every release.
const assets = assetHandler({ dir: '/srv/releases/assets' });

export async function handle(request: Request): Promise<Response> {
  return (await assets(request)) ?? new Response('Not found', { status: 404 });
}
```

`productionServer` returns a plain `{ fetch }`. Mount it on Node's `http` module with
`createServer(toNodeListener(app.fetch, { origin }))` from `@gyral/ssr/node`, as above, or on any
server that takes a fetch handler, or as a route in a larger Hono app. `toNodeListener` streams
request bodies in, writes each chunk of the page only as fast as the client reads it, and aborts
`request.signal` when the client leaves. Set `origin` when your pages build absolute URLs from
the request: otherwise it comes from the `Host` header, which the client chooses.

### The client's address

A `Request` doesn't say who sent it. `toNodeListener` passes the handler a second argument,
`{ incoming, remoteAddress }`: Node's request object and the client's IP address, for rate
limits, logs and audits.

```ts
// server/rate-limit.ts
import { createServer } from 'node:http';
import { toNodeListener } from '@gyral/ssr/node';

const LIMIT = 100;
const hits = new Map<string, number>();

createServer(
  toNodeListener((_request, { remoteAddress }) => {
    const client = remoteAddress ?? 'unknown';
    const count = (hits.get(client) ?? 0) + 1;
    hits.set(client, count);
    return count > LIMIT
      ? new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } })
      : new Response('ok');
  }),
).listen(3000);
```

- **Behind a proxy or a load balancer, `remoteAddress` is the proxy's address.** The client's is
  in a header such as `X-Forwarded-For`, but anyone can send that header. Read it only when the
  request came from a proxy you run (`remoteAddress` is that proxy's address), and take the
  address your proxy added, the last one in the list, not the first.
- **`remoteAddress` is `undefined` once the connection has closed**, so give it a fallback.
- **A Hono app gets the object as `c.env`**, the shape Hono's own Node adapter passes, so
  `getConnInfo(c)` from `@hono/node-server/conninfo` works with it.

## Bun, Deno and Cloudflare Workers

`renderPage` returns a web-standard `Response` (chunked, from a synchronous render), so
per-request rendering fits any runtime that speaks `fetch`:

```js
// Bun
Bun.serve({ fetch: app.fetch });

// Deno
Deno.serve(app.fetch);

// Cloudflare Workers
export default { fetch: app.fetch };
```

How far each one is tested today:

- **Bun**: `renderPage` with Declarative Shadow DOM output and `contentSecurityPolicy()` were
  checked by hand on Bun 1.3.14 with Gyral 0.3. It isn't part of Gyral's CI.
- **Deno and Cloudflare Workers**: not tested yet. The renderer uses no Node-only APIs (it
  hashes in plain JavaScript and has no DOM shim), but check it there before you rely on it.
- **`@gyral/ssr/static`** (`prerender`, `productionServer`, `assetHandler`) reads and writes
  files with `node:fs`. Use it in Node at build time; on an edge runtime, serve the static files
  from the platform's asset hosting instead. **`@gyral/ssr/node`** is for Node's `http` module
  only; the runtimes above take `app.fetch` directly.

## Cache headers

`cacheHeaders` from `@gyral/ssr/static` holds the policies `productionServer` uses, for when
you write your own server:

```ts
// server/cache.ts
import { Hono } from 'hono';
import { html } from '@gyral/core';
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
| `none`       | `no-store`                            | misses and errors                          |

On a static host, set the same policies in its headers file. This site's `_headers` gives
`/assets/*` the `immutable` policy and leaves pages at the host's default revalidation.

## Content Security Policy

Gyral works under a strict policy:

- **No `'unsafe-eval'`.** This website's components hydrate and run under a policy without it,
  and its build fails on any CSP violation.
- **No inline scripts.** Hydration seeds are `data-gyral-seed` attributes, not script
  elements, and your client entry is a module file.
- **No `'unsafe-inline'` for styles.** Declarative Shadow DOM writes each component's styles as
  a `<style>` element inside its `<template>`, and `renderPage`'s `styles` option writes
  `<style>` in the head. `renderPage({ csp: { directives } })` lists all of them by hash in the
  header it sends, and `contentSecurityPolicy()` from `@gyral/ssr` builds the same value for a
  static headers file (see [Server rendering](/docs/server-rendering/#content-security-policy)).

A good starting point, with the hashes appended by Gyral:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; style-src 'self' 'sha256-…'
```

This website's policy is the same, plus `font-src` and `connect-src` for its own files and
`'wasm-unsafe-eval'`, which only its search index needs. Linked stylesheets need no hash:
`style-src 'self'` allows them. `style="…"` attributes in server HTML are the one thing the
policy blocks: they apply only once their component hydrates (see
[Styling](/docs/styling/#inline-styles-under-a-strict-csp)), so this site's pages have none. On
GitHub Pages, which can't set headers, put the policy in a
`<meta http-equiv="Content-Security-Policy">` element through `renderPage`'s `head` option;
`frame-ancestors` doesn't work there.

## Checklist

- Build for production and test it before deploying: hydration problems can appear only in
  bundled builds. `@gyral/testing`'s `mountSsr` and `hydrated` make that a
  [unit test](/docs/testing/#ssr-and-hydration-tests).
- Cache hashed assets for a year and pages not at all (or with revalidation).
- Serve a CSP header: `renderPage({ csp: { directives } })` per request, or
  `contentSecurityPolicy()` written into a static host's headers file. Gyral needs no
  `'unsafe-inline'` and no `'unsafe-eval'`.
