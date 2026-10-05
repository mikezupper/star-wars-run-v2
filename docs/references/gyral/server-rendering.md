---
title: Server rendering
description: Render pages on the server with Declarative Shadow DOM, hydrate them in place, prerender static pages, and ship a production build.
section: Guides
order: 10
---

# Server rendering

`@gyral/ssr` renders Gyral components on the server, so a page is readable, and its links and
forms work, before any JavaScript loads. In the browser, each component **hydrates in place**: it
takes over the server's DOM and resumes from the server's state instead of rendering again.

```sh
npm install @gyral/ssr @lit-labs/ssr @lit-labs/ssr-client
```

`@lit-labs/ssr` and `@lit-labs/ssr-client` are peer dependencies, like `lit`, so your app has
exactly one copy of each.

## page() and renderPage()

The examples on this page render the counter from [Getting started](/docs/getting-started/):

```ts
// src/counter.ts
import { define, html } from '@gyral/core';

export type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' };

export const Counter = define<{ readonly count: number }, Msg>('my-counter', {
  init: () => ({ count: 0 }),
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    Decrement: () => ({ _tag: 'Decrement' }),
  },
  update: {
    Increment: (s) => ({ count: s.count + 1 }),
    Decrement: (s) => ({ count: s.count - 1 }),
  },
  view: (s, i) => html`
    <button type="button" data-intent=${i.Decrement}>Decrement</button>
    <output aria-live="polite">${s.count}</output>
    <button type="button" data-intent=${i.Increment}>Increment</button>
  `,
});
```

A route handler renders it inside a page:

```ts
// server/app.ts
import { Hono } from 'hono';
import { html } from 'lit';
import { renderPage, serverHtml } from '@gyral/ssr';
import '../src/counter.js'; // registers <my-counter> so the server can render it

export const app = new Hono();

app.get('/', () =>
  renderPage({
    title: 'Counter',
    description: 'A counter rendered on the server and hydrated in the browser.',
    head: serverHtml`<link rel="icon" href="/favicon.svg" />`,
    body: html`<main>
      <h1>Counter</h1>
      <my-counter></my-counter>
    </main>`,
    scripts: ['/src/entry-client.ts'],
  }),
);
```

- **`renderPage(options, init?)`** returns a streaming `Response`, so the first bytes leave
  before the page is complete. It's a web `Response`, so Hono, Deno, Bun, Cloudflare Workers or a
  service worker can serve it.
- **`page(options)`** is the document shell (doctype, `<head>`, `<body>`) on its own, for
  `renderToString` or `renderToStream`.
- **`body`** is an ordinary Lit `html` template: the part that hydrates.
- **`head`** is written with `serverHtml`, for server-only markup that never hydrates.
- **`styles`** takes your global CSS as text and writes it into `<style>` elements, escaped so
  it can't close the element early. Trusted CSS only.
- **`stores`** passes this request's [store](/docs/stores/) instances.

Each component renders into Declarative Shadow DOM, a `<template shadowrootmode="open">` the
browser turns into a real shadow root while parsing, styles included.

## What runs on the server

The server runs `init(props)` and the view, and nothing else:

- **Commands never run.** There's no interpreter, no timer and no network on the server.
- **Do async work in the route handler** and pass the results as props:
  `` html`<my-product .product=${await loadProduct(id)}></my-product>` ``.
- **`initialMessages`** run through `update` before the server render, for example to show a
  rejected form's errors (see [Forms](/docs/forms/#the-server-half)).

To avoid fetching again in the browser what the server already loaded, make the fetch depend on
the props in `init`: `init: (p) => p.product ? [{ … }] : [{ … }, [load()]]`. Both sides make the
same decision.

## Hydration and the client entry

```ts
// src/entry-client.ts
// Order matters: hydrate support must load before anything that imports lit.
import '@gyral/ssr/hydrate';
import './counter.js';
```

When a component connects in the browser, it finds the state the server rendered (each
server-rendered element carries a `data-gyral-seed` attribute with its state and its
property-bound props), restores it, and hydrates the existing DOM. Then, and only then, it starts
`init`'s commands, so a router's first location or a timer's first tick can never make the first
client render differ from the server's.

Every client-side instance then gets the `Hydrated` message once. Use it for progressive
enhancement: render the no-JavaScript version on the server and in the first client render, then
switch to the enhanced one.

The seed carries state as JSON, so keep state and props JSON-serializable. The server warns,
with the exact path, when a value won't survive the trip (a `Date`, a `Map`, `NaN`). State that
equals `init(props)` isn't written twice.

## Lazy hydration

Not everything needs to be live at load. `hydrate` in the spec delays it:

| `hydrate`     | Hydrates                            |
| ------------- | ----------------------------------- |
| `load`        | as soon as possible (default)       |
| `idle`        | when the browser is idle            |
| `visible`     | when it scrolls into view           |
| `interaction` | on the first pointer or focus on it |

Until then it's plain server HTML: links and forms still work. `interaction` hydrates on
`pointerover`, `pointerdown`, `focusin` or `touchstart`, which arrive before the click, so the
first click still lands. Use it for components at page level; a component nested inside another
hydrates with its parent.

## Light DOM for page content

Page-level components can render into light DOM with `shadow: false`. The server then writes
plain HTML, with no `<template>`, which every crawler and reader mode understands, and document
CSS styles it. See [Styling](/docs/styling/#light-dom-components).

## Static generation

Pages that are the same for everyone can be rendered once, at build time. `@gyral/ssr/static`
(Node only) sends a real request for each path to the same app that serves dynamic pages and
writes the HTML:

```ts
// scripts/prerender.ts
import { clientEntryFromManifest, prerender } from '@gyral/ssr/static';
import { createApp } from '../server/create-app.js';

const clientEntry = await clientEntryFromManifest(
  'dist/client/.vite/manifest.json',
  'src/entry-client.ts',
);
const pages = await prerender({
  app: createApp({ clientEntry }),
  paths: ['/', '/about/'],
  outDir: 'dist/static',
  origin: 'https://example.com',
});
console.log(`prerendered ${String(pages.length)} pages`);
```

```ts
// server/create-app.ts
import { Hono } from 'hono';
import { html } from 'lit';
import { renderPage } from '@gyral/ssr';

export const createApp = ({ clientEntry }: { readonly clientEntry: string }): Hono => {
  const app = new Hono();
  app.get('*', () =>
    renderPage({ title: 'Home', body: html`<my-counter></my-counter>`, scripts: [clientEntry] }),
  );
  return app;
};
```

A path that doesn't answer `200` fails the build. Prerendered pages hydrate exactly like
server-rendered ones; they are the same HTML. This website is built this way: every page is
prerendered, and only the home page's counter ships JavaScript.

`productionServer({ distDir, createApp })` serves a build: hashed assets with a one-year cache,
prerendered pages from disk, and everything else through your app.

## Production checklist

- Import `@gyral/ssr/hydrate` **first** in the client entry.
- Add `gyralVitePreset()` to your Vite config, so the app bundles one copy of Lit.
- Keep component state and props JSON data.
- Bind boolean form state with `?checked=${liveBoolean(…)}`, never `.checked=${…}`, which
  the server would write as `checked="false"`.
- Allow `style-src 'unsafe-inline'` (or hashes) in your Content Security Policy:
  Declarative Shadow DOM styles are inline `<style>` elements. Seeds need no script allowance.
- Test hydration against a production build, not only the dev server. `@gyral/testing`'s
  `mountSsr` and `hydrated` make that a unit test (see [Testing](/docs/testing/#ssr-and-hydration-tests)).
