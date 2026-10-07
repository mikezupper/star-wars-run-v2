---
title: Code-splitting and lazy loading
description: Load each component's code only on the pages that use it, delay hydration until it's needed, and see what each page downloads.
section: Guides
order: 14
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
import { loadComponentsIn } from './lazy.js';

await loadComponentsIn(document);
```

Each `import()` becomes its own chunk, so a page without a gallery never downloads it. Until
its module loads, a server-rendered `<my-gallery>` is the server's HTML, already showing its
first state; when the module defines the element, it hydrates in place, with no flash.

A page that you know needs a lazy chunk can preload it with the entry instead of finding it
only after the entry has run. `clientAssetsFromManifest(manifestPath, entry, also)` from
`@gyral/ssr/static` reads Vite's build manifest; `also` takes the source paths of those modules
(`['src/widgets.ts']`) and adds them, with their static imports, to `modulepreload`. On a
server, `productionServer` hands your app a `preload(modules)` that does the same per page (see
[Deploying](/docs/deploying/#node)).

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
before the click, so the first click still lands. An island may sit anywhere, also inside
another component; components inside a waiting island still hydrate at load, so make them
islands too if they should wait. More in
[Server rendering](/docs/server-rendering/#lazy-hydration).

## Module order doesn't matter

Hydration is built into every component, so no import has to run first. When an entry awaits a
lazy import (as above), the bundler may move the modules both chunks share, such as
`@gyral/core`, into a separate chunk that runs before the entry's own code. That's fine: each
component hydrates from its own seed and its own template whenever its element is defined.

Gyral splits itself the same way. Features load with the API that uses them, so an app that
never calls `each`, `raw`, `defineHook`, `command()` or `defineStore()` doesn't bundle their
code, and the hydration code is a chunk of its own (about 2.8 KiB gzip) that only pages with
server-rendered components fetch. Preload it with the entry: `clientAssetsFromManifest()` from
`@gyral/ssr/static` lists it, and `renderPage({ modulepreload })` writes the hints (see
[Static sites](/docs/static-sites/#a-static-build)).

## Measure

Check what each page actually loads, in the browser's network panel, and the chunk sizes
`vite build` prints. Most apps need only two rules:
the shell's components in the entry, everything page-specific behind `import()`.
