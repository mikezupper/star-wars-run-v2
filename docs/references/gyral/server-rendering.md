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

That's all. `@gyral/ssr` renders pages, responses and CSP headers. It needs no DOM shim and no Node-only APIs, so the same code
runs in Node, Deno, Bun and Cloudflare Workers.

## renderPage()

The examples on this page render the counter from [Getting started](/docs/getting-started/):

```ts
// src/counter.ts
import { define, html } from '@gyral/core';

export type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' };

export const Counter = define<{ readonly count: number }, Msg>()('my-counter', {
  init: () => ({ count: 0 }),
  intent: { Increment: true, Decrement: true },
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
import { renderPage, type ComponentAssets } from '@gyral/ssr';
import '../src/counter.js'; // registers <my-counter> so the server can render it

/** `components` comes from the dev server or the production build (below); tests leave it out. */
export const createApp = (components?: ComponentAssets) =>
  new Hono().get('/', () =>
    renderPage({
      title: 'Counter',
      description: 'A counter rendered on the server and hydrated in the browser.',
      canonical: 'https://example.com/',
      links: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
      body: html`<main>
        <h1>Counter</h1>
        <my-counter></my-counter>
      </main>`,
      ...(components === undefined ? {} : { components }),
    }),
  );
```

- **`renderPage(options, init?)`** returns a web `Response` whose body is pulled in chunks from
  a synchronous render, one component boundary per pull. Load data before you call it: nothing
  is awaited mid-page, and there is no suspense streaming. The status and headers are final
  before the first byte, so a 404 is a real 404. Hono, Deno, Bun, Cloudflare Workers or a
  service worker can serve it.
- **Its body is a stream** (`renderPage(o).body`). For a string, such as a page written to a file,
  read it: `await renderPage(o).text()`.
- **The head fields** (`title`, `description`, `canonical`, `robots`, `meta`, `links`,
  `jsonLd`, `lang`, `dir`) are a `Head` from `@gyral/core`, the same value the router's
  `setHead()` applies after a client navigation ([Routing](/docs/routing/#the-head)). The
  server writes each entry once, marked `data-gyral-head`.
- **`body`** and **`extraHead`** are ordinary `html` templates from `@gyral/core`, the same tag
  your components use. `extraHead` is for head markup the head model doesn't manage, such as
  preconnect hints. Meta and link entries in the head model take `media`, `sizes`, `type` and
  the other standard attributes, so a pair of `theme-color` tags is plain head data. The shell itself is never hydrated; the components inside it
  are.
- **`styles`** takes your global CSS as text and writes it into `<style>` elements, escaped so
  it can't close the element early. Trusted CSS only.
- **`stylesheets`** takes stylesheet URLs and writes a `<link rel="stylesheet">` for each, before
  the inline `styles`. In production these are the hashed CSS files Vite builds from your client
  entry (see [Static sites](/docs/static-sites/#a-static-build)).
- **`headScripts`** takes inline scripts that must run before any stylesheet, such as a theme
  script that sets `data-theme` before the first paint. `renderPage` adds their hashes to
  `script-src`, so a strict CSP allows them.
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

The renderer yields a chunk at every component boundary, and it is fast: a 1,000-row table
renders to a string in about 0.2 ms on Node 24 (1.3 ms including encoding), where Gyral 0.2 took
24 to 28 ms.

## Loading components in the browser

Turn on `components` in the Vite preset and pass the `components` your server gets to
`renderPage`. Each page then loads exactly the components it rendered (their modules,
preloaded, and a small loader), and a page that rendered none loads no JavaScript at all. There
is no client entry to write and no per-page list of islands:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({
  ...gyralVitePreset({ components: true }), // finds every define()'d tag under src/
  build: { outDir: 'dist/client', emptyOutDir: true },
});
```

The server still imports the components it renders. The loader finds the tags in the page and,
as it defines components, the tags rendered in their shadow roots too, at any depth, so a
component inside another component's shadow DOM loads without its parent importing it. A
rendered tag that no client module defines is a development warning, so a missing island can't
fail silently. For app-wide setup in the browser (providing drivers to the page), keep a small
client entry and pass it in `scripts` next to `components`.

The preset finds components written as `export const X = define<…>()('my-tag', …)`. A component
created through a helper of your own (one that calls `define()` with a tag it was given) is
invisible to that scan, so list it with its module, relative to the project root:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({
  ...gyralVitePreset({
    components: { modules: { 'member-form': 'src/forms/member.ts' } },
  }),
  build: { outDir: 'dist/client', emptyOutDir: true },
});
```

A component module that the client entry or another component also imports is bundled into that
chunk; it still loads, and its preload is that chunk. In a large app, measure before you switch
from a hand-written loader: each component becomes its own chunk, and the loader carries the
list of their dependencies.

To wait until the page's components are defined and have rendered, await `componentsReady()`
from `@gyral/core`, in a page script or a browser test. It resolves once every rendered tag the
loader knows about is defined and the page has settled; without automatic components it is
`settled()`:

```ts
import { componentsReady } from '@gyral/core';

await componentsReady();
document.querySelector('site-search')?.focus();
```

Hydration is built into `@gyral/core`, and module order doesn't matter. When a server-rendered
component connects in the browser, it reads the state the server rendered (each one carries a
`data-gyral-seed` attribute with its state and its property-bound props), walks its template and
the server's DOM side by side, and adopts the existing nodes. Each component does this on its
own, whether its parent has hydrated yet or not. Then, and only then, it starts `init`'s
commands and its subscriptions, so a router's first location or a timer's first tick can never make the first client
render differ from the server's.

The hydration code is its own chunk (about 2.8 KiB gzip), loaded the first time a
server-rendered component connects. Pages without one never fetch it. With `components`,
`renderPage` preloads it on the pages that need it. With a client entry of your own,
`clientAssetsFromManifest()` from `@gyral/ssr/static` reads the entry, its chunks and its hashed
CSS from Vite's manifest, for `renderPage({ scripts, modulepreload, stylesheets })` (see
[Static sites](/docs/static-sites/#a-static-build)).

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
page's `styles`. `<style>` elements you write in `extraHead` aren't covered: move that CSS into
`styles` or a stylesheet. Linked stylesheets are same-origin, so `style-src 'self'` allows them
without hashes.

`style="…"` attributes in server HTML aren't covered by default: under a strict policy they
apply only once the component hydrates (see
[Styling](/docs/styling/#inline-styles-under-a-strict-csp)). To have them paint at once, opt in
with `styleAttributes: 'hash'`:

```ts
// server/upload.ts
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';

export function upload(done: number): Response {
  return renderPage({
    title: 'Upload',
    body: html`<div class="bar" style="--done: ${done}%"></div>`,
    csp: { directives: { 'default-src': "'self'" }, styleAttributes: 'hash' },
  });
}
```

The header then gets `style-src-attr 'unsafe-hashes' 'sha256-…'` for every distinct `style`
value the page wrote: static, bound and element-hook values, but not `raw()` markup. The page
is rendered to a string first, so its body isn't sent in chunks, and each value adds about 54
bytes of header. Development warns above 32 distinct values, and `maxStyleHashes` (default 128)
caps the list; values past it wait for hydration as before. It applies to pages rendered per
request: a prerendered page has no per-page header. If your `style-src-attr` already allows
`'unsafe-inline'`, no hashes are added, since a hash would switch `'unsafe-inline'` off.

### Trusted Types

Gyral parses template HTML and `raw()` markup in the browser through one Trusted Types policy
named `gyral`, created on first use; client-only apps are covered too. Under
`require-trusted-types-for 'script'`, a policy that lists allowed policies must include it:
`'trusted-types': 'gyral'`, plus your own. If the browser refuses the policy, Gyral falls back to
plain strings, which works only while Trusted Types aren't enforced, and development builds warn
once ([G0072](/errors/#G0072)). The policy trusts its input as the app's own HTML, so `raw()`
still never takes user input.

### Ahead of time

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

## Development server

`gyralDevServer()` from `@gyral/ssr/node` runs Vite in middleware mode, loads your server module
fresh on every request (so edits show up), streams each response, and shows Vite's error overlay
when a render throws:

```ts
// scripts/dev.ts
import { gyralDevServer } from '@gyral/ssr/node';
import type * as App from '../server/app.js';

const dev = await gyralDevServer<typeof App>({
  entry: '/server/app.ts',
  app: (mod, { components }) => mod.createApp(components),
});
console.log(`Listening on ${dev.url}`);
```

`state` keeps a value, such as an in-memory database, across those reloads.

## The request layer

Gyral renders pages; it doesn't route requests. Routing, middleware, cookies and sessions belong
to a fetch router such as [Hono](https://hono.dev) (any router whose handlers return a web
`Response` works), the way Lit and Preact leave them to the app. `@gyral/ssr` covers the parts
that touch Gyral: `formAction` answers a fetch request with JSON and a plain form post with a
redirect or the page (`wantsJson(request)` tells you which one you got), and
`productionServer({ onResponse })` lets you add headers or cookies to every response it sends.
See [Deploying](/docs/deploying/) for both.

## Lower level

`renderToString(value)` from `@gyral/ssr` renders a template to a string, and
`styleHashes()` lists the CSP hashes of every registered component's styles, for a policy you
build yourself. Import them only from server code, so client bundles carry no server renderer.

## Production checklist

- Spread `gyralVitePreset()` into your Vite config, so templates are checked and precompiled.
- Keep component state and props JSON data.
- Bind form state with `value=${…}`, `?checked=${…}` and `<textarea>${…}</textarea>`, never
  `.value=` or `.checked=`, which the server can't write.
- Load data before rendering; never put a `Promise` in a view.
- Send a CSP with `renderPage({ csp: { directives } })`; you don't need `'unsafe-inline'`.
- Turn on `components`, so each page loads and preloads only the components it rendered, and
  link your hashed CSS with `stylesheets`.
- Test hydration against a production build, not only the dev server. `@gyral/testing`'s
  `mountSsr` and `hydrated` make that a unit test (see [Testing](/docs/testing/#ssr-and-hydration-tests)).
