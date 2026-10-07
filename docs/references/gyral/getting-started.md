---
title: Getting started
description: Install Gyral, write your first Model-View-Intent component, use it in a page, and test it without a browser.
section: Start here
order: 1
---

# Getting started

In this guide you'll create a Gyral app, write a counter component, put it on a page, and test
it. You need [Node.js](https://nodejs.org) 24 or later and a package manager. The examples use
npm; pnpm and yarn work the same way.

## Create a project

The quickest start is `create-gyral`. It sets up a Vite project with Gyral, TypeScript and a
first test:

```sh
npm create gyral@latest my-app -- --template ssr
cd my-app
npm install
npm run dev
```

There are two templates:

- **`basic`**: a client-rendered app. The page loads and your components render in the
  browser. It builds [client-only](/docs/rendering-modes/#client-only-builds), without
  hydration code; remove `clientOnly: true` from `vite.config.ts` before you render any page
  on a server.
- **`ssr`**: the same component rendered on the server first, so the page works before any
  JavaScript loads, then [hydrated](/docs/server-rendering/) in place.

Leave out `--template` and it asks you which one you want.

### Or set it up by hand

Gyral works with any bundler. To add it to a [Vite](https://vite.dev) project yourself:

```sh
npm create vite@latest my-app -- --template vanilla-ts
cd my-app
npm install @gyral/core
```

`@gyral/core` is the whole runtime: Gyral renders with its own view layer and has no runtime
dependencies.

Then add Gyral's Vite preset. It adds the template compiler to `vite build`: every template is
checked and precompiled, so a mistake fails the build with a code frame and the bundle doesn't
carry the code that prepares templates at runtime:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

export default defineConfig({
  ...gyralVitePreset(),
});
```

To see the same checks in your editor, add the ESLint config from `@gyral/core/eslint` (see
[Views](/docs/views/#checked-before-it-runs)). Optionally, `npm install -D parse5` lets the
compiler check markup against a full HTML parser too.

## Write a component

A component is a custom element defined from four parts: its initial state, the intents it
understands, how each message changes the state, and how the state looks.

```ts
// src/counter.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly count: number;
}

export type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' };

export const Counter = define<State, Msg>('my-counter', {
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

Read it from the bottom up:

- **The view** is an `html` template. It doesn't attach event handlers. Instead it _names_ an
  intent on each button with `data-intent`. `i` is typed from your messages, so a misspelt
  `i.Incremnt` is a compile error.
- **Intent** says how a platform event becomes a message. A click on a button carrying
  `data-intent=${i.Increment}` runs the `Increment` parser, which returns
  `{ _tag: 'Increment' }`. A parser can also read the event's value, form data or key, and
  return `undefined` to ignore it.
- **Update** has one reducer per message, and TypeScript checks you have one for every message.
  A reducer returns the next state and never changes the old one.
- **Init** gives the state the component starts with.

## Use it in a page

`define()` registers the element, so importing the module is enough. Replace the contents of
`index.html`'s `<body>` and import your component:

```html
<body>
  <main>
    <h1>My first Gyral app</h1>
    <my-counter></my-counter>
  </main>
  <script type="module" src="/src/counter.ts"></script>
</body>
```

Run `npm run dev` and open the address it prints. The counter is a standard custom element with
its own Shadow DOM, so it works in any page and alongside any framework.

## Read input

Intents get more than the event. Here's a step size the user can type, read from the input's
`value` and parsed before it reaches the model:

```ts
// src/stepper.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly count: number;
  readonly step: number;
}

export type Msg =
  { readonly _tag: 'Increment' } | { readonly _tag: 'StepChanged'; readonly step: number };

export const Stepper = define<State, Msg>('my-stepper', {
  init: () => ({ count: 0, step: 1 }),
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    StepChanged: ({ value }) => {
      const step = Number(value);
      // Not a whole number: ignore the keystroke, keep the last good step.
      return Number.isInteger(step) ? { _tag: 'StepChanged', step } : undefined;
    },
  },
  update: {
    Increment: (s) => ({ ...s, count: s.count + s.step }),
    StepChanged: (s, m) => ({ ...s, step: m.step }),
  },
  view: (s, i) => html`
    <label for="step">Step</label>
    <input id="step" type="number" value=${s.step} data-intent=${i.StepChanged} />
    <button type="button" data-intent=${i.Increment}>Add ${s.step}</button>
    <output aria-live="polite">${s.count}</output>
  `,
});
```

The model only ever sees a whole number. Parsing happens once, at the boundary, which is where
Gyral wants it.

## Test it

`update` is a plain function, so you can test behaviour without a browser. `@gyral/testing`
gives you `step` (one message) and `run` (a sequence):

```sh
npm install -D @gyral/testing vitest
```

```ts
// src/counter.test.ts
import { expect, it } from 'vitest';
import { run, step } from '@gyral/testing';
import { Counter } from './counter.js';

it('counts', () => {
  expect(step(Counter.spec, { count: 1 }, { _tag: 'Increment' }).state).toEqual({ count: 2 });

  const { state } = run(Counter.spec, [
    { _tag: 'Increment' },
    { _tag: 'Increment' },
    { _tag: 'Decrement' },
  ]);
  expect(state.count).toBe(1);
});
```

`Counter.spec` is the object you passed to `define()`. Tests that need the real element (clicks,
focus, rendering) run in a browser with [Vitest browser mode](https://vitest.dev/guide/browser/)
and `await settled()` before they look at the DOM; `@gyral/testing` also has helpers for server
rendering, hydration and virtual time. See [Testing](/docs/testing/).

## Next steps

- Learn the three parts in depth: [Intent](/docs/intent/), [Model and update](/docs/update/)
  and [Views](/docs/views/).
- Browse the [examples](/examples/): forms, HTTP, routing, shared state and server rendering.
- See a whole application in [gyral-shop](https://github.com/gyraljs/gyral-shop).
- Before you ship, read [Deploying](/docs/deploying/) and the
  [known issues](/docs/packages/#known-issues).
- Coming from Gyral 0.2? Read [Migrating from 0.2 to 0.3](/docs/migrating-0-2-to-0-3/). From
  0.3.0? Read [Migrating from 0.3.0 to 0.3.1](/docs/migrating-0-3-0-to-0-3-1/).
