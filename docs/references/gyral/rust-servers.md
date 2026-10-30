---
title: Rust servers
description: Serve Gyral from a Rust backend with build-time pages, with Askama pages and browser-rendered components, or with embedded server rendering through gyral-rs.
useWhen: your server is written in Rust: choosing between build-time pages, Rust templates with browser-rendered components, or embedded server rendering with gyral-rs
section: Guides
order: 15.5
---

# Rust servers

A Rust backend can serve a Gyral app without a Node server. Rust keeps what it already owns:
routes, sign-in, permissions, data and every write. Gyral owns the components: their HTML, their
behaviour in the browser and, when the server renders them, their hydration.

Two questions decide how the two fit together:

1. **Who writes the document?** Gyral at build time, Rust templates per request, or Gyral per
   request inside the Rust process.
2. **Does each component arrive rendered?** A server-rendered component
   [hydrates in place](/docs/server-rendering/): the browser takes over its HTML and state. A
   component that arrives as a bare tag renders for the first time in the browser.

The answers give three paths. Each one runs the same components:

| Path                                                      | Document by     | Components      |
| --------------------------------------------------------- | --------------- | --------------- |
| [Build-time pages](#build-time-pages-and-a-rust-api)      | Gyral, at build | Hydrate         |
| [Rust templates](#rust-templates-with-browser-components) | Askama          | Render in place |
| [Embedded rendering](#embedded-rendering-with-gyral-rs)   | Gyral, in Rust  | Hydrate         |

Only the third path runs JavaScript on the server, and only it needs
[`gyral-rs`](https://github.com/gyraljs/gyral-rs). The first two use Gyral exactly as this
documentation describes it, with Rust as the web server.

The examples on this page use one counter. It takes its starting count as a prop, so Rust can
set it from a template attribute or from render data:

```ts
// src/counter.ts
import { define, html, prop } from '@gyral/core';

export interface Props {
  readonly start: number;
}

export type Msg = { readonly _tag: 'Increment' };

export const Counter = define<{ readonly count: number }, Msg, Props>()('my-counter', {
  props: { start: prop.number({ default: 0 }) },
  init: (props) => ({ count: props.start }),
  intent: { Increment: true },
  update: { Increment: (s) => ({ count: s.count + 1 }) },
  view: (s, i) => html`
    <output aria-live="polite">${s.count}</output>
    <button type="button" data-intent=${i.Increment}>Increment</button>
  `,
});
```

The browser entry is the same on every path. It registers the components; Gyral then
hydrates the ones the server rendered and renders the rest:

```ts
// src/client.ts
import './counter.js';
```

## Build-time pages and a Rust API

Choose this path when a page is the same for every visitor, or when its personal data can load
after the page does. [Prerender the pages](/docs/static-sites/) as you would for any static
host. Rust then serves the output folder as files and answers the API routes the components
call, such as `/api/notes`.

Rust needs nothing from Gyral at runtime. Two things carry over from the build:

- **The Content Security Policy.** A static build computes it ahead of time, style hashes
  included ([Headers and CSP](/docs/static-sites/#headers-and-csp)). Write it to a file Rust
  reads at startup, and send it with every page.
- **Cache headers.** Content-hashed files under `/assets/` never change, so serve them with a
  long `max-age` and `immutable`. Pages need revalidation
  ([Cache headers](/docs/deploying/#cache-headers)).

Serve the pages and the API from one origin, so components call the API with relative URLs and
a policy limited to `'self'` covers them.

## Rust templates with browser components

Choose this path when ordinary HTML can carry a page's main job and its components can wait
for JavaScript. Rust renders the whole document with its own templates, so native forms post
to Rust and work with JavaScript turned off. Gyral adds interactive parts on top.

The template writes each component as a tag with ordinary attributes and readable fallback
content. With [Askama](https://github.com/askama-rs/askama), whose `{{ }}` escapes each value:

```html
<my-counter start="{{ start }}">
  <p>Starting count: {{ start }}. The button appears when JavaScript loads.</p>
</my-counter>

<script
  type="module"
  src="{{ client.path }}"
  integrity="{{ client.integrity }}"
  crossorigin="anonymous"
></script>
```

When the client entry loads, `define()` upgrades the tag, reads `start` from its attribute and
renders the counter into the component's shadow root. The browser stops showing the fallback
then. There is nothing to hydrate: the server sent a tag, not the component's HTML. Each
attribute is parsed and validated like any [prop](/docs/components/#builders-and-attributes),
so a bad value falls back to the prop's default.

Build the client with your usual bundler (the example uses esbuild). Rust serves its hashed
files and sends a policy that allows them. Components that render in the browser adopt their
styles as constructed stylesheets, so `style-src 'self'` is enough; style hashes are only for
server-rendered components. Components that read form fields, such as a live preview, observe
the native controls with a [subscription](/docs/outside-state/); the form still submits to
Rust.

The [`gyral-rs` Askama example](https://github.com/gyraljs/gyral-rs/tree/main/examples/askama-client-app)
is a complete notes app on this path: Axum routes, CSRF checks, SQLite, redirects after
writes, and a Gyral preview beside each form. It doesn't link the embedded renderer.

## Embedded rendering with gyral-rs

Choose this path when a page that changes per request must arrive with its components already
rendered, and hydrate in the browser. `gyral-rs` runs your app's own Gyral server bundle in an
embedded V8 inside the Rust process. Node builds the bundles; the running server doesn't need
it.

`gyral-rs` is **experimental**. Version 0.6 accepts bundles built with Gyral **0.3.8** exactly,
and its tested target is Linux x86_64 (GNU) with Rust 1.99. Each `gyral-rs` minor accepts one
Gyral release, so check its [changelog](https://github.com/gyraljs/gyral-rs/blob/main/CHANGELOG.md)
before you upgrade Gyral in a Rust-served app.

### The server bundle

The bundle is one script that sets two globals. Rust calls `gyralRender` with a page name and
the JSON props it approved; the function returns the page's HTML:

```ts
// src/server.ts
import { html } from '@gyral/core';
import { renderToString } from '@gyral/ssr';
import './counter.js';

// The build replaces these with the hashed client file and its integrity hash.
declare const __CLIENT_PATH__: string;
declare const __CLIENT_INTEGRITY__: string;

interface RenderInput {
  readonly page: string;
  readonly props: { readonly start: number };
}

declare global {
  var gyralBundleVersion: number;
  var gyralRender: (input: RenderInput) => Promise<string>;
}

globalThis.gyralBundleVersion = 1;
globalThis.gyralRender = ({ page, props }) => {
  if (page !== 'home') throw new Error(`Unknown page: ${page}`);
  return renderToString(
    html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Counter</title>
          <script
            type="module"
            src=${__CLIENT_PATH__}
            integrity=${__CLIENT_INTEGRITY__}
            crossorigin="anonymous"
          ></script>
        </head>
        <body>
          <main><my-counter .start=${props.start}></my-counter></main>
        </body>
      </html>`,
    { onError: 'throw' },
  );
};
```

It uses `renderToString`, not [`renderPage`](/docs/server-rendering/#renderpage): the embedded
runtime has no Fetch API, so the bundle writes its own document shell and returns a string.
`onError: 'throw'` turns a failing component into a failed render, which Rust answers with an
error page instead of a page with a hole in it.

The runtime is not Node and not a browser. It has no DOM, file system, network or `TextEncoder`,
and Gyral's style hashing needs `TextEncoder`. The
[example's server entry](https://github.com/gyraljs/gyral-rs/blob/main/examples/axum-app/web/server.mjs)
installs a small UTF-8 encoder first; copy it.

### Building the pair

Build the browser and server bundles together, from the same components and the same exact
Gyral version:

- **Browser**: one self-contained ES module from `src/client.ts`, named by its SHA-256 hash.
- **Server**: one IIFE from `src/server.ts` with every import bundled in, `platform: 'neutral'`,
  and the client's path and integrity hash defined into it.
- **Manifest**: `manifest.json` with the bundle ABI (`1`), the Gyral version, both hashes and
  the style hashes from `styleHashes()`.

The renderer loads no modules at runtime, so split chunks and dynamic `import()` are not
supported. The [example's build script](https://github.com/gyraljs/gyral-rs/blob/main/tools/build-example.mjs)
does all three steps with esbuild in about fifty lines.

### The Rust side

Add the crate with its Axum adapter (`cargo add gyral --features axum`). At startup, verify the
three files as one set and start a renderer:

```rust
let artifacts = Arc::new(AppArtifacts::try_new(manifest, server_js, client_js)?);
let policy = DocumentPolicy::try_new(artifacts.manifest())?;
let (renderer, worker) = Renderer::start(artifacts.bundle().clone())?;
```

A handler loads the data, checks access, and renders with only what the browser may see:

```rust
let request = RenderRequest::try_new(PageId::try_from("home".to_owned())?, json!({ "start": 5 }))?;
let response = gyral::axum::render_page(&renderer, request).await.into_response();
policy.apply(response)
```

`DocumentPolicy` sends an enforcing CSP that allows the verified client file and the
manifest's style hashes. Each render runs in a fresh V8 isolate with a deadline and a memory
budget. When the server stops, drain HTTP first, then `worker.shutdown().await` joins the
render threads. The [crate's README](https://crates.io/crates/gyral) and the
[Axum example](https://github.com/gyraljs/gyral-rs/tree/main/examples/axum-app) cover the
details: limits, overload, health checks and the native V8 build.

## Mixing paths

An app can use different paths for different pages. Its marketing pages can be prerendered,
its forms Askama, and its dashboard rendered per request, all served by one Rust process.
Build each path's components from the same source and the same Gyral version.

Within one page, the bundle contract also allows `gyralRender` to return a fragment instead of
a document, which an Askama page could include so that some components hydrate and others
render in the browser. No `gyral-rs` example or test covers this yet. If you try it, the
template has to add what the embedded document adds itself: the client script with its
integrity hash, and a policy with every component's style hashes.

## What Rust must own

Whichever path you choose:

- **Approve every value that reaches Gyral.** Props, attributes and API responses become page
  HTML and, when a component is server-rendered, hydration seeds the browser can read. Never
  put secrets or fields the visitor may not see into them.
- **Send Gyral's HTML unchanged.** Don't rewrite it or write seeds yourself; Gyral escapes
  values and owns the hydration format.
- **Send a complete CSP** that allows the client files and style hashes. See
  [Security](/docs/security/) for the policy Gyral needs.
- **Treat writes as final on the server.** A component's request can be cancelled in the browser
  after Rust committed it, so a redraw is never an authorization check.
- **Run only your own bundles.** The embedded renderer's limits bound time and memory; they
  don't make it a sandbox for untrusted JavaScript.
