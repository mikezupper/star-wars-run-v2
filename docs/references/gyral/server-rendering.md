---
title: Server rendering
description: Render pages on the server with Declarative Shadow DOM, hydrate them in place, keep a strict CSP, and ship a production build.
section: Guides
order: 12
---

# Server rendering

`@gyral/ssr` renders Gyral components on the server, so a page is readable, and its links and
forms work, before any JavaScript loads. In the browser, each component **hydrates in place**: it
takes over the server's DOM and resumes from the server's state instead of rendering again.

```sh
npm install @gyral/core @gyral/ssr
```

That's all. The server renderer lives in `@gyral/core/server`, and `@gyral/ssr` builds pages,
responses and CSP headers on it. It needs no DOM shim and no Node-only APIs, so the same code
runs in Node, Deno, Bun and Cloudflare Workers.

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
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import '../src/counter.js'; // registers <my-counter> so the server can render it

export const app = new Hono();

app.get('/', () =>
  renderPage({
    title: 'Counter',
    description: 'A counter rendered on the server and hydrated in the browser.',
    head: html`<link rel="icon" href="/favicon.svg" />`,
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
- **`body`** and **`head`** are ordinary `html` templates from `@gyral/core`, the same tag your
  components use. The shell itself is never hydrated; the components inside it are.
- **`styles`** takes your global CSS as text and writes it into `<style>` elements, escaped so
  it can't close the element early. Trusted CSS only.
- **`stores`** passes this request's [store](/docs/stores/) instances.
- **`csp`** sets a `Content-Security-Policy` header (see
  [below](#content-security-policy)).

Importing a component's module is all the server needs: outside the browser, `define()` records
the spec, and the renderer renders it wherever its tag appears. A shadow component renders into
Declarative Shadow DOM, a `<template shadowrootmode="open">` the browser turns into a real
shadow root while parsing, with its CSS in one `<style>`. A light component (`shadow: false`)
renders as plain children.

## What runs on the server

Rendering is synchronous: the server runs `init(props)` and the view, and nothing else.

- **Commands never run.** There's no interpreter, no timer and no network on the server.
- **Do async work in the route handler** and pass the results as props:
  `` html`<my-product .product=${await loadProduct(id)}></my-product>` ``. A `Promise` anywhere
  in a view is an error.
- **`initialMessages`** run through `update` before the server render, for example to show a
  rejected form's errors (see [Forms](/docs/forms/#the-server-half)).

To avoid fetching again in the browser what the server already loaded, make the fetch depend on
the props in `init`: `init: (p) => p.product ? [{ … }] : [{ … }, [load()]]`. Both sides make the
same decision.

The renderer streams at component boundaries, and it is fast: a 1,000-row table renders to a
string in about 0.2 ms on Node 24 (1.3 ms including encoding), where Gyral 0.2 took 24 to 28 ms.

## Hydration and the client entry

```ts
// src/entry-client.ts
// No hydration import: each server-rendered component hydrates on its own.
import './counter.js';
```

Hydration is built into `@gyral/core`, and module order doesn't matter. When a server-rendered
component connects in the browser, it reads the state the server rendered (each one carries a
`data-gyral-seed` attribute with its state and its property-bound props), walks its template and
the server's DOM side by side, and adopts the existing nodes. Each component does this on its
own, whether its parent has hydrated yet or not. Then, and only then, it starts `init`'s
commands, so a router's first location or a timer's first tick can never make the first client
render differ from the server's.

The hydration code is its own chunk (about 2.8 KiB gzip), loaded the first time a
server-rendered component connects. Pages without one never fetch it. In production, preload it
with the entry: `clientAssetsFromManifest()` from `@gyral/ssr/static` reads the entry and the
chunks it needs from Vite's manifest, and `renderPage({ modulepreload })` writes a
`<link rel="modulepreload">` for each (see [Static sites](/docs/static-sites/#a-static-build)).

Every client-side instance then gets the `Hydrated` message once. Use it for progressive
enhancement: render the no-JavaScript version on the server and in the first client render, then
switch to the enhanced one.

The seed carries state as JSON, so keep the state and props of server-rendered components, and
seeded store state, JSON-serializable. In development the server warns, with the exact path,
when a value won't survive the trip (a `Date`, a `Map`, `NaN`). Components that only render in
the browser have no seed, so their state may hold other values; plain data still keeps tests,
devtools and a later move to server rendering simple. State that equals `init(props)` isn't written twice. Form controls keep what the user
typed before scripts ran: hydration never overwrites it, and a control is written again only
when the model's value for it changes.

## Mismatches

The server and the browser share one template normalizer, so they agree on every template's
structure. A mismatch means the view rendered something different for the same state: it read
the clock or a random number, or a browser extension edited the page before scripts ran.

- **In development**, hydration throws `HydrationMismatch` with the tag, the template's file and
  line, the DOM path, and what it expected and found. The component keeps the server's DOM.
  Development output carries `<!--gyral:ID-->` markers, so the browser also checks that each
  template is the one it expects.
- **In production**, the component logs a warning that describes the mismatch and links to
  [its entry on the errors page](/errors/#G0062), then renders itself fresh. Only that
  component: the rest of the page stays hydrated.

## Lazy hydration

Not everything needs to be live at load. `hydrate` in the spec makes a component an island:

| `hydrate`     | Hydrates                            |
| ------------- | ----------------------------------- |
| `load`        | as soon as possible (default)       |
| `idle`        | when the browser is idle            |
| `visible`     | when it scrolls into view           |
| `interaction` | on the first pointer or focus on it |

Until then it's plain server HTML: links and forms still work. `interaction` hydrates on
`pointerover`, `pointerdown`, `focusin` or `touchstart`, which arrive before the click, so the
first click still lands. Islands may sit anywhere, also inside other components. Only the island
waits: components inside its view hydrate on their own at load, so make those islands too if they
should wait.

## Light DOM for page content

Page-level components can render into light DOM with `shadow: false`. The server then writes
plain HTML, with no `<template>`, which every crawler and reader mode understands, and document
CSS styles it. See [Styling](/docs/styling/#light-dom-components).

## Content-Security-Policy

Seeds are attributes, not scripts, so `script-src 'self'` is enough. A shadow component's styles
arrive as an inline `<style>` in its Declarative Shadow DOM. Pass `csp: { directives }` to
`renderPage` and it sends a `Content-Security-Policy` header that allows each of them by its
SHA-256 hash, so `style-src` needs no `'unsafe-inline'`:

```ts
// server/home.ts
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import '../src/counter.js';

const styles = ':root { color-scheme: light dark; }';

export function home(): Response {
  return renderPage({
    title: 'Home',
    styles,
    body: html`<my-counter></my-counter>`,
    scripts: ['/src/entry-client.ts'],
    // Built when the page renders; cached until another component registers.
    csp: {
      directives: { 'default-src': "'self'", 'script-src': "'self'", 'object-src': "'none'" },
    },
  });
}
```

The header is built when the page renders, so it lists every shadow component registered by
then, also those whose modules were imported lazily after startup, plus each entry of the
page's `styles`. Inline `style="…"` attributes and `<style>` elements you write in `head` aren't
covered: move that CSS into `styles` or a stylesheet.

`contentSecurityPolicy({ directives, styles? })` builds the same value ahead of time, for the
components imported before the call. Use it where no page renders per request: a static site
writes it into the host's headers file at build time (see
[Static sites](/docs/static-sites/#headers-and-csp)), as this site does. In development,
`renderPage` warns when a header string it is given lacks a registered component's hash.

## Static generation

Pages that are the same for everyone can be rendered once, at build time, by the same app.
That has its own page: [Static sites and prerendering](/docs/static-sites/). To choose between
static, per-request and client-only rendering, see [Rendering modes](/docs/rendering-modes/);
to ship either, see [Deploying](/docs/deploying/).

## Lower level: @gyral/core/server

`@gyral/ssr` covers most apps. Underneath, `@gyral/core/server` exports `render(value)`, which
yields the HTML in chunks synchronously, `renderToString(value)`, `styleHashes()` and
`styleHashSync(css)` for a CSP, `componentStyles()` (each shadow component's `<style>` text) and
`development` (whether it resolved with the `development` condition). Import it only from
server code, never from a client entry, so client bundles carry no server renderer.

## Production checklist

- Spread `gyralVitePreset()` into your Vite config, so templates are checked and precompiled.
- Keep component state and props JSON data.
- Bind form state with `value=${…}`, `?checked=${…}` and `<textarea>${…}</textarea>`, never
  `.value=` or `.checked=`, which the server can't write.
- Load data before rendering; never put a `Promise` in a view.
- Send a CSP with `renderPage({ csp: { directives } })`; you don't need `'unsafe-inline'`.
- Preload the entry's chunks and the hydration chunk with `modulepreload`.
- Test hydration against a production build, not only the dev server. `@gyral/testing`'s
  `mountSsr` and `hydrated` make that a unit test (see [Testing](/docs/testing/#ssr-and-hydration-tests)).
