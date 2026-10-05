---
title: Views
description: Views are pure functions from state to Lit templates. Name intents, render lists, and keep markup right on the server and in the browser.
section: Guides
order: 4
---

# Views

A **view** is a function from state to HTML. It receives the state, the typed intent names
`i`, and the context `{ props, read }`, and returns a [Lit](https://lit.dev) template. It has no
other inputs and no side effects, so the same state always renders the same markup, on the
server and in the browser.

```ts
// src/profile.ts
import { define, html, nothing } from '@gyral/core';

export interface State {
  readonly editing: boolean;
  readonly name: string;
}

export type Msg = { readonly _tag: 'Edit' } | { readonly _tag: 'Save'; readonly name: string };

export const Profile = define<State, Msg>('my-profile', {
  init: () => ({ editing: false, name: 'Ada' }),
  intent: {
    Edit: () => ({ _tag: 'Edit' }),
    Save: ({ formData }) => {
      const name = formData?.get('name');
      return typeof name === 'string' ? { _tag: 'Save', name } : undefined;
    },
  },
  update: {
    Edit: (s) => ({ ...s, editing: true }),
    Save: (_s, m) => ({ editing: false, name: m.name }),
  },
  view: (s, i) => html`
    <h2>${s.name}</h2>
    ${
      s.editing
        ? html`<form data-intent=${i.Save}>
            <label for="name">Name</label>
            <input id="name" name="name" autocomplete="name" value=${s.name} required />
            <button>Save</button>
          </form>`
        : nothing
    }
    <button type="button" data-intent=${i.Edit} ?hidden=${s.editing}>Edit name</button>
  `,
});
```

## Lit templates

`html`, `css`, `svg` and `nothing`, and the directives `repeat`, `keyed`, `live`, `classMap` and
`styleMap`, are re-exported from `@gyral/core`, so a component needs one import. The binding
forms are Lit's:

| Binding          | Sets                                    |
| ---------------- | --------------------------------------- |
| `${value}`       | Text content (escaped)                  |
| `attr=${value}`  | An attribute                            |
| `?attr=${bool}`  | A boolean attribute (present or absent) |
| `.prop=${value}` | A property, for objects and child props |

Write `nothing` to render nothing; an empty string works too. Templates are compiled once and
only the changed parts update, so there's no virtual DOM to diff.

## No event handlers

Lit's `@click=${…}` binding attaches a closure. Gyral views don't use it: they name an
[intent](/docs/intent/) with `data-intent=${i.Edit}` and let the intent layer read the event.
Everything a view needs to express, such as "this button means Edit, for item 42", fits in
markup: the intent name and the button's `value`.

## Use the right element

Views are where accessibility is decided, and semantic HTML gets you most of it for free:

- A `<button>` for actions, an `<a href>` for navigation, a `<form>` for anything submitted.
- A `<label for>` for every control, `<output>` for computed values, `<fieldset>` and
  `<legend>` for groups.
- Landmarks (`<header>`, `<main>`, `<nav>`, `<search>`) and a sensible heading order.
- Native `<dialog>`, `popover` and `<details>` instead of hand-built widgets.

Forms with a real `action` and `method` keep working before JavaScript loads. See
[Forms](/docs/forms/).

## Lists

Render lists with `repeat(items, key, template)`. The key ties each rendered item, and any
child component in it, to its data, so reordering moves elements instead of rewriting them:

```html
<ol>
  ${repeat(s.results, (r) => r.id, (r) => html`
  <li><a href="${r.url}">${r.name}</a></li>
  `)}
</ol>
```

`keyed(key, template)` replaces a subtree whenever the key changes, for example to restart a CSS
animation.

## Helpers for form controls

A few bindings behave differently on the server and in the browser. Gyral ships directives that
get both right:

- **`?checked=${liveBoolean(s.on)}`** for `checked`, `selected`, `open` and `indeterminate`. On
  the server it renders the attribute or omits it. In the browser it also sets the property, so
  the control follows the model even after the user clicked it. (A property binding,
  `.checked=${false}`, is written by the server as `checked="false"`, which checks the box.)
- **`.value=${live(s.text)}`** for controlled inputs whose parent may reject or clamp a value:
  it compares against the input's current value, not the last rendered one.
- **`textarea({ value, attrs })`** in a child position, because Lit can't bind inside
  `<textarea>`. It keeps text the user typed until the model's value changes.
- **`invalid(errors)`** mirrors model errors into native validity. See [Forms](/docs/forms/).
- **`labelledBy('page-title')`** names a form or region after a heading outside the
  component's shadow root, which `aria-labelledby` can't reach on its own.

## Focus is a command

Moving focus is a side effect, so it comes from `update`, not the view. `focus(selector)`
focuses the first match in the component once the update has rendered, so it can target an
element the same update creates:

```ts
// src/pager.ts
import { define, focus, html } from '@gyral/core';

export interface State {
  readonly page: number;
}

export type Msg = { readonly _tag: 'Next' };

export const Pager = define<State, Msg>('my-pager', {
  init: () => ({ page: 1 }),
  intent: { Next: () => ({ _tag: 'Next' }) },
  update: {
    // Move focus to the new page's heading, as a screen reader user would expect.
    Next: (s) => [{ page: s.page + 1 }, [focus('h2', { preventScroll: true })]],
  },
  view: (s, i) => html`
    <h2 tabindex="-1">Page ${s.page}</h2>
    <button type="button" data-intent=${i.Next}>Next page</button>
  `,
});
```

Headings aren't focusable by default, hence `tabindex="-1"`.

## Pure means repeatable

Because a view only reads its arguments, the server can render it, the browser can hydrate the
same markup without changes, and a test can render a state and inspect it. If a view needs the
time, a random number or a measurement, put it in state through a
[command](/docs/effects/) first.
