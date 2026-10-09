---
title: Components
description: How define() turns a spec into a custom element, and how components pass data to each other with props and outputs.
section: Guides
order: 1
---

# Components

A Gyral component is a standard custom element. You don't write a class: you describe the
component as data, and `define()` builds the element, a plain `HTMLElement` subclass. This page covers the parts of that
description, then how components talk to each other: **props down, outputs up**.

## Anatomy of define()

```ts
// src/greeter.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly name: string;
}

export type Msg = { readonly _tag: 'NameChanged'; readonly name: string };

export const Greeter = define<State, Msg>()('my-greeter', {
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

`define<State, Msg>()(tag, spec)` registers `<my-greeter>` and returns its class. It is two
calls: the first takes the types you write (state, messages, props, outputs), the second the
tag and spec, so TypeScript can still infer the intent names from the spec's `intent` keys. The
spec has four required parts and a few optional ones:

| Part      | What it is                                                                                                     | Guide                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `init`    | The starting state, computed from props. May also start commands.                                              | [Model and update](/docs/update/)                                                                     |
| `intent`  | Parsers that turn platform events into messages. Their keys are the component's intent names.                  | [Intent](/docs/intent/)                                                                               |
| `update`  | One pure reducer per message tag: state in, next state (and commands) out.                                     | [Model and update](/docs/update/)                                                                     |
| `view`    | A pure function from state to an `html` template that _names_ intents.                                         | [Views](/docs/views/)                                                                                 |
| `props`   | Inputs from the parent or from attributes, declared with `prop.*` builders.                                    | [below](#props)                                                                                       |
| `styles`  | Shadow-root CSS: `css` values or strings.                                                                      | [Styling](/docs/styling/)                                                                             |
| `stores`  | Shared state the component reads.                                                                              | [Shared state](/docs/stores/)                                                                         |
| `drivers` | Driver substitutions for this component's commands.                                                            | [Effects](/docs/effects/)                                                                             |
| `shadow`  | `false` renders into light DOM; `{ delegatesFocus: true }` passes focus to the first focusable element inside. | [Styling](/docs/styling/#light-dom-components), [Views](/docs/views/#focusing-into-a-child-component) |
| `hydrate` | When a server-rendered instance hydrates: `load`, `idle`, `visible`, `interaction`.                            | [Server rendering](/docs/server-rendering/)                                                           |

A few more optional fields cover rarer needs: `events` (event types a bound
`data-intent-on=${…}` can produce, see [Intent](/docs/intent/#trigger-events)), `states`
(custom states for CSS, see [Styling](/docs/styling/#custom-states)), `viewTransition` (render a
change inside a View Transition, see [Views](/docs/views/#view-transitions)) and `renderOnFrame`
(message tags from bursty sources, such as pointer moves, that render once per animation frame).

The type parameters are the contract. `State` is a plain data record (JSON, when the component
is [server-rendered](/docs/server-rendering/#hydration-and-the-client-entry)), `Msg` a union of tagged objects, and TypeScript checks that `update` has a reducer for every tag and that the view
only names intents that exist.

`define()` returns the element class. Its `spec` property is the object you passed in, which is
how [tests](/docs/testing/) run `update` without a DOM.

## Props

Props are the component's inputs. Declare each one with a `prop` builder. A builder says how
an attribute's string becomes a value, and a prop whose type can't be `undefined` must say how a
value is guaranteed: `required` or `default`.

```ts
// src/badge.ts
import { define, html, prop, type Stateless } from '@gyral/core';

export interface Props {
  readonly label: string;
  readonly count: number;
  readonly note: string | undefined;
}

export const Badge = define<Stateless, never, Props>()('my-badge', {
  props: {
    label: prop.string({ required: true }),
    count: prop.number({ default: 0 }),
    note: prop.string(),
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
- **`default`** is used whenever the element's own value is missing.
- A component with no state of its own uses `Stateless` and can leave out `init`.
- Don't name a prop after a built-in element property such as `hidden`, `title` or `id`. It is
  an error in development, because the prop would replace the platform's behaviour.

### Builders and attributes

| Builder                     | The attribute is parsed with           | Attribute name         |
| --------------------------- | -------------------------------------- | ---------------------- |
| `prop.string(opts?)`        | nothing: the string as is              | kebab-case of the prop |
| `prop.number(opts?)`        | `Number(v)`; empty or `NaN` is invalid | kebab-case             |
| `prop.boolean(opts?)`       | present is `true`, absent is `false`   | kebab-case             |
| `prop.json(schema, opts?)`  | `JSON.parse`, then the schema          | kebab-case             |
| `prop.value(schema, opts?)` | no attribute: set it as a property     | none                   |

A prop named `maxValue` reads the attribute `max-value`; pass `attribute: 'name'` to choose
another, or `attribute: false` for a property only. The options are `required`, `default`,
`attribute` and `schema`, and `equals` for `prop.json` and `prop.value`
([below](#when-a-prop-counts-as-changed)).

The schemas are [Standard Schema](https://standardschema.dev), so any library that implements it
works: valibot, zod, ArkType. `string`, `number` and `boolean` carry tiny built-in schemas, so
simple props need no library; pass `schema` to narrow one, such as
`prop.string({ schema: v.picklist(['asc', 'desc']), default: 'asc' })`.

Attributes are strings from outside your code, so they are **always validated**. An invalid
value is logged with the tag, the prop and the schema's issues, then treated as missing, so its
`default` applies. Property sets come from typed code and are validated in development only.
Props never write attributes back; state that CSS needs goes through
[custom states](/docs/styling/#custom-states).

### Objects, type guards and identity

Objects and arrays travel as properties, declared with `prop.value`. Its check can be a
Standard Schema or a plain type guard:

```ts
// src/seat-picker.ts
import * as v from 'valibot';
import { define, html, prop, type PropsOf, type Stateless } from '@gyral/core';

export interface Seat {
  readonly row: number;
  readonly label: string;
}

/** A type guard: the simplest check for a property. */
const isSeat = (u: unknown): u is Seat =>
  typeof u === 'object' &&
  u !== null &&
  'row' in u &&
  typeof u.row === 'number' &&
  'label' in u &&
  typeof u.label === 'string';

/** Declared once and passed by name, so production builds can leave it out. */
const Seats = v.array(v.object({ row: v.number(), label: v.string() }));

const props = {
  seats: prop.value(Seats, { default: [] }),
  chosen: prop.value(isSeat),
  /** `null` means "nobody"; leaving it unset means the default. */
  holder: prop.value(v.nullable(v.string()), { default: 'Box office' }),
};

export const SeatPicker = define<Stateless, never, PropsOf<typeof props>>()('my-seat-picker', {
  props,
  intent: {},
  update: {},
  view: (_s, _i, { props: p }) => html`
    <p>${p.seats.length} seats, held by ${p.holder ?? 'nobody'}</p>
    ${p.chosen === undefined ? '' : html`<p>Chosen: ${p.chosen.label}</p>`}
  `,
});
```

- **A type guard** `(u: unknown) => u is T` works in `prop.value()` and `prop.json()`, and the
  prop's type is its `T`. A guard that returns `false` is reported like a schema issue, with the
  guard's name.
- **A property keeps the object it was given**: after `el.seats = seats`, `el.seats === seats`.
  Development checks the value and keeps the input, not the schema's output; production skips
  the check. So a schema for a property should **check, not decode**: turning strings into
  `Date`s, filling in defaults or stripping keys would happen only to attributes, whose value is
  the parse's output.
- **Declare a schema once and pass it by name.** Production client builds never run a
  `prop.value` check, and the Vite preset removes it when it is a name (`prop.value(Seats)`,
  `schemas.seat`) or an inline function, so the schema's code can leave the bundle. A call
  written in place, such as `prop.value(v.array(Seat))`, stays, because evaluating it could have
  effects. `prop.json` keeps its check: attributes are always parsed.
- **Whether the schema really leaves is up to the bundler.** Vite 8.3 (Rolldown) keeps schema
  code in a lazily loaded chunk once the schema library sits in a chunk shared with the entry,
  even when its builders are marked free of side effects. So the saving shows in single-chunk
  builds, and for schemas whose library isn't shared across chunks.
- **`null` for an explicit "nobody".** A `default` replaces only `undefined`: setting a prop to
  `undefined`, or removing its attribute, brings the default back. Make the schema nullable and
  pass `.holder=${null}` (or the attribute `holder="null"` with `prop.json`).

### When a prop counts as changed

A write whose value equals the old one changes nothing: no render, no `PropsChanged`. That
holds for property sets and attribute changes alike, so a parent may write the same value on
every render without making the child do any work.

| Builder                       | Equal when                                                 |
| ----------------------------- | ---------------------------------------------------------- |
| `string`, `number`, `boolean` | `Object.is(old, new)`                                      |
| `json`                        | `JSON.stringify` gives the same text (it is JSON data)     |
| `value`                       | `Object.is(old, new)`, or what its `equals` option returns |

So a parent can bind a fresh object on every render, `.range=${{ min: s.min, max: s.max }}`, to
a `prop.json` prop: the same JSON is the same value. Keys in a different order only cost an
extra render. `prop.value` holds anything, class instances and DOM nodes included, so it keeps
identity unless you say what "the same" means. `equals` receives the old and the new value,
`undefined` when unset, and `prop.json` takes it too:

```ts
// src/results-table.ts
import { define, html, prop, type PropsOf, type Stateless } from '@gyral/core';

export interface Sort {
  readonly key: string;
  readonly dir: 'asc' | 'desc';
}

const isSort = (u: unknown): u is Sort =>
  typeof u === 'object' &&
  u !== null &&
  'key' in u &&
  typeof u.key === 'string' &&
  'dir' in u &&
  (u.dir === 'asc' || u.dir === 'desc');

const isRange = (u: unknown): u is { readonly min: number; readonly max: number } =>
  typeof u === 'object' &&
  u !== null &&
  'min' in u &&
  typeof u.min === 'number' &&
  'max' in u &&
  typeof u.max === 'number';

const sortLabel = (sort: Sort): string =>
  `Sorted by ${sort.key}, ${sort.dir === 'asc' ? 'ascending' : 'descending'}`;

const props = {
  /** Compared by JSON text: a fresh but equal object changes nothing. */
  range: prop.json(isRange, { default: { min: 0, max: 100 } }),
  /** Compared field by field, instead of by identity. */
  sort: prop.value(isSort, { equals: (a, b) => a?.key === b?.key && a?.dir === b?.dir }),
};

export const ResultsTable = define<Stateless, never, PropsOf<typeof props>>()('my-results-table', {
  props,
  intent: {},
  update: {},
  view: (_s, _i, { props: p }) => html`
    <p>Prices ${p.range.min} to ${p.range.max}</p>
    ${p.sort === undefined ? '' : html`<p>${sortLabel(p.sort)}</p>`}
  `,
});
```

When no `equals` fits, keep bound objects stable in the parent instead: build them in a reducer,
so they live in state, rather than in the view, so an unchanged object is the same object.

### Reacting to prop changes

When a declared prop changes after the first render, the component receives the framework
message `PropsChanged`, with the new and previous props (a write of an [equal
value](#when-a-prop-counts-as-changed) sends nothing). Its reducer is optional. It is the only
way props enter state, so "reset when the user changes" is explicit:

```ts
// src/user-notes.ts
import { define, html, prop } from '@gyral/core';

export interface State {
  readonly draft: string;
}

export type Msg = { readonly _tag: 'Typed'; readonly text: string };

export const UserNotes = define<State, Msg, { readonly userId: string }>()('my-user-notes', {
  props: { userId: prop.string({ required: true }) },
  init: () => ({ draft: '' }),
  intent: { Typed: ({ value }) => ({ _tag: 'Typed', text: value ?? '' }) },
  update: {
    Typed: (s, m) => ({ ...s, draft: m.text }),
    // A different user: start a fresh draft.
    PropsChanged: (s, m) => (m.props.userId === m.prev.userId ? s : { draft: '' }),
  },
  view: (s, i, { props }) => html`
    <label for="notes">Note about ${props.userId}</label>
    <input id="notes" data-intent=${i.Typed} value=${s.draft} />
  `,
});
```

Like any reducer, the `PropsChanged` reducer may return commands, for example to load data for
the new user.

## Child components and outputs

A parent sets a child's props in its view, as attributes (`step="5"`) or as properties
(`.step=${5}`, the way objects and arrays travel), and listens to the child's **outputs**. A
child reports up by returning `emit(output)` from a reducer. `emit` is a command like any
other, so the child stays pure and testable. Build it with `outputs<Out>()`, a module constant
like `intentsOf<typeof Component>()`: it is the same `emit`, typed by the output union, so an output of the
wrong shape fails to compile in the child.

```ts
// src/stepper.ts
import { define, html, outputs, prop, type Stateless } from '@gyral/core';

/** What the stepper tells its parent. */
export type StepperOutput = { readonly _tag: 'Stepped'; readonly by: number };

const emit = outputs<StepperOutput>();

type Msg = { readonly _tag: 'Step'; readonly by: number };

export const Stepper = define<Stateless, Msg, { readonly step: number }, StepperOutput>()(
  'my-stepper',
  {
    props: { step: prop.number({ default: 1 }) },
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

export const Total = define<State, Msg>()('my-total', {
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
- Leave the mapper's return type off, as above. Annotating it with the whole union,
  `(out): Msg => …`, fails with a long `IntentParser<…>` error, because each intent produces its
  own variant (see [Intent](/docs/intent/#typing-parsers)).
- The mapper also receives the child element, typed with its props, which is how an item in a
  list says which item it is: `child(Item, (out, el) => ({ _tag: 'Item', id: el.itemId, out }))`.
- For lists, render children with `each(items, key, row)`. Keys keep each child, and its state,
  attached to its item when the list reorders (see [Views](/docs/views/#lists)).
- A component that contains itself (a folder tree) passes a function, `child(() => Folder, …)`,
  so the class can refer to itself.

Shadow DOM does the isolating, and `each` does the list.

### Outputs and other code

A parent that isn't a Gyral component, such as page script or an element from another library,
hears a Gyral child's outputs as events. `OUTPUT_EVENT` (`'gyral-output'`) names the event, its
`detail` is the output, and `OutputEvent<OutputsOf<typeof Child>>` types it:

```ts
// src/reviews.ts
import { OUTPUT_EVENT, type OutputEvent, type OutputsOf } from '@gyral/core';
import { Stepper } from './stepper.js';

// Listen on the child or on an ancestor in the same tree.
document.querySelector('#reviews')?.addEventListener(OUTPUT_EVENT, (event) => {
  const { detail } = event as OutputEvent<OutputsOf<typeof Stepper>>;
  console.log(`Stepped by ${String(detail.by)}`, event.target);
});
```

The event bubbles but isn't composed, so it stays in the tree the child sits in. The other
direction works too: any custom element talks to a Gyral parent by dispatching
`new CustomEvent(OUTPUT_EVENT, { detail: { _tag: 'Picked' }, bubbles: true })` on itself, so
children don't have to be Gyral components. [Using Gyral in other
frameworks](/docs/other-frameworks/#outputs-the-gyral-output-event) has recipes.

## Escape hatches

- **`el.send(msg)`** feeds a message into a component from imperative code (a canvas, an
  observer). Prefer intents and drivers where you can.
- **Any custom element.** Gyral components are plain custom elements, and any other custom
  element works alongside them, whether you wrote it by hand or with another library (see
  [Using third-party web components](/docs/third-party-components/)). Gyral adds a loop, not a
  walled garden.
