---
title: Migrating from 0.2 to 0.3
description: Move a Gyral 0.2 app to 0.3 and its own view layer - dependencies, imports, props, lists, form state, tests and server rendering, step by step.
section: Reference
order: 3
---

# Migrating from 0.2 to 0.3

Gyral 0.3 renders with its own view layer instead of Lit. The component model is unchanged:
`define()`, intents, reducers, commands, drivers, stores, forms, the router and the testing
helpers work as before. What changes is everything a view touches: imports, bindings, lists,
props, styles, server rendering and hydration.

Most apps migrate in this order: dependencies, imports, the build checks (the compiler and the
ESLint rules list every template that needs a change), props, lists, tests, server. This page
follows that order. The 0.2 snippets are plain text; every 0.3 snippet with a file name
compiles against the 0.3 packages.

## Dependencies

- Remove `lit`, `@lit-labs/ssr` and `@lit-labs/ssr-client`, and the `lit-html` 3.3.0 override
  (`pnpm.overrides`, `overrides` or `resolutions`). No Gyral package depends on Lit, and
  `@gyral/core` has no runtime dependencies at all.
- Keep Lit only if your app has Lit elements of its own: any custom element still works next to
  Gyral components, but Gyral no longer installs it for you.
- Optional build-time peers of `@gyral/core`: `vite` ^8 (the preset and template compiler),
  `parse5` (an extra markup check in `vite build`) and `eslint` 9 or 10 (the plugin).

## Imports

Everything a view needs comes from `@gyral/core`:

| 0.2 (Lit or a Lit re-export)                                     | 0.3                                               |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| `import { html } from 'lit'` or `'@gyral/core'`                  | `import { html } from '@gyral/core'`, Gyral's own |
| `css`, `nothing`                                                 | the same names, from `@gyral/core`                |
| `unsafeCSS(x)`                                                   | `${x}` inside `css` (see [Styles](#styles))       |
| `repeat`, `keyed`                                                | `each(items, key, row, pick?)`                    |
| `live`, `liveBoolean`, `textarea()`, `textareaMarkup`            | plain bindings (see [Form state](#form-state))    |
| `classMap`, `styleMap`                                           | strings: `class=${…}`, `style="--w: ${w}px"`      |
| `svg` templates                                                  | inline `<svg>` inside `html`                      |
| `unsafeHTML` (from `lit/directives`)                             | `raw(markup)`, for trusted markup only            |
| `directive`, `ElementDirective`                                  | `defineHook({ client, server? })`                 |
| `serverHtml` (`@gyral/ssr`)                                      | `html` from `@gyral/core`                         |
| `import '@gyral/ssr/hydrate'`                                    | delete it: hydration is built in                  |
| `defineStoresProvider`, `HIDDEN_MARKER`, `HYDRATE_KEY`           | removed (they were internal)                      |
| `LIT_PACKAGES`, `LIT_PREBUNDLE` (`@gyral/core/vite`)             | removed                                           |
| `el.updateComplete`, `requestUpdate`, `renderRoot`, `hasUpdated` | `await settled()` (see [Tests](#tests))           |

New in `@gyral/core`: `each`, `raw`, `defineHook`, `prop`, `intents`, `settled`,
`HydrationMismatch`, the `renderOnFrame` spec field (messages from bursty sources render once
per animation frame), and the entry points `@gyral/core/server` and `@gyral/core/eslint`. New in
`@gyral/ssr`: `contentSecurityPolicy`, `renderPage({ csp })` and `page({ modulepreload })`; in
`@gyral/ssr/static`: `clientAssets` and `clientAssetsFromManifest`.

## Build: the Vite preset compiles templates

`gyralVitePreset()` used to dedupe Lit and pre-bundle its modules. It now adds the template
compiler to `vite build`: templates are precompiled, and a template that breaks a rule fails the
build with a code frame. Keep the spread, and add your own plugins after the preset's:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

const preset = gyralVitePreset();

export default defineConfig({ ...preset, plugins: [...preset.plugins], build: { manifest: true } });
```

The dev server and Vitest keep the runtime path, which checks the same rules on first render.
Template whitespace is normalized once per template, the same way in the compiler, the browser
and the server. 0.2 did this at runtime, so output should match, but compare pages whose layout
depends on whitespace between inline elements.

## ESLint: @gyral/core/eslint

New in 0.3: the template rules and pure `each` rows in your editor, with the compiler's messages.
Run it once over the codebase: it lists most of the changes on this page.

```js
// eslint.config.js
import gyral from '@gyral/core/eslint';

export default [{ files: ['src/**/*.ts'], ...gyral.configs.recommended }];
```

## Templates: what is an error now

0.2 accepted these and misrendered some of them. 0.3 rejects them in the compiler, the
development runtime and ESLint:

- `.value=`, `.checked=`, `.selected=`, `.open=` and `.indeterminate=` on form controls.
- Self-closing non-void elements: `<my-el />` becomes `<my-el></my-el>`.
- Unquoted multi-part attributes: `class=a${b}` becomes `class="a ${b}"`.
- Markup the HTML parser repairs: a `<tr>` directly in a `<table>`, a `<div>` in a `<p>`.
- Named character references other than `&amp; &lt; &gt; &quot; &apos; &nbsp;` in attribute
  text: write the character, or a numeric reference.
- Page shells (`<html>`, a doctype) rendered in the browser: they are server-only now.

Attributes: `null` and `undefined` remove an attribute, so `href=${s.url ?? nothing}` is just
`href=${s.url}`. `true` in a text position renders nothing and warns in development.

## Form state

One spelling per piece of state, the same on the server and in the browser. The model wins
whenever it changes, and hydration never overwrites what the user typed before scripts ran.
Unlike 0.2's `live()`, a control is written only when the model's value for it changes: a
re-render for any other reason (another field's message, a refused edit) leaves what the user
typed alone. To put a control back, change the model or re-create the form with a key (see
[Views](/docs/views/#form-state)).

```text
// 0.2
html`<input .value=${s.name} />
  <input type="checkbox" ?checked=${liveBoolean(s.agree)} />
  ${textarea({ value: s.note, attrs: { name: 'note' } })}`;
```

```ts
// src/fields.ts
import { html } from '@gyral/core';

export const fields = (s: { name: string; agree: boolean; note: string }) =>
  html`<input name="name" value=${s.name} />
    <input type="checkbox" name="agree" ?checked=${s.agree} />
    <textarea name="note">${s.note}</textarea>`;
```

The same goes for `?selected` on `<option>`, `?indeterminate` on checkboxes and `?open` on
`<details>` and `<dialog>`. See [Views](/docs/views/#form-state).

## Props: prop builders

Props are declared with builders over [Standard Schema](https://standardschema.dev). Attribute
values are always parsed and validated; an invalid value is logged and treated as missing.
**Default attribute names are now kebab-case**: `minPrice` reads `min-price`, where Lit read
`minprice`. Update the markup, or pass `attribute: 'minprice'`.

```text
// 0.2: Lit property declarations
props: {
  label: { type: String, required: true },
  step: { type: Number, default: 1 },
  items: { attribute: false, default: [] },
}
```

```ts
// src/stepper.ts
import { define, html, prop } from '@gyral/core';
import * as v from 'valibot';

interface Props {
  readonly label: string;
  readonly step: number;
  readonly items: readonly string[];
}

export const Stepper = define<{ readonly value: number }, { readonly _tag: 'Bump' }, Props>(
  'my-stepper',
  {
    props: {
      label: prop.string({ required: true }),
      step: prop.number({ default: 1 }),
      items: prop.value(v.array(v.string()), { default: [] }), // property only
    },
    init: () => ({ value: 0 }),
    intent: { Bump: () => ({ _tag: 'Bump' }) },
    update: { Bump: (s, _m, { props }) => ({ value: s.value + props.step }) },
    view: (s, i, { props }) =>
      html`<button type="button" data-intent=${i.Bump}>${props.label}: ${s.value}</button>
        <p>${props.items.length} items</p>`,
  },
);
```

`prop.boolean()` is presence-based and defaults to `false`; `prop.json(schema)` parses JSON from
an attribute. `PropsChanged`, and props as `ctx.props`, are unchanged. See
[Components](/docs/components/#props).

## Lists: each, pure rows, pick and intents

`each(items, key, row, pick?)` replaces `repeat` and `keyed`. A row re-renders only when its item
or its `pick` result changes, so a row may read only its arguments and module-level values. Name
intents in rows with a module-level `intents<Msg>()`, and pass view values, such as the
selection, through `pick`. ESLint's `gyral/each-row-purity` names every read to move.

```text
// 0.2
${repeat(s.todos, (t) => t.id, (t) =>
  html`<li class=${classMap({ selected: t.id === s.selected })}>
    <button data-intent=${i.Pick} value=${t.id}>${t.text}</button></li>`)}
```

```ts
// src/todos.ts
import { define, each, html, intents } from '@gyral/core';

interface Todo {
  readonly id: number;
  readonly text: string;
}
interface State {
  readonly todos: readonly Todo[];
  readonly selected: number;
}
type Msg = { readonly _tag: 'Pick'; readonly id: number };

const i = intents<Msg>();

const Row = (t: Todo, selected: boolean) =>
  html`<li class=${selected ? 'selected' : ''}>
    <button type="button" value=${t.id} data-intent=${i.Pick}>${t.text}</button>
  </li>`;

export const Todos = define<State, Msg>('my-todos', {
  init: () => ({ todos: [{ id: 1, text: 'Write docs' }], selected: 1 }),
  intent: { Pick: ({ value }) => ({ _tag: 'Pick', id: Number(value) }) },
  update: { Pick: (s, m) => ({ ...s, selected: m.id }) },
  view: (s) =>
    html`<ul>
      ${each(
        s.todos,
        (t) => t.id,
        Row,
        (t) => t.id === s.selected,
      )}
    </ul>`,
});
```

For `keyed(id, template)`, a fresh element whenever an id changes, render a one-item list:
`each([s.item], (it) => it.id, Item)`. See [Views](/docs/views/#lists).

## Hooks instead of directives

Element directives become hooks: small behaviours on the element they sit in, with an optional
server half that adds attributes to the server-rendered start tag. `invalid(errors)` and
`labelledBy(id)` are hooks now; their call sites don't change, and `invalid()` writes
`aria-invalid` on the server itself, so remove any `aria-invalid` you bound next to it.

```ts
// src/scroll-when.ts
import { defineHook, html } from '@gyral/core';

/** Scrolls the element into view when `active` turns true. */
export const scrollWhen = defineHook<[active: boolean]>({
  client: (el, [active], prev) => {
    if (active && prev?.[0] !== true) el.scrollIntoView({ block: 'nearest' });
  },
});

export const step = (current: boolean) => html`<li ${scrollWhen(current)}>Step</li>`;
```

## Styles

- `${value}` inside `css` inserts strings and numbers as written, and another `css` value as its
  text, so `unsafeCSS` is gone. CSS is trusted author code: never interpolate user input.
- `styles` accepts `css` values, strings (`import base from './base.css?inline'`) and arrays of
  them. `CSSStyleSheet` objects are no longer accepted, because the server can't read them:
  share the `css` value instead. Each one maps to one shared sheet.

```ts
// src/styles.ts
import { css } from '@gyral/core';

const SPEED_MS = 600;
const tokens = css`
  :host {
    --accent: oklch(55% 0.18 260);
  }
`;

export const styles = css`
  ${tokens}
  li {
    transition: color ${SPEED_MS}ms ease-out;
  }
`;
```

## Light components and their children

A `shadow: false` component owns all its children. The server now throws when a template writes
children inside a light component's tag (whitespace is dropped), and the browser reports a
hydration mismatch. Pass the data as props instead. Shadow components still take children for
their `<slot>`s.

## Tests

`await settled()` from `@gyral/core` waits until every component has rendered, view transitions
and lazily loaded code included. It replaces `await el.updateComplete`, and loops over several
elements.

```ts
// src/click-and-wait.ts
import { settled } from '@gyral/core';

export async function clickAndWait(button: HTMLButtonElement): Promise<void> {
  button.click();
  await settled();
}
```

In `@gyral/testing`, `hydrated(page)` now waits for `settled()`. It no longer awaits
`updateComplete` on other custom elements (await your own Lit elements yourself), and takes
`{ releaseIslands: true }` to hydrate pending islands. `mountSsr` no longer ignores Lit's
development console banner.

## Server rendering

Rendering is Gyral's own (`@gyral/core/server`): synchronous, no DOM shim, any runtime.
`@gyral/ssr` keeps `renderPage`, `renderToString`, `renderToStream`, `page`,
`formAction` and `@gyral/ssr/static`, and every template is written with core's `html`:

```ts
// server/home.ts
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';

const styles = ':root { color-scheme: light dark; }';

export function home(): Response {
  return renderPage({
    title: 'Home',
    styles,
    head: html`<link rel="icon" href="/favicon.svg" />`, // was serverHtml`…`
    body: html`<my-home></my-home>`,
    scripts: ['/src/entry-client.ts'],
    csp: { directives: { 'default-src': "'self'" } }, // built when the page renders
  });
}
```

- **The CSP** allows shadow components' `<style>` elements by hash, so `style-src` needs no
  `'unsafe-inline'` any more. `renderPage({ csp: { directives } })` builds the header when the
  page renders, with every component registered by then; `contentSecurityPolicy()` builds it
  ahead of time (a static `_headers` file), for the components imported before the call. See
  [Server rendering](/docs/server-rendering/#content-security-policy).
- **Preloading:** in production, read the entry and its preloads from the Vite manifest with
  `clientAssetsFromManifest()` and pass `modulepreload` to `renderPage`; `productionServer` now
  hands `{ clientEntry, modulepreload }` to `createApp`, and a `preload(modules)` for pages
  whose route module is imported lazily. See
  [Static sites](/docs/static-sites/#a-static-build).
- A `Promise` anywhere in a view is an error: load data in the handler first, as before.
- Development output (Vite's dev server, Vitest) carries `<!--gyral:ID-->` markers; production
  output is the template HTML plus values. Regenerate golden SSR fixtures. The Vite preset keeps
  `@gyral/*` out of SSR externalization in the dev server, so server code loaded with
  `ssrLoadModule` gets development output without options. A server run by plain Node gets
  production output; `{ dev: true }` on `renderPage` or `renderToStream` turns the markers on.

## Hydration

- **No hydration import and no evaluation-order rules.** The client entry imports the
  components; each server-rendered component adopts its DOM in place, on its own, whether its
  parent has hydrated or not.
- **Mismatches** between server markup and the first client render throw `HydrationMismatch` in
  development, with the tag, template location, DOM path, expected and found. Production
  re-renders only that component and warns. Typical causes: a view that reads the clock or
  randomness, or a third party that edits the page before scripts run.
- **Islands** (`hydrate: 'idle' | 'visible' | 'interaction'`) may sit anywhere, also inside
  other components. Components inside a pending island hydrate on their own at load; only the
  island waits.
- The hydration code is a lazily loaded chunk, fetched only by pages with server-rendered
  components.

## Size

Gzip, production builds with the preset. "First load" is the entry chunk and its static imports,
what a page loads before any `import()`:

| Bundle                   | 0.2.0    | 0.3: first load | 0.3: all chunks |
| ------------------------ | -------- | --------------- | --------------- |
| hello-world              | 12.2 KiB | 8.9 KiB         | 11.3 KiB        |
| isomorphic (SSR)         | 17.3 KiB | 13.0 KiB        | 15.6 KiB        |
| no-js-first (SSR, forms) | 18.7 KiB | 16.8 KiB        | 19.3 KiB        |

Features load with the API that uses them (`each`, `raw`, hooks, `command()`, stores, prop
builders), so small apps shed the most. If you keep a size budget, budget the first load: the
lazy hydration chunk (about 2.8 KiB) only loads on server-rendered pages.

This site moved too. Its two islands, the home page counter and the search box, shipped as one
17.2 KiB chunk on 0.2.0 (gzip at level 9). On 0.3 the entry is 13.7 KiB, and the hydration
chunk, 2.8 KiB, is preloaded alongside it on the two pages that have islands. Docs pages still
ship no framework JavaScript at all.

## What didn't change

`define()` and its type parameters, intents and `data-intent`, reducers and `Next`, commands,
drivers and concurrency lanes, stores, `form()`, `field()` and `formAction`, the router, time
and HTTP packages, `step()` and `run()`. If your app's views were already plain `html` with
`data-intent` and attribute bindings, most of the work is in props, lists and tests.
