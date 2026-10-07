---
title: Coming from Cycle.js
description: What Gyral keeps from Cycle.js, what it changes and why, the counter side by side, and how Cycle.js concepts map to Gyral.
section: Background
order: 1
---

# Coming from Cycle.js

Gyral is inspired by [Cycle.js](https://cycle.js.org), by André Staltz and the Cycle.js core
team. If you know Cycle.js, most of Gyral's ideas will be familiar. What's new is what they're
built on: custom elements, Shadow DOM, a small template layer of its own and plain messages
instead of streams.

## What stays: the loop and effects as data

- **Your app is pure.** In Cycle.js, `main(sources)` returns sinks; drivers do the side
  effects. In Gyral, `update` and `view` are pure and drivers run commands. Both can be tested
  without a DOM.
- **Model-View-Intent.** The same three parts, kept separate.
- **Effects as data.** A request is a description, not a call.
- **Fractal components.** Every component is a small app with the same shape as the whole.
- **Deterministic async tests.** Cycle's `@cycle/time` had virtual time; `@gyral/testing` has
  `virtualTime()`.

## What changes: no streams, parsed intent, the platform

| Cycle.js                                | What hurt                                      | Gyral                                         |
| --------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| Streams for everything                  | A steep learning curve; events and state mixed | Messages and reducers                         |
| xstream, RxJS and most.js adapters      | Three times the API surface                    | No stream library                             |
| `DOM.select('.cls').events('click')`    | Stringly typed, fragile, heavy delegation code | Typed `data-intent` names, parsed intents     |
| `isolate()` scopes                      | The most complex part of the codebase          | Shadow DOM                                    |
| Snabbdom virtual DOM                    | Diffing on every render                        | Templates that update only changed parts      |
| Sink proxies in `run()`                 | Circular wiring that was hard to follow        | Each element owns its loop                    |
| `@cycle/state` lenses, `makeCollection` | Awkward lists                                  | Child elements and `each()`                   |
| `@cycle/html`                           | Little server-rendering story                  | Declarative Shadow DOM that hydrates in place |
| Cycle-only components                   | No interop                                     | Standard custom elements                      |

## Side by side: the counter

Cycle.js, from its examples:

```js
function main(sources) {
  const action$ = xs.merge(
    sources.DOM.select('.decrement')
      .events('click')
      .map((ev) => -1),
    sources.DOM.select('.increment')
      .events('click')
      .map((ev) => +1),
  );
  const count$ = action$.fold((acc, x) => acc + x, 0);
  const vdom$ = count$.map((count) =>
    div([
      button('.decrement', 'Decrement'),
      button('.increment', 'Increment'),
      p('Counter: ' + count),
    ]),
  );
  return { DOM: vdom$ };
}

run(main, { DOM: makeDOMDriver('#main-container') });
```

Gyral:

```ts
// src/counter.ts
import { define, html } from '@gyral/core';

type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Decrement' };

export const Counter = define<{ readonly count: number }, Msg>('my-counter', {
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
    <button type="button" data-intent=${i.Increment}>Increment</button>
    <p>Counter: <output>${s.count}</output></p>
  `,
});
```

The differences, line by line:

- `select('.decrement').events('click').map(ev => -1)` becomes a named intent. The view says
  which button means what with `data-intent=${i.Decrement}`; a typo is a compile error, not a
  silent no-op.
- `action$.fold(…)` becomes `update`: one reducer per message, exhaustive by type.
- `count$.map(count => div(…))` becomes `view`: the same idea, written as HTML.
- `run(main, { DOM: makeDOMDriver('#main-container') })` disappears. `<my-counter>` is a custom
  element; put it in any page, under any framework.

## Mapping Cycle.js concepts

| Cycle.js                                 | Gyral                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `main(sources) → sinks`                  | `define(tag, { init, intent, update, view })`                                         |
| `sources.DOM.select(…).events(…)`        | `data-intent` in the view, a parser in `intent`                                       |
| `fold` / reducer streams                 | `update`, one reducer per message                                                     |
| The DOM sink                             | `view`                                                                                |
| Driver sinks (`HTTP`, `history`)         | [Commands](/docs/effects/) returned from `update`                                     |
| `HTTP.select('category')`                | `onSuccess` / `onFailure` mappers on the command                                      |
| `flatMapLatest`, `switchMap`, `debounce` | Concurrency lanes: `switch`, `exhaust`, `queue`, `merge`; `debounce()`                |
| `isolate(Component)`                     | Shadow DOM, automatically                                                             |
| Props stream into a child                | [Props](/docs/components/#props) and `PropsChanged`                                   |
| Child sinks merged into the parent       | [Outputs](/docs/components/#child-components-and-outputs) with `emit()` and `child()` |
| `makeCollection`                         | `each(items, key, row)` with child elements                                           |
| `@cycle/state`                           | Component state, plus [stores](/docs/stores/) for shared state                        |
| `@cycle/history`                         | [`@gyral/router`](/docs/routing/)                                                     |
| `@cycle/time`                            | `@gyral/time`, and `virtualTime()` in tests                                           |
| `@cycle/html`                            | [`@gyral/ssr`](/docs/server-rendering/)                                               |
| `mockDOMSource`                          | `step()`, `run()` and fake drivers in [`@gyral/testing`](/docs/testing/)              |

## The examples, ported

Gyral's acceptance suite is a port of the Cycle.js examples: hello world, the counter, the BMI
calculators, HTTP search, autocomplete, routing, nested folders, the isomorphic app and more.
Comparing an example in each is the fastest way to see the mapping in practice. See the
[examples](/examples/).

Gyral is a new implementation. Where ideas, APIs or example programs are adapted from Cycle.js,
the `NOTICE` file in Gyral's repository credits them under Cycle.js's MIT licence.
