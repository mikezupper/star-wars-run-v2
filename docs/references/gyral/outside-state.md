---
title: State Gyral doesn't own
description: Read signals, Redux-style stores, XState actors and WebSocket feeds with subscription(), write to them with plain drivers, and test both.
useWhen: reading state Gyral does not own (signals, Redux, XState, a socket) with subscription(), or running long-lived work
section: Guides
order: 9
---

# State Gyral doesn't own

Sometimes the source of truth lives outside Gyral: a TC39 signals store, a Redux or Zustand
store, an XState actor, a WebSocket feed. Components reach it the way they reach any other
effect, through drivers. **Reading is a subscription**, a streaming driver the component lists
in its `subscriptions`; **writing is a plain command** whose driver calls the source. State that only
Gyral components use belongs in a [store](/docs/stores/) instead.

```ts
// src/outside-counter.ts
import { command, define, defineDriver, html, subscription, type Command } from '@gyral/core';

/** What a Redux-style store offers (Redux's own Store type fits as is). */
interface CounterStore {
  getState(): number;
  subscribe(listener: () => void): () => void;
  dispatch(action: { readonly type: 'added'; readonly by: number }): void;
}
declare const counterStore: CounterStore;

/** Reading: the current value now, then every change, until the component goes away. */
const counter = subscription<number>('counter', (emit) => {
  emit(counterStore.getState());
  return counterStore.subscribe(() => {
    emit(counterStore.getState());
  });
});

/** Writing: a plain driver. The change comes back through the subscription. */
const addToCounter = defineDriver<number, void>({
  name: 'counter-add',
  run: (by) => {
    counterStore.dispatch({ type: 'added', by });
  },
});

type Msg = { readonly _tag: 'Counted'; readonly n: number } | { readonly _tag: 'Add' };

const watchCounter = (): Command<Msg> =>
  command(counter, undefined, { onSuccess: (n): Msg => ({ _tag: 'Counted', n }) });

export const OutsideCounter = define<{ readonly n: number }, Msg>()('my-outside-counter', {
  init: () => ({ n: 0 }),
  // Running while the component is on the page; released when it's removed.
  subscriptions: () => [watchCounter()],
  intent: { Add: true },
  update: {
    Counted: (_s, m) => ({ n: m.n }),
    // A write answers nothing: the new value comes back through the subscription.
    Add: (s) => [s, [command(addToCounter, 1)]],
  },
  view: (s, i) => html`
    <p>Count: <output>${s.n}</output></p>
    <button type="button" data-intent=${i.Add}>Add one</button>
  `,
});
```

## subscription()

`subscription(name, subscribe, options?)` from `@gyral/core` builds a
[streaming driver](/docs/effects/#streaming-results-with-emit) for a source Gyral doesn't own.
Given a [driver token](/docs/effects/#drivers-the-app-provides) instead of a name,
`subscription(token, subscribe, options?)` takes the token's name and types, so `emit` and the
input are checked against them ([below](#a-store-per-page-provided-by-a-token)).

- **`subscribe(emit, { input, signal, fail })`** starts listening, may `emit` the current value
  at once, and returns how to stop: a function, or an object with `unsubscribe()` (RxJS,
  XState's `actor.subscribe(…)`).
- **Each value goes through the command's `onSuccess`**, like any streaming driver's.
- **The source is released for you**, once, when the command is switched away, when the
  component is removed from the page, and after `fail(error)`. Values emitted after that are
  ignored. Moving the component doesn't release it (see
  [Moves and reconnects](#moves-and-reconnects)).
- **List it in `subscriptions(state, props)`**: Gyral starts it, restarts it when its input
  changes, and stops it when the list no longer has it ([Subscriptions](/docs/update/#subscriptions)).
  Give each input its own `key` when one component keeps several, such as one per chat room.
- **`fail(error)` ends it with an error.** `onFailure` gets it (through the driver's `toError`
  if given), after any retries: wrap the subscription in `retry(…)`, which subscribes again, for a socket
  that reconnects. A
  `subscribe` that throws fails the same way.
- **Writes are plain commands**, like `addToCounter` above. The change comes back through the
  subscription, not through the write's `onSuccess`.
- **Every value reaches the component unless you say otherwise.** In `options`, `select` maps
  each value first (a slice of a store's state), `equals` drops a value equal to the last one
  delivered (`equals: Object.is` for a store that hands out the same object when nothing
  changed), and `coalesce: 'microtask'` or `'frame'` delivers only the latest value per
  microtask or animation frame. For a token `count = defineDriver<undefined, number>('count')`,
  `subscription(count, (emit) => store.subscribe(() => emit(store.getState())), { select: (s) => s.count, equals: Object.is })`
  delivers the store's `count` only when it changes.

For many values per frame (market data, sensors) into a view that takes real work to render,
`coalesce: 'frame'` delivers only the latest one per animation frame. When the reducers need
every value, list the message in the component's `renderOnFrame` instead: each message still
reaches `update`, and the component renders once per frame.

## Moves and reconnects

Keyed-list libraries and plain DOM code move an element by removing it and inserting it again
(`appendChild`, `insertBefore`) in the same task. Gyral treats that as a move, so a component's
subscriptions, timers and requests keep running:

- **A move** (removed and inserted again in one task, including before the first render):
  nothing stops.
- **A real removal**: one microtask after the element leaves the page, its commands stop and
  every subscription is released.
- **Attached again after a real removal**: `subscriptions(state, props)` runs again, so
  everything it lists starts from the current state. Nothing else is needed.

```ts
// src/unread-badge.ts
import { command, define, html, subscription } from '@gyral/core';

declare const unread: { get(): number; subscribe(listener: () => void): () => void };

const unreadSource = subscription<number>('unread', (emit) => {
  emit(unread.get());
  return unread.subscribe(() => emit(unread.get()));
});

type Msg = { readonly _tag: 'Count'; readonly n: number };

export const UnreadBadge = define<number, Msg>()('unread-badge', {
  init: () => 0,
  // Moved: keeps running. Removed: released. Attached again: subscribed again.
  subscriptions: () => [
    command(unreadSource, undefined, { onSuccess: (n): Msg => ({ _tag: 'Count', n }) }),
  ],
  update: { Count: (_n, m) => m.n },
  view: (n) => html`<span class="badge">${n}</span>`,
});
```

`moveBefore()` keeps everything too, without even the disconnect.

## A store per page, provided by a token

When each page, or each test, creates its own store, build the commands with a
[driver token](/docs/effects/#drivers-the-app-provides) and provide the subscription above the
components. Drivers are [looked up by name](/docs/effects/#substituting-drivers), nearest first,
and a command whose token nothing provides is reported as [G0043](/errors/#G0043), naming the
driver and the component:

```ts
// src/table.ts
import { defineDriver, provideDrivers, subscription } from '@gyral/core';

export interface Table {
  readonly moves: number;
}

interface TableStore {
  getState(): Table;
  subscribe(listener: () => void): () => void;
}

/** Commands are built with this token; each page provides the subscription behind it. */
export const table = defineDriver<undefined, Table>('table');

/** Gives every component under `element` this page's store; returns how to undo it. */
export const provideTable = (element: Element, store: TableStore): (() => void) =>
  provideDrivers(element, [
    subscription(table, (emit) => {
      emit(store.getState());
      return store.subscribe(() => {
        emit(store.getState());
      });
    }),
  ]);
```

## TC39 signals

When an app keeps its state in signals, a subscription can stream it into components. This
recipe uses the [`signal-polyfill`](https://github.com/proposal-signals/signal-polyfill)
package. A `Watcher`'s notification may not read signals, so it re-arms and reads in a
microtask:

```ts
import { Signal } from 'signal-polyfill';
import { subscription } from '@gyral/core';

/** Streams read() now and after every change to the signals it reads. */
export const watchSignals = <T>(name: string, read: () => T) =>
  subscription<T>(name, (emit, { signal }) => {
    const current = new Signal.Computed(read);
    const watcher = new Signal.subtle.Watcher(() => {
      queueMicrotask(() => {
        if (signal.aborted) return;
        watcher.watch(); // re-arm
        emit(current.get());
      });
    });
    watcher.watch(current);
    emit(current.get());
    return () => watcher.unwatch(current);
  });

// const board = watchSignals('board', () => ({ tasks: store.tasks.get(), filter: store.filter.get() }));
```

Have `read` return plain data, a snapshot object, not the signals themselves.

## A WebSocket feed

```ts
// src/feed.ts
import { command, retry, subscription, type Command } from '@gyral/core';

/** Text messages from `url` until the component goes away; reconnects twice on failure. */
export const feed = retry(
  subscription<string, string>('feed', (emit, { input: url, fail }) => {
    const socket = new WebSocket(url);
    socket.addEventListener('message', (e: MessageEvent<unknown>) => {
      if (typeof e.data === 'string') emit(e.data);
    });
    socket.addEventListener('close', (e) => {
      if (!e.wasClean) fail(new Error(`${url} closed (${String(e.code)})`));
    });
    return () => {
      socket.close();
    };
  }),
  { times: 2, delayMs: 1000, backoff: 'exponential' },
);

export const listenTo = <M>(url: string, toMsg: (line: string) => M): Command<M> =>
  command(feed, url, { onSuccess: toMsg, key: `feed:${url}` });
```

To send on the same socket, keep the connection in one module and give it a plain driver for
writes (`run: (text) => { socket.send(text); }`).

## Testing

- **Use the real source**: create the store in the test, provide its driver
  (`provideTable(container, store)` above, `mount(Component, { drivers: [subscription(table, …)] })`
  from `@gyral/testing`, or `el.drivers`), change the store, then `await settled()`. `settled()` doesn't wait for a subscription to end (it never
  does), but it waits for values already on their way, such as a store that notifies in a
  microtask or a watcher that re-arms in one. No `await Promise.resolve()` loops.
- **Or fake it**: `fakeDriver('counter')` records the subscription, and `emitNext(value)` pushes
  a value through it.
- **Releasing takes one microtask**: after `el.remove(); await Promise.resolve();`, a real
  subscription's unsubscribe has run and a fake's `calls[0].signal.aborted` is `true` (see
  [Testing](/docs/testing/#fake-drivers-and-commands)). To test a move, `append` the element
  somewhere else in the same task and check that the signal is still not aborted.
