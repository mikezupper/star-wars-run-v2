---
title: Intent
description: How Gyral turns clicks, input, form submissions and keys into typed messages, and why the view never holds event handlers.
section: Guides
order: 2
---

# Intent

**Intent** answers one question: what did the user mean? It turns platform events into
messages, and it is the only place where raw input is read. Everything after it, the model and
the view, works with typed, already-parsed data.

```ts
// src/search-box.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly query: string;
  readonly submitted: string | undefined;
}

export type Msg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Search'; readonly query: string }
  | { readonly _tag: 'Clear' };

export const SearchBox = define<State, Msg>('my-search-box', {
  init: () => ({ query: '', submitted: undefined }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }),
    Search: ({ formData }) => {
      const q = formData?.get('q');
      return typeof q === 'string' && q.trim() !== ''
        ? { _tag: 'Search', query: q.trim() }
        : undefined;
    },
    Clear: ({ key }) => (key === 'Escape' ? { _tag: 'Clear' } : undefined),
  },
  update: {
    Typed: (s, m) => ({ ...s, query: m.query }),
    Search: (s, m) => ({ ...s, submitted: m.query }),
    Clear: () => ({ query: '', submitted: undefined }),
  },
  view: (s, i) => html`
    <search data-intent=${i.Clear} data-intent-on="keydown">
      <form data-intent=${i.Search}>
        <label for="q">Search</label>
        <input id="q" name="q" type="search" value=${s.query} data-intent=${i.Typed} />
        <button>Search</button>
      </form>
    </search>
    <p>${s.submitted === undefined ? 'Nothing searched yet.' : `Results for “${s.submitted}”`}</p>
  `,
});
```

## Naming intents in markup

The view puts `data-intent=${i.Search}` on an element. `i` holds the message tags, typed, so a
misspelt intent is a compile error. When that element's trigger event fires, Gyral calls the
parser registered under the same name in `intent`, and sends whatever it returns through
`update`.

The view never attaches a closure. That keeps it a pure function of state, which matters for
[server rendering](/docs/server-rendering/) (the markup the server sends already names every
intent) and for testing (there's nothing to call but `update`).

## Trigger events

Each element has a natural event, so you rarely say which one:

| Element                                  | Fires on                                |
| ---------------------------------------- | --------------------------------------- |
| `<form>`                                 | `submit` (Gyral prevents the page load) |
| `<input>` (text-like), `<textarea>`      | `input`                                 |
| checkbox and radio `<input>`, `<select>` | `change`                                |
| a custom element (a child component)     | its outputs                             |
| anything else (`<button>`, …)            | `click`                                 |

Override it with `data-intent-on`, such as `data-intent-on="keydown"`. Any event type works
there: `keyup`, `focusin`, `focusout`, `toggle` (popovers and `<details>`), `command` (invoker
commands, below), `pointerdown` or a third-party element's own event. A component listens only
for the events its templates name, so a component without keyboard intents never runs intent
lookup on a keystroke. If the value itself is bound, `data-intent-on=${…}`, the component listens
for `keydown`, `keyup`, `focusin`, `focusout`, `toggle` and `command` as well; list any other
event type it can produce in the spec: `events: ['pointerdown']`.

An element carries one `data-intent`. To give a control a second intent, put it on an
ancestor, as the example does: the `keydown` intent sits on `<search>` around the input whose
`input` intent is on the input itself.

## What a parser receives

A parser gets one `IntentInput` object:

| Field                     | Holds                                                                    |
| ------------------------- | ------------------------------------------------------------------------ |
| `value`                   | The `value` of the input, select, textarea or button that has the intent |
| `checked`                 | `checked`, for checkboxes and radios                                     |
| `formData`                | The submitted `FormData` (with the submitter button), for a `<form>`     |
| `key`                     | `KeyboardEvent.key`, for `keydown` and `keyup`                           |
| `newState`                | `'open'` or `'closed'`, for `toggle`                                     |
| `detail`                  | A child component's output                                               |
| `command`                 | The invoker command and its source, for `command`                        |
| `event`, `target`, `name` | The raw event, the element and the intent name                           |

Prefer the parsed fields to `event`: they read the same way for every element, and they're
what [tests](/docs/testing/) can construct.

## Parse, don't validate

A parser returns one of three things:

- **A message** of its own tag's variant.
- **`undefined`** to ignore the event. Above, `Clear` ignores every key but Escape, and
  `Search` ignores an empty query. Ignoring is not an error.
- **`IntentRejected`**, a framework message with field issues, when input fails a schema. The
  [Forms](/docs/forms/) helpers `form()` and `field()` produce it for you.

Parsers may return a promise, because schema validation can be async. They must not do side
effects. The one exception is `event.preventDefault()`, for example to stop arrow keys moving
the caret.

## Typing parsers

Each key in `intent` produces its own variant: the `Search` parser above returns a
`{ _tag: 'Search'; … }`. Inside the spec, leave the return type off, and the key types it.

Don't annotate a parser with the whole union. `(): Msg => …` widens it, and TypeScript answers
with a long error that ends in "`IntentParser<Msg>` is not assignable to …". A parser written
outside the spec returns its variant:

```ts
// src/search-parser.ts
import type { IntentInput } from '@gyral/core';
import type { Msg } from './search-box.js';

/** The variant, not the union; `undefined` ignores the event. */
export const parseSearch = ({
  formData,
}: IntentInput): Extract<Msg, { _tag: 'Search' }> | undefined => {
  const q = formData?.get('q');
  return typeof q === 'string' && q.trim() !== '' ? { _tag: 'Search', query: q.trim() } : undefined;
};
```

`_tag: 'Search' as const` in the returned object works too. The same holds for the mappers of
`child()`, `form()` and `field()`.

## Buttons carry their own data

A button's `value` is part of `IntentInput`, so a list of buttons needs one intent, not one
closure per row:

```html
<button type="button" value="sku-42" data-intent="AddToCart">Add to cart</button>
```

The parser reads `value` and the reducer finds the product. This is also what keeps the markup
meaningful without JavaScript.

## Invoker commands

An element with `data-intent-on="command"` receives
[invoker commands](https://developer.mozilla.org/en-US/docs/Web/API/Invoker_Commands_API)
aimed at it, from buttons anywhere in the component:

```ts
// src/shopping-list.ts
import { define, each, html } from '@gyral/core';

export interface State {
  readonly items: readonly string[];
}

export type Msg = { readonly _tag: 'Command'; readonly command: '--add' | '--clear' };

const Item = (item: string) => html`<li>${item}</li>`;

export const ShoppingList = define<State, Msg>('my-shopping-list', {
  init: () => ({ items: [] }),
  intent: {
    Command: ({ command }) =>
      command?.command === '--add' || command?.command === '--clear'
        ? { _tag: 'Command', command: command.command }
        : undefined,
  },
  update: {
    Command: (s, m) =>
      m.command === '--add'
        ? { items: [...s.items, `Item ${String(s.items.length + 1)}`] }
        : { items: [] },
  },
  view: (s, i) => html`
    <button type="button" commandfor="list" command="--add">Add item</button>
    <button type="button" commandfor="list" command="--clear">Clear</button>
    <ul id="list" data-intent=${i.Command} data-intent-on="command">
      ${each(s.items, (item) => item, Item)}
    </ul>
  `,
});
```

Invoker commands are newly available in browsers. Where the native `CommandEvent` is missing,
Gyral dispatches an equivalent event for custom (`--…`) commands, so the same markup works
everywhere. Built-in commands such as `show-modal` are left to the browser.

## Isolation

Only `data-intent` elements in the component's own render root count. A click inside a child
component belongs to the child, never to the parent, because the child's shadow root is a
boundary. Light-DOM components keep the same rule by stopping at the next Gyral host.
