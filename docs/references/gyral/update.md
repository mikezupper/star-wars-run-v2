---
title: Model and update
description: State as plain data, one pure reducer per message, commands returned as data, and the framework messages Gyral sends you.
section: Guides
order: 3
---

# Model and update

The **model** is your component's state. **Update** is how it changes: a record of reducers,
one per message tag, each a pure function from the current state and a message to the next
state. Nothing else changes state, so every change is visible to tests and to
[devtools](/docs/devtools/).

```ts
// src/todo.ts
import { define, each, html, intents } from '@gyral/core';

export interface Todo {
  readonly id: number;
  readonly text: string;
  readonly done: boolean;
}

export interface State {
  readonly todos: readonly Todo[];
  readonly nextId: number;
}

export type Msg =
  | { readonly _tag: 'Add'; readonly text: string }
  | { readonly _tag: 'Toggle'; readonly id: number }
  | { readonly _tag: 'ClearDone' };

const i = intents<Msg>();

const Item = (t: Todo) =>
  html`<li>
    <button type="button" value=${t.id} aria-pressed=${t.done} data-intent=${i.Toggle}>
      ${t.text}
    </button>
  </li>`;

export const TodoList = define<State, Msg>('my-todo-list', {
  init: () => ({ todos: [], nextId: 1 }),
  intent: {
    Add: ({ formData }) => {
      const text = formData?.get('text');
      return typeof text === 'string' && text.trim() !== ''
        ? { _tag: 'Add', text: text.trim() }
        : undefined;
    },
    Toggle: ({ value }) => ({ _tag: 'Toggle', id: Number(value) }),
    ClearDone: () => ({ _tag: 'ClearDone' }),
  },
  update: {
    Add: (s, m) => ({
      todos: [...s.todos, { id: s.nextId, text: m.text, done: false }],
      nextId: s.nextId + 1,
    }),
    Toggle: (s, m) => ({
      ...s,
      todos: s.todos.map((t) => (t.id === m.id ? { ...t, done: !t.done } : t)),
    }),
    ClearDone: (s) => ({ ...s, todos: s.todos.filter((t) => !t.done) }),
  },
  view: (s) => html`
    <form data-intent=${i.Add}>
      <label for="text">New todo</label>
      <input id="text" name="text" required />
      <button>Add</button>
    </form>
    <ul>
      ${each(s.todos, (t) => t.id, Item)}
    </ul>
    <button type="button" data-intent=${i.ClearDone}>Clear done</button>
  `,
});
```

## State is plain data

Keep state a record of JSON values: strings, numbers, booleans, `null`, arrays and plain
objects. No `Date`, `Map` or class instances. Three things depend on it:

- **Server rendering** writes each component's state into the page as JSON, and the browser
  resumes from it. A `Date` would come back as a string. In development, the server warns when
  a seed won't survive the trip.
- **Devtools** and tests can print and compare state.
- **Reducers return new objects.** State is never mutated, so "did it change?" is a reference
  check.

Model what can happen with unions rather than flags. `{ _tag: 'Loading' } | { _tag: 'Found';
repos } | { _tag: 'Failed'; message }` can't be loading and failed at once; two booleans can.

`i` here is `intents<Msg>()`: the same typed intent names the view receives, as a module
constant, so the list's `Item` row can name an intent and stay a pure function of its todo
([Lists](/docs/views/#lists)). `aria-pressed=${t.done}` writes `"true"` or `"false"`, the way
ARIA expects.

## One reducer per message

`update` is keyed by message tag, and its type requires a reducer for every tag in `Msg`. Add
a message and the compiler shows you every component that has to handle it.

A reducer receives the state, the message (narrowed to its variant, so `m.id` is typed) and the
context, `{ props, read }`: the component's [props](/docs/components/#props) and a reader for
[shared stores](/docs/stores/). Reducers are pure: no `fetch`, no `Date.now()`, no
`Math.random()`, no DOM.

## Returning commands

To do anything outside the model, a reducer returns a tuple: the next state and a list of
**commands**. A command is a description of a side effect, run by a driver. The answer comes
back as another message.

```ts
// src/clock.ts
import { define, html } from '@gyral/core';
import { periodic } from '@gyral/time';

export interface State {
  readonly running: boolean;
  readonly seconds: number;
}

export type Msg = { readonly _tag: 'Start' } | { readonly _tag: 'Tick'; readonly ticks: number };

export const Clock = define<State, Msg>('my-clock', {
  init: () => ({ running: false, seconds: 0 }),
  intent: { Start: () => ({ _tag: 'Start' }) },
  update: {
    // State plus a command: tick every second until the component disconnects.
    Start: (s) =>
      s.running
        ? s
        : [{ ...s, running: true }, [periodic(1000, (ticks): Msg => ({ _tag: 'Tick', ticks }))]],
    Tick: (s, m) => ({ ...s, seconds: m.ticks }),
  },
  view: (s, i) => html`
    <button type="button" data-intent=${i.Start} ?disabled=${s.running}>Start</button>
    <p><output>${s.seconds}</output> seconds</p>
  `,
});
```

The return type is `Next<State, Msg>`: either a state, or `[state, commands]`. State is never an
array, so the two can't be confused. `init` can return commands too, to start a subscription
or load data when the component appears. [Effects and drivers](/docs/effects/) covers commands
in depth.

## Framework messages

Gyral sends four messages of its own. Their reducers are optional: leave one out and the
message changes nothing.

| Message          | Sent when                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PropsChanged`   | A declared prop changed after the first render. Has `props` and `prev`. [Props](/docs/components/#reacting-to-prop-changes) |
| `IntentRejected` | Input failed a schema in `form()` or `field()`, or the server rejected a form. [Forms](/docs/forms/)                        |
| `StoreChanged`   | A store the component reads changed. [Shared state](/docs/stores/)                                                          |
| `Hydrated`       | The component is live in the browser, once, after its first render. Has `serverRendered`.                                   |

`Hydrated` is the hook for progressive enhancement: render the no-JavaScript version on the
server and in the first client render (so hydration matches), then switch to the enhanced UI
in the `Hydrated` reducer.

## Starting from messages

Every Gyral element has an `initialMessages` property. Messages listed there run through
`update` right after `init`, before the first render, on the server too. The server uses it to
render a form with the errors from a rejected submission through the component's own
`IntentRejected` reducer, so errors look the same with or without JavaScript.

## State in CSS and in transitions

Two optional spec fields read the model, so the model stays the one source of truth:

- **`states: (s) => ({ loading: s.results._tag === 'Loading' })`** mirrors boolean facts onto the
  element's [custom states](/docs/styling/#custom-states), for CSS:
  `:host(:state(loading))`.
- **`viewTransition: (prev, next, msg) => boolean`** renders a state change inside
  `document.startViewTransition`, for route changes and list reorders. It is skipped where the
  browser doesn't support it, or when the user prefers reduced motion.
