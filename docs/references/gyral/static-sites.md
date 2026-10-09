---
title: Static sites and prerendering
description: Render pages to HTML files at build time with @gyral/ssr/static, ship zero JavaScript where nothing is interactive, and host them anywhere.
section: Guides
order: 13
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

export const Counter = define<{ readonly count: number }, Msg>()('my-counter', {
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
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import '../src/counter.js';

export interface ClientAssets {
  readonly clientEntry: string;
  readonly modulepreload: readonly string[];
  readonly stylesheets: readonly string[];
}

export const createApp = ({ clientEntry, modulepreload, stylesheets }: ClientAssets): Hono => {
  const app = new Hono();
  // A page with a live component loads the client entry, and preloads what it needs...
  app.get('/', () =>
    renderPage({
      title: 'Home',
      body: html`<main>
        <h1>Home</h1>
        <my-counter></my-counter>
      </main>`,
      scripts: [clientEntry],
      modulepreload,
      stylesheets,
    }),
  );
  // ...and a page without one ships no JavaScript at all, only the stylesheet.
  app.get('/about/', () =>
    renderPage({ title: 'About', body: html`<main><h1>About us</h1></main>`, stylesheets }),
  );
  return app;
};
```

After `vite build`, a script renders every path into the same folder:

```ts
// scripts/prerender.ts
import { clientAssetsFromManifest, prerender } from '@gyral/ssr/static';
import { createApp } from '../server/create-app.js';

const client = await clientAssetsFromManifest('dist/.vite/manifest.json', 'src/entry-client.ts');
const pages = await prerender({
  app: createApp({
    clientEntry: client.entry,
    modulepreload: client.modulepreload,
    stylesheets: client.css,
  }),
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
    manifest: true, // clientAssetsFromManifest reads it
    rollupOptions: { input: 'src/entry-client.ts' },
  },
});
```

- **`prerender({ app, paths, outDir, origin })`** writes `/about/` to `dist/about/index.html`.
  A path that doesn't answer `200` fails the build, so an error page can't ship by accident.
- **`origin`** is the URL the requests are made with. Set it to your real site, so absolute
  URLs your pages build from the request (canonical links, Open Graph tags) come out right.
- **`clientAssetsFromManifest(manifestPath, entry)`** reads Vite's manifest and returns the
  hashed URL of your client entry (`entry`, for example `/assets/entry-client-Ab12.js`) and the
  chunks to preload with it (`modulepreload`): the entry itself, its static imports and Gyral's
  hydration chunk.
  `renderPage({ modulepreload })` writes a `<link rel="modulepreload">` for each, so the browser
  fetches them alongside the entry instead of a round trip later. A third argument lists
  modules a page imports lazily, by source path (`['src/routes/product.ts']`); they are
  preloaded too, each with its static imports, and their CSS joins `css`.
- **`css`** lists the content-hashed CSS files Vite built from the stylesheets your client entry
  imports (`import './app.css';`), each after the files of the modules it imports, so the
  cascade is the one you had in development. Link them with `renderPage({ stylesheets })`
  instead of inlining your CSS into every page with `styles`: the browser caches one file across
  pages, and `style-src 'self'` allows it with no hash.
- The client entry is the one from [Server rendering](/docs/server-rendering/#hydration-and-the-client-entry):
  it imports your components, and each one hydrates on its own.
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

## Headers and CSP

A static host can't compute headers per request, but most read a headers file from the output:
Cloudflare Pages and Netlify read `_headers`. Where a server renders per request,
`renderPage({ csp })` builds the policy as the page renders; here, build it ahead of time with
`contentSecurityPolicy()` from `@gyral/ssr` in the same build step and write it there. Its
`style-src` lists the hash of each component's Declarative Shadow DOM `<style>`, so it needs no
`'unsafe-inline'`:

```ts
// scripts/headers.ts
import { writeFile } from 'node:fs/promises';
import { contentSecurityPolicy } from '@gyral/ssr';
import '../src/counter.js'; // registers the components whose styles get hashed

const csp = await contentSecurityPolicy({
  directives: { 'default-src': "'self'", 'script-src': "'self'", 'object-src': "'none'" },
});
await writeFile('dist/_headers', `/*\n  Content-Security-Policy: ${csp}\n`);
```

The hashes change when a component's CSS changes, so write the file in every build, never by
hand. Linked stylesheets need no hash: `style-src 'self'` allows them. `style="…"` attributes
aren't covered: the policy blocks them in the HTML, and on a page that never hydrates nothing
applies them later (see [Styling](/docs/styling/#inline-styles-under-a-strict-csp)). Give the
element a class instead. This site works this way; its code blocks are coloured by classes
rather than the inline styles a highlighter writes by default.

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
