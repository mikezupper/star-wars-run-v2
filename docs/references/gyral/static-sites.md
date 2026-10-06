---
title: Static sites and prerendering
description: Render pages to HTML files at build time with @gyral/ssr/static, ship zero JavaScript where nothing is interactive, and host them anywhere.
section: Guides
order: 12
---

# Static sites and prerendering

Pages that are the same for every visitor can be rendered once, when you build, and served as
plain files. You don't need a server at runtime: any static host will do. This website works
this way. Every page is a prerendered HTML file on Cloudflare Pages, and only the pages with a
live component load any JavaScript.

`@gyral/ssr/static` does the rendering. It doesn't have a renderer of its own: it sends a real
`Request` for each path to the same app you would use to [render per
request](/docs/server-rendering/), and writes what comes back to disk. So a static page and a
server-rendered page are the same HTML, hydration seeds included.

## A static build

The app renders pages with `renderPage`, as on a server:

```ts
// src/counter.ts
import { define, html } from '@gyral/core';

export type Msg = { readonly _tag: 'Increment' };

export const Counter = define<{ readonly count: number }, Msg>('my-counter', {
  init: () => ({ count: 0 }),
  intent: { Increment: () => ({ _tag: 'Increment' }) },
  update: { Increment: (s) => ({ count: s.count + 1 }) },
  view: (s, i) => html`
    <output aria-live="polite">${s.count}</output>
    <button type="button" data-intent=${i.Increment}>Increment</button>
  `,
});
```

```ts
// server/create-app.ts
import { Hono } from 'hono';
import { html } from 'lit';
import { renderPage } from '@gyral/ssr';
import '../src/counter.js';

export const createApp = ({ clientEntry }: { readonly clientEntry: string }): Hono => {
  const app = new Hono();
  // A page with a live component loads the client entry...
  app.get('/', () =>
    renderPage({
      title: 'Home',
      body: html`<main>
        <h1>Home</h1>
        <my-counter></my-counter>
      </main>`,
      scripts: [clientEntry],
    }),
  );
  // ...and a page without one ships no JavaScript at all.
  app.get('/about/', () =>
    renderPage({ title: 'About', body: html`<main><h1>About us</h1></main>` }),
  );
  return app;
};
```

After `vite build`, a script renders every path into the same folder:

```ts
// scripts/prerender.ts
import { clientEntryFromManifest, prerender } from '@gyral/ssr/static';
import { createApp } from '../server/create-app.js';

const clientEntry = await clientEntryFromManifest(
  'dist/.vite/manifest.json',
  'src/entry-client.ts',
);
const pages = await prerender({
  app: createApp({ clientEntry }),
  paths: ['/', '/about/'],
  outDir: 'dist',
  origin: 'https://example.com',
});
console.log(`prerendered ${String(pages.length)} pages`);
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({
  ...gyralVitePreset(),
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true, // clientEntryFromManifest reads it
    rollupOptions: { input: 'src/entry-client.ts' },
  },
});
```

- **`prerender({ app, paths, outDir, origin })`** writes `/about/` to `dist/about/index.html`.
  A path that doesn't answer `200` fails the build, so an error page can't ship by accident.
- **`origin`** is the URL the requests are made with. Set it to your real site, so absolute
  URLs your pages build from the request (canonical links, Open Graph tags) come out right.
- **`clientEntryFromManifest(manifest, entry)`** returns the hashed URL of your client entry,
  for example `/assets/entry-client-Ab12.js`, from Vite's manifest.
- The client entry is the one from [Server rendering](/docs/server-rendering/#hydration-and-the-client-entry):
  `@gyral/ssr/hydrate` first, then your components.
- `@gyral/ssr/static` reads and writes files, so it runs in Node at build time. Your pages
  don't need Node: the output is plain files.

Deploy `dist/` to any static host. [Deploying](/docs/deploying/#static-hosts) has the settings
for the common ones.

## What ships no JavaScript

A page is only HTML and CSS until you give it `scripts`. Every component on it is still
rendered: each shadow root is written as Declarative Shadow DOM, which the browser turns into a
real shadow root while it parses, styles included. Links and forms work. Nothing hydrates,
because nothing loaded the code to do it.

That makes "should this page have JavaScript?" a per-page decision. On this website the docs
pages have none, and the home page loads one small entry for its counter. To delay even that,
see [lazy hydration](/docs/server-rendering/#lazy-hydration) and
[Code-splitting](/docs/code-splitting/).

## Mixing static and per-request pages

When some pages must be rendered per request, keep the [Vite manifest layout
Gyral's production server expects](/docs/deploying/#node) (`dist/client/` and `dist/static/`)
and let `productionServer` serve both: prerendered files from disk, everything else through
your app. [Rendering modes](/docs/rendering-modes/#mixing-modes) shows how to keep the list of
static paths next to your routes.

## Limits

- Paths with parameters (`/products/:id`) are prerendered only if you list them; there's no
  crawling.
- There's no incremental regeneration: rebuild to change a static page.
- Gyral doesn't write a sitemap for you. Generate one from the same path list.
