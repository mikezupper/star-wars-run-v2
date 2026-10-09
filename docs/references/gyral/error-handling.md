---
title: Error handling
description: How Gyral reports each failure once, lets a parent catch a child's failure, shows a component's fallback and keeps a server-rendered page going.
section: Guides
order: 7.5
---

# Error handling

Code fails: a reducer reads a field that isn't there, a view meets data it didn't expect, a
driver's server is down. Gyral catches every failure in a component, wraps it in a
`GyralError` and sends it through **one channel**, so nothing escapes into the page as an
uncaught exception and nothing is only logged.

Expected failures are different: a request that can fail should say what its failure becomes.
Give its command an `onFailure` that maps the error to a message, and handle that message in
`update` like any other ([Effects and drivers](/docs/effects/)). The channel on this page is for
the failures you didn't plan for.

## One channel

A `GyralError` carries `component` (the host's tag), `phase` (where it failed), `msg` (the
message tag, intent name or driver) and `cause` (what was thrown). In order:

1. **Devtools** shows an `error` row in the timeline (development).
2. **A parent can catch it.** A bubbling, composed, cancelable `ErrorEvent('error')` is
   dispatched on the failing component. An ancestor that listens for it is a **boundary**; it
   claims the failure with `preventDefault()`.
3. **The component's own fallback runs.** Its `error(failure, state)` view renders when `init`
   or the view threw; its optional `Errored` reducer receives failed updates, parsers and
   commands.
4. **Unless a parent claimed it, it is reported** with
   [`reportError()`](https://developer.mozilla.org/docs/Web/API/reportError): `window`'s `error`
   event and your monitoring see it, once.

| Phase       | What threw                                                                 | What happens                                                                |
| ----------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `init`      | `init`                                                                     | No state: `error(failure, undefined)` renders, or the component stays empty |
| `update`    | a reducer                                                                  | Nothing changes: the state is kept and its commands don't run; `Errored`    |
| `view`      | the view                                                                   | `error(failure, state)` renders, or the previous DOM stays                  |
| `parse`     | an intent parser (throws or rejects)                                       | No message; `Errored`                                                       |
| `command`   | an `onSuccess`/`onFailure` mapper, or a driver failure without `onFailure` | No message; `Errored`                                                       |
| `hook`      | an element hook                                                            | Reported; the other hooks of that render still run                          |
| `store`     | a store reducer or a subscriber                                            | The store is unchanged / the other subscribers are still notified           |
| `subscribe` | a subscription's unsubscribe                                               | Reported; the command still stops                                           |

`el.send()` never throws to its caller, and a failure inside `error` or `Errored` is reported
once, never looped. `Errored` is a framework message name, like `PropsChanged`.

## A component's own fallback

`error(failure, state)` renders instead of the view when `init` (then `state` is `undefined`)
or the view throws. `Errored` lets the component switch to an error state, or reset:

```ts
// src/order-list.ts
import { command, define, defineDriver, html, type GyralError } from '@gyral/core';

interface Order {
  readonly id: string;
  readonly total: number;
}
type State =
  | { readonly _tag: 'Ready'; readonly orders: readonly Order[] }
  | { readonly _tag: 'Broken'; readonly reason: string };
type Msg =
  { readonly _tag: 'Refresh' } | { readonly _tag: 'Loaded'; readonly orders: readonly Order[] };

const orders = defineDriver<undefined, readonly Order[]>({
  name: 'orders',
  run: async (_input, { signal }) => {
    const response = await fetch('/api/orders', { signal });
    return (await response.json()) as readonly Order[];
  },
});
const refresh = () =>
  command(orders, undefined, { onSuccess: (list): Msg => ({ _tag: 'Loaded', orders: list }) });

export const OrderList = define<State, Msg>()('order-list', {
  init: () => [{ _tag: 'Ready', orders: [] }, [refresh()]],
  intent: { Refresh: () => ({ _tag: 'Refresh' }) },
  update: {
    Refresh: (s) => [s, [refresh()]],
    Loaded: (_s, m) => ({ _tag: 'Ready', orders: m.orders }),
    // Any failed update, parse or command of this component. The driver failing lands here
    // too, because this command has no onFailure.
    Errored: (_s, m) => ({ _tag: 'Broken', reason: m.error.phase }),
  },
  view: (s, i) =>
    s._tag === 'Broken'
      ? html`<p role="alert">Orders are unavailable (${s.reason}).</p>
          <button type="button" data-intent=${i.Refresh}>Try again</button>`
      : html`<ul>
          ${s.orders.map((o) => html`<li>${o.id}: ${o.total}</li>`)}
        </ul>`,
  error: (failure: GyralError) =>
    html`<p role="alert">Orders failed to show (${failure.phase}).</p>`,
});
```

## A parent boundary

A parent catches a child's failure with the intents it already has: listen for `error` on the
child, read the `GyralError` from the event, and call `preventDefault()` to claim it. A claimed
failure isn't reported, so report it yourself if you still want it in your telemetry. To retry,
re-mount the child (render it in a different template, or give it a new key in `each()`): its
`init` runs again.

```ts
// src/dashboard.ts
import { define, html, type GyralError } from '@gyral/core';

interface State {
  readonly attempt: number;
  readonly failed: boolean;
}
type Msg = { readonly _tag: 'WidgetFailed' } | { readonly _tag: 'Retry' };

export const Dashboard = define<State, Msg>()('my-dashboard', {
  init: () => ({ attempt: 0, failed: false }),
  intent: {
    WidgetFailed: ({ event }) => {
      const failure = (event as ErrorEvent).error as GyralError;
      event.preventDefault(); // claimed: this boundary handles it, the page doesn't
      console.info('the chart failed in', failure.phase);
      return { _tag: 'WidgetFailed' };
    },
    Retry: () => ({ _tag: 'Retry' }),
  },
  update: {
    WidgetFailed: (s) => ({ ...s, failed: true }),
    Retry: (s) => ({ attempt: s.attempt + 1, failed: false }),
  },
  view: (s, i) =>
    s.failed
      ? html`<p role="alert">The chart is unavailable.</p>
          <button type="button" data-intent=${i.Retry}>Retry</button>`
      : s.attempt % 2 === 0
        ? html`<div>
            <sales-chart data-intent=${i.WidgetFailed} data-intent-on="error"></sales-chart>
          </div>`
        : html`<p>
            <sales-chart data-intent=${i.WidgetFailed} data-intent-on="error"></sales-chart>
          </p>`,
});
```

The event stops at the document, so `window` hears an unclaimed failure only once, through
`reportError`.

## Monitoring

Every unclaimed failure reaches `window` once. Listen there; `event.error` is the `GyralError`:

```ts
// src/telemetry.ts
import { GyralError } from '@gyral/core';

window.addEventListener('error', (event) => {
  if (!(event.error instanceof GyralError)) return;
  const { component, phase, msg, cause } = event.error;
  navigator.sendBeacon(
    '/telemetry',
    JSON.stringify({ component, phase, msg, cause: String(cause) }),
  );
});
```

Production builds report the same errors with short messages; the codes are explained on the
[error codes](/errors/) page.

## On the server

A component whose `init` or view throws during [server rendering](/docs/server-rendering/)
renders its `error` view (or nothing), marked `data-gyral-error` and without a seed. The rest of
the page renders, and the browser starts that component fresh. `renderPage`'s `onError` hears
each failure (default `console.error`). With `onError: 'throw'`, `renderPage` renders the page
to a string first and throws before any byte is sent, so the route can answer with its error
page:

```ts
// src/server/orders-page.ts
import { html, type GyralError } from '@gyral/core';
import { renderPage } from '@gyral/ssr';

declare const report: (error: GyralError) => void;
const body = html`<order-list></order-list>`;

// One failing component shouldn't take the page down: it shows its fallback.
export const ordersPage = (): Response =>
  renderPage({ title: 'Orders', body, onError: (error) => report(error) });

// This page is all or nothing: answer 500 with an error page instead.
export function checkoutPage(): Response {
  try {
    return renderPage({ title: 'Checkout', body, onError: 'throw' });
  } catch {
    return new Response('Something went wrong', { status: 500 });
  }
}
```

Data loading happens before `renderPage`, so the route handler already owns the error page for
its own failures.

## In tests

`reportError` counts as an uncaught error, and Vitest fails a test run on one. That's what you
want for failures you didn't plan. When a test makes a component fail on purpose, collect the
failures with `collectErrors()` from `@gyral/testing` and assert on them:

```ts
// src/order-list.browser.test.ts
import { settled } from '@gyral/core';
import { collectErrors, fakeDriver } from '@gyral/testing';
import { afterEach, expect, it } from 'vitest';
import { OrderList } from './order-list.js';

let collected: ReturnType<typeof collectErrors> | undefined;
afterEach(() => collected?.stop());

it('shows the error state when the orders fail to load', async () => {
  collected = collectErrors();
  const el = new OrderList();
  el.drivers = {
    orders: fakeDriver('orders', () => {
      throw new Error('down');
    }),
  };
  document.body.append(el);
  await settled();
  expect(collected.errors.map((e) => e.phase)).toEqual(['command']);
  expect(el.shadowRoot?.textContent).toContain('unavailable');
});
```

In a model test, `step()` accepts `Errored`, so you can test that reducer without a DOM.
