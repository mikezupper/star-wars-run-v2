---
title: Shared state
description: Share state between distant components with stores, read like props from the side and written with messages, on the client and per request on the server.
section: Guides
order: 8
---

# Shared state

Props carry state down and outputs carry it up, which covers parents and children. Two
components far apart, like a cart badge in the header and a checkout page, need something else.
That's a **store**: Model-View-Intent without the view. Components read it like props ("props
from the side") and write to it with messages.

## When to use a store

Reach for a store when distant components need the same data and threading it through every
level in between would couple unrelated components. Keep everything else in component state:
a store is shared and global to its scope, so it's harder to reason about than a component's own
model. If the state already lives outside Gyral, in signals, Redux or a socket, keep it there
and read it with a subscription: see [State Gyral doesn't own](/docs/outside-state/).

## Defining a store

```ts
// src/cart.ts
import { defineStore } from '@gyral/core';

export interface Line {
  readonly sku: string;
  readonly name: string;
  readonly qty: number;
}

export interface Cart {
  readonly lines: readonly Line[];
}

export type CartMsg =
  | { readonly _tag: 'Add'; readonly sku: string; readonly name: string }
  | { readonly _tag: 'Remove'; readonly sku: string };

export const count = (cart: Cart): number => cart.lines.reduce((n, l) => n + l.qty, 0);

export const cart = defineStore<Cart, CartMsg>('cart', {
  init: () => ({ lines: [] }),
  update: {
    Add: (s, m) =>
      s.lines.some((l) => l.sku === m.sku)
        ? { lines: s.lines.map((l) => (l.sku === m.sku ? { ...l, qty: l.qty + 1 } : l)) }
        : { lines: [...s.lines, { sku: m.sku, name: m.name, qty: 1 }] },
    Remove: (s, m) => ({ lines: s.lines.filter((l) => l.sku !== m.sku) }),
  },
});
```

A store has a unique name, an `init` and pure reducers. Like a component's, its reducers may
return commands, run by the store's own interpreter: persisting the cart to storage, or syncing
it with a server, is a driver the store's `update` uses.

## Reading and sending

```ts
// src/cart-badge.ts
import { changed, define, html, send } from '@gyral/core';
import { cart, count } from './cart.js';

export interface State {
  readonly bumps: number;
}

export type Msg = { readonly _tag: 'Clear' };

export const CartBadge = define<State, Msg>()('my-cart-badge', {
  stores: [cart],
  init: () => ({ bumps: 0 }),
  intent: { Clear: () => ({ _tag: 'Clear' }) },
  update: {
    // Writes are commands, like any other effect.
    Clear: (s, _m, { read }) => [
      s,
      read(cart).lines.map((l) => send(cart, { _tag: 'Remove', sku: l.sku })),
    ],
    // Optional: react to a change in the store.
    StoreChanged: (s, m) => (changed(cart, m) === undefined ? s : { bumps: s.bumps + 1 }),
  },
  states: (s) => ({ bumped: s.bumps % 2 === 1 }),
  view: (_s, i, { read }) => html`
    <a href="/cart">Cart <output aria-live="polite">${count(read(cart))}</output></a>
    <button type="button" data-intent=${i.Clear}>Empty cart</button>
  `,
});
```

- **Declare** the stores a component reads in `stores`. A change to one re-renders the component.
- **Read** with `read(cart)` from the context, in the view and in every reducer. It's typed by
  the store. Reading a store you didn't declare throws an error that names the fix.
- **Write** with `send(cart, msg)`, a command. The store's reducer does the change, so every
  change to shared state is still a message you can see in tests and devtools.
- **React** with the optional `StoreChanged` reducer. `changed(cart, m)` narrows the message to
  that store's new and previous state, or `undefined` when another store changed.

A store's reducer can `send` to another store in the same scope, too.

## Where the instance lives

`defineStore` describes a store; an **instance** holds its state. Which instance a component
gets depends on where it is:

1. `el.stores[name]`, a per-element override (tests, islands);
2. the nearest `<gyral-stores>` element above it, through shadow roots;
3. the page's default instance.

Each page has one cart by default. Wrap a part of the page in `<gyral-stores>` to give it its
own instances, for example an embedded widget that must not share the page's cart.

## Stores on the server

On the server, every request needs its own instance, or one visitor's cart would show up in
another's page. Pass them to the render:

```ts
// server/cart-page.ts
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { cart, type Cart } from '../src/cart.js';

/** Renders the cart page from this visitor's saved cart. */
export const cartPage = (saved: Cart): Response =>
  renderPage({
    title: 'Your cart',
    stores: [cart.instance(saved)],
    body: html`<header><my-cart-badge></my-cart-badge></header>`,
    scripts: ['/src/entry-client.ts'],
  });
```

- Components read the request's instance synchronously while they render. Gyral keeps one
  registry per render, even across the chunks of a response, without `AsyncLocalStorage`, so it works on
  any runtime.
- `page()` writes every store's state once into the document as
  `<script type="application/json" data-gyral-stores>`, escaped for scripts. The browser
  restores it before any component hydrates, so the first client render matches the server's.
- Give `defineStore` a `schema` to check that seed in the browser: an invalid seed is reported
  with every issue path, and the store starts from `init` instead.

## Testing stores

A store's reducers are pure, so `stepStore(store, state, msg)` from `@gyral/testing` runs one
without an instance. `testStore(store, initial)` gives a test its own instance, and
`sentTo(commands, store)` lists the messages a component's reducer sent to a store. See
[Testing](/docs/testing/).
