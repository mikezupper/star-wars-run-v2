---
title: Styling and themes
description: Style Gyral components with Shadow DOM, cascade layers, custom properties and custom states, and make a whole site themeable from CSS alone.
section: Guides
order: 5
---

# Styling and themes

Gyral adds nothing to CSS. Components are custom elements, so you style them with the platform:
Shadow DOM for encapsulation, custom properties for theming, cascade layers for order, and
custom states for reacting to the model.

## Styles in define()

`styles` holds the component's shadow-root CSS:

```ts
// src/tag.ts
import { css, define, html, prop, type Stateless } from '@gyral/core';

export const Tag = define<Stateless, never, { readonly label: string }>()('my-tag', {
  props: { label: prop.string({ required: true }) },
  intent: {},
  update: {},
  view: (_s, _i, { props }) => html`<span part="label">${props.label}</span>`,
  styles: css`
    @layer component {
      :host {
        display: inline-block;
      }
      span {
        padding-inline: 0.5em;
        border-radius: var(--tag-radius, 1em);
        background: var(--tag-bg, color-mix(in oklch, currentColor 12%, transparent));
      }
    }
  `,
});
```

`styles` accepts a `css` template, a plain CSS string (such as
`import base from './base.css?inline'`) or an array of them, nested freely. Strings let one
stylesheet module serve both the document and shadow roots. Either way, it must be your own
trusted CSS, never user input.

A `${…}` inside `css` inserts a string or number as written, and another `css` value as its
text, so constants and shared pieces compose:

```ts
// src/letters-styles.ts
import { css } from '@gyral/core';

export const TRANSITION_MS = 600;

const tokens = css`
  :host {
    --accent: oklch(55% 0.18 260);
  }
`;

export const lettersStyles = css`
  ${tokens}
  @layer component {
    li {
      color: var(--accent);
      transition: font-size ${TRANSITION_MS}ms ease-out;
    }
  }
`;
```

Each `css` value becomes one shared `CSSStyleSheet` in the browser, adopted by every shadow root
that uses it, so a thousand instances cost one sheet.

Styles in a shadow root don't leak out, and page styles don't leak in. Rendered on the server,
they travel inside the component's Declarative Shadow DOM as one `<style>` element, so they
apply before any JavaScript runs. When the component hydrates, Gyral swaps that element for the
shared sheet in the same step, so nothing flashes. A strict Content Security Policy doesn't need
`'unsafe-inline'` for them: `renderPage({ csp })` and `contentSecurityPolicy()` from `@gyral/ssr`
list each component's `<style>` by its hash (see [Server rendering](/docs/server-rendering/#content-security-policy)).

## Theming with custom properties

Custom properties inherit through shadow boundaries. That makes them the theming API of a
component: read a `--tag-bg` with a sensible default, and let the page set it.

```css
/* app.css */
@layer tokens {
  :root {
    color-scheme: light dark;
    --tag-bg: light-dark(oklch(94% 0.03 250), oklch(32% 0.05 250));
    --tag-radius: 0.25rem;
  }
}
```

Document the custom properties a component reads, and treat renaming one as a breaking change.
For pieces a theme may want to restyle completely, expose them as parts (`part="label"`) so the
page can write `my-tag::part(label) { … }`.

## Inline styles under a strict CSP

Some values don't come from a fixed set: a width the user dragged, a colour they picked. Bind
those as custom properties in a `style` attribute, a plain binding like any other, and let the
stylesheet use them:

```ts
// src/split-view.ts
import { css, define, html, prop, type Stateless } from '@gyral/core';

export interface Props {
  /** The sidebar width the user chose, in pixels. */
  readonly sidebar: number;
  readonly compact: boolean;
}

export const SplitView = define<Stateless, never, Props>()('my-split-view', {
  props: { sidebar: prop.number({ required: true }), compact: prop.boolean() },
  intent: {},
  update: {},
  view: (_s, _i, { props }) => html`
    <div
      class="split"
      data-density=${props.compact ? 'compact' : 'comfortable'}
      style="--sidebar: ${props.sidebar}px"
    >
      <aside><slot name="aside"></slot></aside>
      <div><slot></slot></div>
    </div>
  `,
  styles: css`
    .split {
      display: flex;
      gap: 1.5rem;
    }
    .split[data-density='compact'] {
      gap: 0.5rem;
    }
    aside {
      flex: none;
      inline-size: var(--sidebar, 16rem);
    }
  `,
});
```

A Content Security Policy without `'unsafe-inline'` blocks `style` attributes in HTML and
`setAttribute('style', …)`, but not styles set from script through the CSSOM. Here is what
that means for Gyral:

- **Client renders and updates always apply.** Gyral writes `style` bindings, and static
  `style="…"` attributes in templates, through the CSSOM (`el.style.cssText`), so a component
  rendered or updated in the browser needs no `'unsafe-inline'`.
- **Server HTML waits for hydration.** The server writes `style` as an attribute, so under a
  strict policy the first paint goes without it. When the component hydrates, Gyral applies the
  same value through the CSSOM. On a page that never hydrates, it stays blocked.

So plan the first paint around it. Values from a known set belong in the stylesheet, selected
by a class or a data attribute such as `data-density` above: they apply from the first paint,
with no inline style at all. Continuous values go in custom properties with a fallback in the
stylesheet, such as `inline-size: var(--sidebar, 16rem)`: the first paint uses the fallback,
and the user's width arrives with hydration. A page rendered per request can also allow its own
style attributes by hash, with `renderPage({ csp: { styleAttributes: 'hash' } })`
([Server rendering](/docs/server-rendering/#content-security-policy)), so they paint before
hydration.

## Custom states

To style by what the model says, mirror boolean facts onto the element's custom states with
`states`. CSS then reads them with `:state()`, inside and outside the component:

```ts
// src/upload.ts
import { css, define, html } from '@gyral/core';

export interface State {
  readonly phase: 'idle' | 'uploading' | 'failed';
}

export type Msg = { readonly _tag: 'Retry' };

export const Upload = define<State, Msg>()('my-upload', {
  init: () => ({ phase: 'idle' }),
  intent: { Retry: () => ({ _tag: 'Retry' }) },
  update: { Retry: () => ({ phase: 'uploading' }) },
  states: (s) => ({ busy: s.phase === 'uploading', failed: s.phase === 'failed' }),
  view: (s, i) => html`
    <p aria-busy=${s.phase === 'uploading'}>${s.phase}</p>
    <button type="button" data-intent=${i.Retry}>Retry</button>
  `,
  styles: css`
    :host(:state(failed)) p {
      color: var(--danger, crimson);
    }
  `,
});
```

From the page: `my-upload:state(busy) { opacity: 0.6; }`. No classes to keep in sync, and the
model stays the single source of truth. Custom states are for styling; accessibility state still
belongs in ARIA attributes such as `aria-busy`, as above. They are applied in the browser only.

## Cascade layers

Put every stylesheet in a layer, and declare the order once:

```css
@layer reset, tokens, base, components, theme;
```

Later layers win regardless of specificity, so a theme never has to out-specify a component.
Gyral's examples and the [gyral-shop](https://github.com/gyraljs/gyral-shop) put component CSS
in `@layer component` (or `components`) and leave the last layer for themes.

## Light-DOM components

Some components are pages, not widgets: a product listing with its `<h1>`, a docs article. For
those, `shadow: false` renders the view as the element's own children:

```ts
// src/article-page.ts
import { define, html, prop, type Stateless } from '@gyral/core';

export const ArticlePage = define<Stateless, never, { readonly heading: string }>()(
  'my-article-page',
  {
    shadow: false,
    props: { heading: prop.string({ required: true }) },
    intent: {},
    update: {},
    view: (_s, _i, { props }) => html`
      <article>
        <h1>${props.heading}</h1>
      </article>
    `,
  },
);
```

- Document CSS applies directly, so the page's stylesheet and theme can lay it out.
- On the server it renders as plain HTML, with no `<template shadowrootmode>`, which every
  crawler and reader mode understands.
- It has no `styles` and no `<slot>`s: it owns all its children. Don't write children inside
  its tag; pass data as props (the server throws on children it would have to drop). Scope its
  CSS with `@scope (my-article-page) { … }` or by tag name.
- Intent isolation still holds: a light component's intents stop at the next Gyral component
  inside it.

Keep widgets (buttons, dialogs, form controls) in Shadow DOM, and use light DOM for page
structure.

## A whole site as a theme

Put those together and a site's look can live entirely in CSS, the way the
[CSS Zen Garden](https://csszengarden.com) did it. gyral-shop's theme contract is a worked
example:

1. **Markup is semantic and theme-neutral.** Elements are chosen for meaning, never for looks.
2. **Stable hooks.** Pages carry `data-region="listing"`, components `data-component="price"`,
   and regions and cards declare container names. Hooks are documented, and renaming one is a
   breaking change.
3. **Tokens.** Every colour, font, radius, spacing and motion value is a custom property, set
   for light and dark with `light-dark()`. A check in the build rejects literal colours outside
   token files.
4. **Light DOM for page structure, Shadow DOM for widgets.** Themes can re-lay out pages with
   grid areas, container queries and `:has()`, and restyle widgets through tokens and parts.
5. **Themes are stylesheets** in `@layer theme`. The server renders the chosen theme's
   `<link>`, so there's no flash of the wrong theme.

The shop switches between four themes this way, from a dense marketplace to an airy boutique,
without changing any markup. See them on the [home page](/#showcase).
