---
title: Components
description: How define() turns a spec into a custom element, and how components pass data to each other with props and outputs.
section: Guides
order: 1
---

# Components

A Gyral component is a standard custom element. You don't write a class: you describe the
component as data, and `define()` builds the element. This page covers the parts of that
description, then how components talk to each other: **props down, outputs up**.

## Anatomy of define()

```ts
// src/greeter.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly name: string;
}

export type Msg = { readonly _tag: 'NameChanged'; readonly name: string };

export const Greeter = define<State, Msg>('my-greeter', {
  init: () => ({ name: '' }),
  intent: {
    NameChanged: ({ value }) => ({ _tag: 'NameChanged', name: value ?? '' }),
  },
  update: {
    NameChanged: (s, m) => ({ ...s, name: m.name.trim() }),
  },
  view: (s, i) => html`
    <label for="name">Your name</label>
    <input id="name" autocomplete="given-name" data-intent=${i.NameChanged} />
    <p>${s.name === '' ? 'Hello!' : `Hello, ${s.name}!`}</p>
  `,
});
```

`define<State, Msg>(tag, spec)` registers `<my-greeter>` and returns its class. The spec has
four required parts and a few optional ones:

| Part      | What it is                                                                          | Guide                                          |
| --------- | ----------------------------------------------------------------------------------- | ---------------------------------------------- |
| `init`    | The starting state, computed from props. May also start commands.                   | [Model and update](/docs/update/)              |
| `intent`  | Parsers that turn platform events into messages, keyed by message tag.              | [Intent](/docs/intent/)                        |
| `update`  | One pure reducer per message tag: state in, next state (and commands) out.          | [Model and update](/docs/update/)              |
| `view`    | A pure function from state to a Lit template that _names_ intents.                  | [Views](/docs/views/)                          |
| `props`   | Inputs from the parent or from attributes.                                          | [below](#props)                                |
| `styles`  | Shadow-root CSS.                                                                    | [Styling](/docs/styling/)                      |
| `stores`  | Shared state the component reads.                                                   | [Shared state](/docs/stores/)                  |
| `drivers` | Driver substitutions for this component's commands.                                 | [Effects](/docs/effects/)                      |
| `shadow`  | `false` renders into light DOM, for page-level components.                          | [Styling](/docs/styling/#light-dom-components) |
| `hydrate` | When a server-rendered instance hydrates: `load`, `idle`, `visible`, `interaction`. | [Server rendering](/docs/server-rendering/)    |

The type parameters are the contract. `State` is a plain JSON record, `Msg` a union of tagged
objects, and TypeScript checks that `update` has a reducer for every tag and that the view
only names intents that exist.

`define()` returns the element class. Its `spec` property is the object you passed in, which is
how [tests](/docs/testing/) run `update` without a DOM.

## Props

Props are the component's inputs. Declare them with Lit's property options, plus Gyral's rule
that a prop which can't be `undefined` must say how a value is guaranteed: `required` or
`default`.

```ts
// src/badge.ts
import { define, html, type Stateless } from '@gyral/core';

export interface Props {
  readonly label: string;
  readonly count: number;
  readonly note?: string;
}

export const Badge = define<Stateless, never, Props>('my-badge', {
  props: {
    label: { type: String, required: true },
    count: { type: Number, default: 0 },
    note: { type: String },
  },
  intent: {},
  update: {},
  view: (_s, _i, { props }) => html`
    <span>${props.label}: <data value=${props.count}>${props.count}</data></span>
    ${props.note === undefined ? '' : html`<small>${props.note}</small>`}
  `,
});
```

- **Read props as context.** Every reducer and the view get `{ props }` as their last argument.
  Don't copy props into state just to read them.
- **`required: true`** is a promise from the parent. A missing value logs one warning per
  instance at first render.
- **`default`** is used whenever the element's own value is `undefined`.
- A component with no state of its own uses `Stateless` and can leave out `init`.
- Don't name a prop after a built-in element property such as `hidden`, `title` or `id`:
  `define()` warns, because the prop would replace the platform's behaviour.

### Reacting to prop changes

When a declared prop changes after the first render, the component receives the framework
message `PropsChanged`, with the new and previous props. Its reducer is optional. It is the only
way props enter state, so "reset when the user changes" is explicit:

```ts
// src/user-notes.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly draft: string;
}

export type Msg = { readonly _tag: 'Typed'; readonly text: string };

export const UserNotes = define<State, Msg, { readonly userId: string }>('my-user-notes', {
  props: { userId: { type: String, required: true } },
  init: () => ({ draft: '' }),
  intent: { Typed: ({ value }) => ({ _tag: 'Typed', text: value ?? '' }) },
  update: {
    Typed: (s, m) => ({ ...s, draft: m.text }),
    // A different user: start a fresh draft.
    PropsChanged: (s, m) => (m.props.userId === m.prev.userId ? s : { draft: '' }),
  },
  view: (s, i, { props }) => html`
    <label for="notes">Note about ${props.userId}</label>
    <input id="notes" data-intent=${i.Typed} .value=${s.draft} />
  `,
});
```

Like any reducer, the `PropsChanged` reducer may return commands, for example to load data for
the new user.

## Child components and outputs

A parent sets a child's props in its view (`.value=${…}` for properties) and listens to the
child's **outputs**. A child reports up by returning `emit(output)` from a reducer. `emit` is a
command like any other, so the child stays pure and testable.

```ts
// src/stepper.ts
import { define, emit, html, type Stateless } from '@gyral/core';

/** What the stepper tells its parent. */
export type StepperOutput = { readonly _tag: 'Stepped'; readonly by: number };

type Msg = { readonly _tag: 'Step'; readonly by: number };

export const Stepper = define<Stateless, Msg, { readonly step: number }, StepperOutput>(
  'my-stepper',
  {
    props: { step: { type: Number, default: 1 } },
    intent: {
      Step: ({ value }) => ({ _tag: 'Step', by: Number(value) }),
    },
    update: {
      Step: (s, m, { props }) => [s, [emit({ _tag: 'Stepped', by: m.by * props.step })]],
    },
    view: (_s, i, { props }) => html`
      <button type="button" value="-1" data-intent=${i.Step}>−${props.step}</button>
      <button type="button" value="1" data-intent=${i.Step}>+${props.step}</button>
    `,
  },
);
```

The fourth type parameter is the output union. The parent parses outputs as intents, with
`child()`, which types the output by the child class:

```ts
// src/total.ts
import { child, define, html } from '@gyral/core';
import { Stepper } from './stepper.js';

export interface State {
  readonly total: number;
}

export type Msg = { readonly _tag: 'Add'; readonly by: number };

export const Total = define<State, Msg>('my-total', {
  init: () => ({ total: 0 }),
  intent: {
    Add: child(Stepper, (out) => ({ _tag: 'Add', by: out.by })),
  },
  update: {
    Add: (s, m) => ({ total: s.total + m.by }),
  },
  view: (s, i) => html`
    <my-stepper .step=${5} data-intent=${i.Add}></my-stepper>
    <p>Total: <output>${s.total}</output></p>
  `,
});
```

- Outputs are delivered as a `gyral-output` event from the child's host. It doesn't cross the
  parent's shadow root, so a grandchild's outputs never reach the grandparent.
- The mapper also receives the child element, typed with its props, which is how an item in a
  list says which item it is: `child(Item, (out, el) => ({ _tag: 'Item', id: el.itemId, out }))`.
- For lists, render children with `repeat(items, key, template)`. Keys keep each child, and its
  state, attached to its item when the list reorders.
- A component that contains itself (a folder tree) passes a function, `child(() => Folder, …)`,
  so the class can refer to itself.
- Any custom element can talk to a Gyral parent by dispatching `gyral-output` with a tagged
  `detail`, so children don't have to be Gyral components.

This replaces Cycle.js's `isolate()` and collections: Shadow DOM does the isolating, and Lit's
`repeat` does the list.

## Escape hatches

- **`el.send(msg)`** feeds a message into a component from imperative code (a canvas, an
  observer). Prefer intents and drivers where you can.
- **Raw Lit.** Every Gyral component is a `LitElement`, and plain `LitElement` classes work
  alongside them. Gyral adds a loop, not a walled garden.
