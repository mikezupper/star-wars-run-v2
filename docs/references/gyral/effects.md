---
title: Effects and drivers
description: Reducers return commands, side effects described as data. Drivers run them, with built-in concurrency, retries and cancellation, and answer with messages.
section: Guides
order: 7
---

# Effects and drivers

Reducers can't fetch, wait or write to storage, because they're pure. Instead they return
**commands**: plain objects that describe a side effect and say which message the outcome
becomes. A **driver** runs the command and answers with that message. Effects are data, and
they happen at the edges.

## Commands as data

```ts
// src/user.ts
import { define, html } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import * as v from 'valibot';

const User = v.object({ name: v.string(), email: v.string() });

export type State =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Loaded'; readonly name: string; readonly email: string }
  | { readonly _tag: 'Failed'; readonly reason: string };

export type Msg =
  | { readonly _tag: 'Load'; readonly id: number }
  | { readonly _tag: 'Loaded'; readonly name: string; readonly email: string }
  | { readonly _tag: 'Failed'; readonly error: HttpError };

export const UserCard = define<State, Msg>()('my-user-card', {
  init: () => ({ _tag: 'Idle' }),
  intent: { Load: ({ value }) => ({ _tag: 'Load', id: Number(value) }) },
  update: {
    Load: (_s, m) => [
      { _tag: 'Loading' },
      [
        get(`https://jsonplaceholder.typicode.com/users/${String(m.id)}`, {
          schema: User,
          onSuccess: (user): Msg => ({ _tag: 'Loaded', ...user }),
          onFailure: (error): Msg => ({ _tag: 'Failed', error }),
        }),
      ],
    ],
    Loaded: (_s, m) => ({ _tag: 'Loaded', name: m.name, email: m.email }),
    Failed: (_s, m) => ({ _tag: 'Failed', reason: m.error._tag }),
  },
  view: (s, i) => html`
    <button type="button" value="1" data-intent=${i.Load}>Load user 1</button>
    <p aria-live="polite">
      ${s._tag === 'Loaded' ? `${s.name} <${s.email}>` : s._tag === 'Failed' ? `Failed: ${s.reason}` : s._tag}
    </p>
  `,
});
```

`get(url, handlers)` builds a command for the `http` driver. The handlers are pure mappers:

- **`schema`** decodes the response with any Standard Schema, so `onSuccess` receives typed,
  validated data. A response that doesn't match becomes an `HttpDecodeError`.
- **`onSuccess`** turns the decoded body into a message.
- **`onFailure`** turns an error into a message. Errors are tagged data (`HttpStatusError`,
  `HttpNetworkError`, `HttpDecodeError`); nothing is ever thrown into the view. Leave it out and
  failures are logged and dropped.

The request and its answer sit next to each other in one reducer, typed end to end, with no
"response category" strings to match up.

## Concurrency lanes

What should happen when the user types again before the last search returned? Gyral answers it
with a policy, not with stream operators. Each command runs in a **lane** (`key`, by default the
driver's name), and the lane has a policy:

| Policy    | In one lane                               | Use for                      |
| --------- | ----------------------------------------- | ---------------------------- |
| `merge`   | run every command concurrently (default)  | independent writes, logging  |
| `switch`  | cancel the one in flight, run the new one | search as you type, debounce |
| `exhaust` | ignore new commands while one runs        | submit buttons, refresh      |
| `queue`   | run one at a time, in order               | ordered saves                |

```ts
// src/search.ts
import type { Command } from '@gyral/core';
import { get } from '@gyral/http';

/** A newer query cancels the request in flight, so results never arrive out of order. */
export const search = <M>(query: string, toMsg: (body: unknown) => M): Command<M> =>
  get(`/api/search?q=${encodeURIComponent(query)}`, {
    key: 'search',
    concurrency: 'switch',
    onSuccess: toMsg,
  });
```

A cancelled command's `AbortSignal` aborts (so `fetch` stops), and its result is never
delivered. When a component disconnects, all its commands are cancelled the same way, before
`remove()` returns.

## Built-in drivers

| Package         | Commands                                                                               |
| --------------- | -------------------------------------------------------------------------------------- |
| `@gyral/http`   | `get(url, handlers)`, `request(req, handlers)`, `submitForm(url, formData, handlers)`  |
| `@gyral/time`   | `delay(ms, msg)`, `debounce(ms, msg)`, `periodic(ms, toMsg)`, `animationFrames(toMsg)` |
| `@gyral/router` | `navigate(url)`, `back()`, `forward()`, `go(n)`, `setHead(head)`, `listen(toMsg)`      |
| `@gyral/core`   | `random(count, toMsg)`, `randomInt(min, max, toMsg)`                                   |

Three more commands are handled by the component itself rather than a driver: `emit(output)`
sends an [output](/docs/components/#child-components-and-outputs) to the parent, `send(store,
msg)` writes to a [store](/docs/stores/), and `focus(selector)` moves
[focus](/docs/views/#focus-is-a-command) after the next render.

### Commands that answer nothing

`focus()`, `emit()`, `navigate()`, `go()` and `setHead()` return `Command<never>`: they produce
no message. `never` fits any message type, so they go in any reducer's command list, and in a
helper typed `Command<Msg>`, with no type argument:

```ts
// src/after-save.ts
import { focus, type Command } from '@gyral/core';
import { navigate } from '@gyral/router';

export type Msg = { readonly _tag: 'Saved' } | { readonly _tag: 'Failed' };

/** After a save: back to the list, with focus on its heading. */
export const afterSave = (): readonly Command<Msg>[] => [navigate('/items'), focus('h1')];
```

Your own fire-and-forget commands can be typed the same way: pass `never` as the message type,
`command<string, void, unknown, never>(log, text, { onSuccess: () => undefined })`, and type
the helper's result `Command<never>`. Left to inference, the command would be a
`Command<undefined>`, which fits no message union.

Debounce is a delay under `switch`: each keystroke's `debounce(300, msg)` cancels the pending
one. An app that only needs delays imports `delay` and `debounce` from **`@gyral/time/delay`**:
the same commands over a delay-only driver, which leaves periodic ticks and animation frames out
of the bundle (about 0.15 KiB gzip). That driver is also named `time` and takes the same input,
so substitution and virtual time work unchanged. Randomness is a command too, so models stay pure
and tests can fix the numbers.

## Writing a driver

A driver is a plain object with a `name` and a `run` function:

```ts
// src/clipboard.ts
import { command, defineDriver, type Command } from '@gyral/core';

/** Why a copy failed. */
export type CopyError = 'unavailable' | 'denied' | 'failed';

/** Writes text to the clipboard. */
export const clipboard = defineDriver<string, void, CopyError>({
  name: 'clipboard',
  run: (text) => navigator.clipboard.writeText(text),
  concurrency: 'switch',
  toError: (cause) =>
    cause instanceof TypeError
      ? 'unavailable'
      : cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'denied'
        : 'failed',
});

export const copyText = <M>(text: string, copied: M, failed: (error: CopyError) => M): Command<M> =>
  command(clipboard, text, { onSuccess: () => copied, onFailure: failed });
```

- `run(input, { signal, emit })` returns the output or a promise of it. Abort work when `signal`
  aborts.
- `toError` turns whatever was thrown into the driver's typed error, which `onFailure` receives.
- `concurrency` is the default policy for the driver's commands; a command can override it.
- Retries aren't a driver option: wrap the driver where you choose it (next section).
- `defineDriver` only helps TypeScript infer the input, output and error types. Wrap the driver
  in typed command helpers like `copyText`, as the built-in packages do.

Nothing should run at import time: create resources when a command first runs, so modules are
safe to import on a server.

### Retries

`retry(driver, { times, delayMs?, backoff?, jitter?, retryIf? })` from `@gyral/core` returns the
same driver, under the same name, with failures tried again after the delay (`'fixed'` or
`'exponential'`). `jitter: true` waits a random time between 0 and that delay, so many clients
don't retry in step. `retryIf(error)` decides which failures to retry; it receives the
driver's typed error (its `toError`, else the thrown value), and by default every failure is
retried. A cancellation (the command switched away, the component removed) ends it at once and
is never retried. Wrap the driver where you choose it, at app setup, in a component's `drivers`
or in a test, and apps that never retry don't bundle the code.

For `@gyral/http`, `makeHttpDriver({ timeoutMs })` gives each attempt a deadline: a slower
attempt fails with `HttpTimeoutError` (`url`, `timeoutMs`), and the retry starts a fresh one.
`retryableHttpError` retries only what a second try can fix: network errors, timeouts, 408, 429
and 5xx. It doesn't read `Retry-After`.

```ts
// src/main.ts
import { provideDrivers, retry } from '@gyral/core';
import { makeHttpDriver, retryableHttpError } from '@gyral/http';

provideDrivers(document.body, {
  http: retry(makeHttpDriver({ baseUrl: '/api', timeoutMs: 8_000 }), {
    times: 2,
    delayMs: 300,
    backoff: 'exponential',
    jitter: true,
    retryIf: retryableHttpError,
  }),
});
```

`HttpError` is a union, so a `switch` that handles every case needs one for timeouts:

```ts
// src/errors.ts
import type { HttpError } from '@gyral/http';

export const describeError = (e: HttpError): string => {
  switch (e._tag) {
    case 'HttpStatusError':
      return `The server answered ${String(e.status)}.`;
    case 'HttpNetworkError':
      return 'You seem to be offline.';
    case 'HttpTimeoutError':
      return 'The server took too long to answer.';
    case 'HttpDecodeError':
      return 'The server sent something unexpected.';
  }
};
```

### Telling a refused request from no change

When a server (or a shared session) can refuse what the user asked for, don't infer the refusal
from a snapshot that didn't change: "same data" can mean refused, not yet processed, or a move
that changed nothing. Make the refusal a message of its own. A request with a reply maps the
refusal to its own variant through the command's `onFailure`; a feed that answers out of band
carries the request's id, so the component can tell its own refusal from someone else's update:

```ts
// src/moves.ts
import { command, defineDriver, type Command } from '@gyral/core';

interface Move {
  readonly id: string;
  readonly cell: number;
}
type Refusal = { readonly reason: string };

type Msg =
  | { readonly _tag: 'Accepted'; readonly id: string }
  | { readonly _tag: 'Refused'; readonly id: string; readonly reason: string };

/** The server answers 200 or a 409 with `{ reason }`; `toError` turns the 409 into a Refusal. */
const moves = defineDriver<Move, void, Refusal>({
  name: 'moves',
  run: async (move, { signal }) => {
    const res = await fetch('/api/moves', { method: 'POST', body: JSON.stringify(move), signal });
    if (!res.ok) throw (await res.json()) as Refusal;
  },
  toError: (cause) =>
    typeof cause === 'object' && cause !== null && 'reason' in cause
      ? { reason: String(cause.reason) }
      : { reason: 'unavailable' },
});

export const propose = (move: Move): Command<Msg> =>
  command(moves, move, {
    onSuccess: (): Msg => ({ _tag: 'Accepted', id: move.id }),
    onFailure: (refusal): Msg => ({ _tag: 'Refused', id: move.id, reason: refusal.reason }),
  });
```

The `Refused` reducer can then undo an optimistic change and show the reason. For form
submissions, `IntentRejected` is already this message ([Forms](/docs/forms/)).

### A copy button

With the driver above, a "Copy link" button is a message, a command and two answers:

```ts
// src/copy-link.ts
import { define, html, prop } from '@gyral/core';
import { copyText, type CopyError } from './clipboard.js';

export interface State {
  readonly status: 'idle' | 'copied' | CopyError;
}

export type Msg =
  | { readonly _tag: 'Copy' }
  | { readonly _tag: 'Copied' }
  | { readonly _tag: 'CopyFailed'; readonly error: CopyError };

const STATUS: Readonly<Record<State['status'], string>> = {
  idle: '',
  copied: 'Link copied.',
  unavailable: 'Copying needs a secure (https) page. Select the link and copy it instead.',
  denied: 'The browser blocked copying. Select the link and copy it instead.',
  failed: 'Copying failed. Select the link and copy it instead.',
};

export const CopyLink = define<State, Msg, { readonly url: string }>()('my-copy-link', {
  props: { url: prop.string({ required: true }) },
  init: () => ({ status: 'idle' }),
  intent: { Copy: () => ({ _tag: 'Copy' }) },
  update: {
    Copy: (s, _m, { props }) => [
      s,
      [copyText<Msg>(props.url, { _tag: 'Copied' }, (error) => ({ _tag: 'CopyFailed', error }))],
    ],
    Copied: () => ({ status: 'copied' }),
    CopyFailed: (_s, m) => ({ status: m.error }),
  },
  view: (s, i, { props }) => html`
    <label for="link">Link</label>
    <input id="link" readonly value=${props.url} />
    <button type="button" data-intent=${i.Copy}>Copy link</button>
    <p role="status">${STATUS[s.status]}</p>
  `,
});
```

- **`navigator.clipboard` exists only in a secure context**: https://, or localhost. Elsewhere
  reading `writeText` throws a `TypeError`, which `toError` turns into `unavailable`.
- **Browsers write only during a user activation.** Return the command from the reducer of the
  click's message, as above: with a synchronous parser, it starts while the click is still
  being handled. Started later, the browser rejects it with `NotAllowedError`, `denied` here.
- **Tests never touch the real clipboard**: they substitute the driver by name,
  `el.drivers = { clipboard: fakeDriver('clipboard') }` ([Testing](/docs/testing/#fake-drivers-and-commands)).

## Streaming results with emit

A driver can deliver more than one result: `emit(output)` sends a value through the command's
`onSuccess` while the command keeps running. Routers, timers, sockets and observers work this
way. A streaming `run` usually returns a promise that never resolves, and stops when `signal`
aborts:

```ts
// src/online.ts
import { command, defineDriver, type Command } from '@gyral/core';

/** Streams `navigator.onLine` now and on every change, until the component disconnects. */
export const online = defineDriver<void, boolean>({
  name: 'online',
  run: (_input, { signal, emit }) =>
    new Promise<boolean>(() => {
      const report = (): void => {
        emit(navigator.onLine);
      };
      report();
      window.addEventListener('online', report, { signal });
      window.addEventListener('offline', report, { signal });
    }),
});

export const watchOnline = <M>(toMsg: (online: boolean) => M): Command<M> =>
  command(online, undefined, { onSuccess: toMsg, concurrency: 'switch' });
```

Start a stream from `init`, and it lives as long as the component. For a source Gyral doesn't
own, such as signals, a Redux-style store or a socket, `subscription()` from `@gyral/core` writes
this plumbing for you: see [State Gyral doesn't own](/docs/outside-state/).

## Substituting drivers

Commands carry their driver, so most apps need no wiring. To substitute one, for a test fake
or a configured instance, Gyral looks drivers up **by name**, in this order:

1. the element's own `el.drivers`;
2. the nearest driver provider above it: a `<gyral-drivers>` element or
   `provideDrivers(element, drivers)`;
3. the spec's `drivers` option;
4. the driver object on the command.

For example, give every request of a component default headers:

```ts
// src/api-client.ts
import { define, html, type Stateless } from '@gyral/core';
import { csrfFromMeta, makeHttpDriver } from '@gyral/http';

export const ApiClient = define<Stateless, never>()('my-api-client', {
  drivers: { http: makeHttpDriver({ headers: csrfFromMeta('csrf-token') }) },
  intent: {},
  update: {},
  view: () => html`<slot></slot>`,
});
```

`csrfFromMeta` reads `<meta name="csrf-token">` when each request runs, so components never read
the DOM for it. The driver's headers are the one place a CSRF token from a `<meta>` is
configured; set it once for the app with `provideDrivers(document.body, { http:
makeHttpDriver({ headers: csrfFromMeta('csrf-token') }) })`. Development builds warn once when a
`POST`, `PUT`, `PATCH` or `DELETE` goes out without the token while the page has a CSRF
`<meta>`. [Testing](/docs/testing/) uses the same lookup to swap in fakes.

## On the server

Commands never run during a server render: there is no interpreter, no timer and no network.
Do async work in the route handler and pass results as props. After hydration, the browser
starts `init`'s commands, so a subscription such as `listen()` begins exactly where the server
left off. See [Server rendering](/docs/server-rendering/).
