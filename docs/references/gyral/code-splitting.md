---
title: Code-splitting and lazy loading
description: Load each component's code only on the pages that use it, delay hydration until it's needed, and keep the client entry's import order safe.
section: Guides
order: 13
---

# Code-splitting and lazy loading

A server-rendered page is already painted before its JavaScript arrives. So the only question
code-splitting has to answer is **when each component becomes interactive**, and the answer
can be "later, and only if it's on this page". There are three tools, from coarse to fine:

1. **Per-page chunks**: load a component's module only on pages that contain it.
2. **Lazy hydration**: load it, but hydrate it when the browser is idle, when it scrolls into
   view or on first interaction.
3. **No JavaScript at all** for pages that have nothing interactive (see
   [Static sites](/docs/static-sites/#what-ships-no-javascript)).

## Load components by what's on the page

Custom elements make this simple: the page's HTML says which components it uses. Import the
components every page has in the client entry, and load the rest when their tag appears.

```ts
// src/widgets.ts
import { define, html } from '@gyral/core';

export const Gallery = define<{ readonly index: number }, { readonly _tag: 'Next' }>('my-gallery', {
  init: () => ({ index: 0 }),
  intent: { Next: () => ({ _tag: 'Next' }) },
  update: { Next: (s) => ({ index: s.index + 1 }) },
  view: (s, i) => html`
    <output>Photo ${s.index + 1}</output>
    <button type="button" data-intent=${i.Next}>Next photo</button>
  `,
});
```

```ts
// src/lazy.ts
type Loader = () => Promise<unknown>;

/** Custom element tag → the module that defines it. */
const LOADERS: Readonly<Record<string, Loader>> = {
  'my-gallery': () => import('./widgets.js'),
};

/** Every custom element tag under `root`, including inside declarative shadow roots. */
function tagsIn(root: ParentNode): Set<string> {
  const tags = new Set<string>();
  const visit = (node: ParentNode): void => {
    for (const el of node.querySelectorAll('*')) {
      if (el.localName.includes('-')) tags.add(el.localName);
      if (el.shadowRoot !== null) visit(el.shadowRoot);
    }
  };
  visit(root);
  return tags;
}

/** Loads the module of every lazily defined tag under `root` that isn't defined yet. */
export async function loadComponentsIn(root: ParentNode): Promise<void> {
  const pending = [...tagsIn(root)]
    .filter((tag) => customElements.get(tag) === undefined)
    .flatMap((tag) => LOADERS[tag] ?? []);
  await Promise.all([...new Set(pending)].map((load) => load()));
}
```

```ts
// src/entry-client.ts
// ORDER MATTERS: hydrate support first, before anything that imports Lit.
import '@gyral/ssr/hydrate';
import { loadComponentsIn } from './lazy.js';

await loadComponentsIn(document);
```

Each `import()` becomes its own chunk, so a page without a gallery never downloads it. Until
its module loads, a server-rendered `<my-gallery>` is the server's HTML, already showing its
first state; when the module defines the element, it hydrates in place, with no flash.

[gyral-shop](https://github.com/gyraljs/gyral-shop/blob/main/src/client/lazy.ts) uses this
pattern for every page-specific component (listing, product gallery, checkout, admin), and adds
a `MutationObserver` for components inserted after load.

## Lazy hydration

When a component's code is on the page but it isn't needed yet, set `hydrate` in its spec:

| `hydrate`     | Hydrates                            |
| ------------- | ----------------------------------- |
| `load`        | as soon as possible (default)       |
| `idle`        | when the browser is idle            |
| `visible`     | when it scrolls into view           |
| `interaction` | on the first pointer or focus on it |

A delayed component is plain server HTML until then: its links and forms still work.
`interaction` hydrates on `pointerover`, `pointerdown`, `focusin` or `touchstart`, which arrive
before the click, so the first click still lands. Set it on page-level components; a component
nested inside another hydrates with its parent. More in
[Server rendering](/docs/server-rendering/#lazy-hydration).

## Keep the hydrate import first

The client entry must import `@gyral/ssr/hydrate` before anything that imports Lit. With
code-splitting there's one more thing to know: when an entry awaits a lazy import (as above),
the bundler moves the modules both chunks share, such as Lit and `@gyral/core`, into a separate
chunk and **evaluates it before the entry's own code**. Your first import is then no longer the
first module to run.

Components made with `define()` handle this themselves: they hydrate their server-rendered DOM
whether or not Lit's hydrate support was installed first. Gyral's
[isomorphic example](https://github.com/gyraljs/gyral/tree/main/examples/isomorphic) is built
this way on purpose, and its production smoke test fails if the order ever breaks hydration.

Plain `LitElement` classes in the same app don't get that protection. If you have any, either
load `@gyral/ssr/hydrate` from its own `<script type="module">` before the app entry, or set
Rolldown's `output.strictExecutionOrder` in your Vite build.

## Measure

Check what each page actually loads, in the browser's network panel, and the chunk sizes
`vite build` prints. Most apps need only two rules:
the shell's components in the entry, everything page-specific behind `import()`.
