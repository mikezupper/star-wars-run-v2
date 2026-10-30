---
title: Network streams
description: Native EventSource and WebSocket drivers: receive validated streams, send messages and handle connection lifecycles.
useWhen: reading a WebSocket or EventSource stream as messages
section: Guides
order: 7.7
---

# Network streams

Optional `@gyral/http/sse` and `@gyral/http/websocket` entries use browser-native transports.
They are separate from the fetch entry, add no runtime dependencies, and open no resources
on import or factory creation. Use normal commands, declarative subscriptions and fake
substitution by driver name. Feeds start after the first render, preserving SSR seeds.

## Server-sent events

```ts
// src/server-count.ts
import { command, define, html } from '@gyral/core';
import {
  makeEventSourceDriver,
  type EventSourceError,
  type EventSourceOutput,
} from '@gyral/http/sse';
import * as v from 'valibot';

const schema = v.object({ count: v.number() });
const feed = makeEventSourceDriver(schema, { events: ['count'], withCredentials: false });
type Msg =
  | { readonly _tag: 'Feed'; readonly value: EventSourceOutput<v.InferOutput<typeof schema>> }
  | { readonly _tag: 'Failed'; readonly error: EventSourceError };
interface State {
  readonly count: number;
  readonly status: string;
}
export const Counter = define<State, Msg>()('my-server-count', {
  init: () => ({ count: 0, status: 'connecting' }),
  subscriptions: () => [
    command(
      feed,
      { url: '/events' },
      {
        onSuccess: (value) => ({ _tag: 'Feed', value }),
        onFailure: (error) => ({ _tag: 'Failed', error }),
      },
    ),
  ],
  update: {
    Feed: (s, m) => {
      switch (m.value._tag) {
        case 'EventSourceMessage':
          return { ...s, count: m.value.data.count };
        case 'EventSourceState':
          return { ...s, status: m.value.state };
        case 'EventSourceDecodeFailed':
          return { ...s, status: 'invalid event' };
      }
    },
    Failed: (s) => ({ ...s, status: 'closed' }),
  },
  view: (s) =>
    html`<output>${s.count}</output>
      <p role="status">${s.status}</p>`,
});
```

The driver always observes `message` and adds configured named events (no wildcard native
listener). `EventSourceMessage` preserves `eventType` and `lastEventId`; empty IDs are valid.
Default parsing is JSON followed by Standard Schema validation. Use `parse(text)` for another
text format. Async decoders preserve arrival order. Bad JSON/schema data emits
`EventSourceDecodeFailed { issues, eventType, lastEventId }` without ending the connection.

Native EventSource owns GET requests, cookie credentials, reconnection, server `retry:`
timing and Last-Event-ID. `withCredentials` configures cross-origin credentials; same-origin
cookies follow native behavior. CONNECTING errors report connecting state and keep the same
source. Terminal CLOSED errors report closed state and reject with `EventSourceError` through
`onFailure`; detailed HTTP status/body are unavailable. The driver adds no second retry loop.
Abort removes listeners, closes the source and suppresses pending decoded results.

Headers, POST streams and fetch-based transports are outside this driver. Event IDs do not
guarantee exactly-once delivery or replay; handle deduplication/resynchronization in your
protocol. Tests put `fakeDriver(feed)`, which takes the driver's name (`sse`, or the configured
one), in `el.drivers = [fake]` and call `fake.emitNext(...)` to deliver events/states.

## WebSocket

```ts
// src/native-chat.ts
import { command, define, html, retry } from '@gyral/core';
import {
  makeWebSocketDriver,
  type WebSocketError,
  type WebSocketOutput,
} from '@gyral/http/websocket';
import * as v from 'valibot';

const schema = v.object({ text: v.string() });
const raw = makeWebSocketDriver(schema, {
  encode: (value: { text: string }) => JSON.stringify(value),
});
const socket = retry(raw, {
  times: 3,
  delayMs: 500,
  backoff: 'exponential',
  jitter: true,
  retryIf: (error) => error._tag === 'WebSocketClosedError' && error.code === 1006,
});
interface State {
  readonly live: boolean;
  readonly text: string;
  readonly status: string;
}
type Msg =
  | { readonly _tag: 'Socket'; readonly value: WebSocketOutput<v.InferOutput<typeof schema>> }
  | { readonly _tag: 'Failed'; readonly error: WebSocketError }
  | { readonly _tag: 'Send'; readonly text: string }
  | { readonly _tag: 'Stop' };
const handlers = {
  onSuccess: (value: WebSocketOutput<v.InferOutput<typeof schema>>): Msg => ({
    _tag: 'Socket',
    value,
  }),
  onFailure: (error: WebSocketError): Msg => ({ _tag: 'Failed', error }),
};
export const Chat = define<State, Msg>()('my-native-chat', {
  init: () => ({ live: true, text: '', status: 'connecting' }),
  subscriptions: (s) =>
    s.live
      ? [
          command(
            socket,
            {
              _tag: 'Connect',
              connection: 'room',
              url: 'wss://example.test/chat',
            },
            { ...handlers, key: 'room-connect' },
          ),
        ]
      : [],
  intent: { Send: ({ value }) => ({ _tag: 'Send', text: value ?? '' }), Stop: true },
  update: {
    Send: (s, m) => [
      s,
      [
        command(
          socket,
          {
            _tag: 'Send',
            connection: 'room',
            value: { text: m.text },
          },
          { ...handlers, key: 'room-send' },
        ),
      ],
    ],
    Stop: (s) => [
      s,
      [
        command(
          socket,
          {
            _tag: 'Close',
            connection: 'room',
            code: 1000,
          },
          { ...handlers, key: 'room-close' },
        ),
      ],
    ],
    Failed: (s, m) => ({ ...s, live: false, status: m.error._tag }),
    Socket: (s, m) => {
      switch (m.value._tag) {
        case 'WebSocketMessage':
          return { ...s, text: m.value.data.text };
        case 'WebSocketState':
          return { ...s, status: m.value.state };
        case 'WebSocketDecodeFailed':
          return { ...s, status: 'invalid message' };
        case 'WebSocketClosed':
          return m.value.requested || (m.value.code === 1000 && m.value.wasClean)
            ? { ...s, live: false, status: 'closed' }
            : { ...s, status: 'reconnecting' };
        case 'WebSocketSent':
          return s; // enqueued, awaiting application acknowledgement
        case 'WebSocketCloseRequested':
          return s;
      }
    },
  },
  view: (s, i) =>
    html`<p>${s.text}</p>
      <p role="status">${s.status}</p>
      <button type="button" value="Hello" data-intent=${i.Send}>Send hello</button>
      <button type="button" data-intent=${i.Stop}>Close connection</button>`,
});
```

Each factory owns sockets by explicit connection ID. Only one active Connect owns an ID;
duplicates reject. Send/Close use the same socket; another factory has separate ownership.
Choose unique IDs when providing one driver to multiple components and distinct command keys
for Connect, Send and Close. A shared connection should have one subscribing owner; fan its
messages out through application state instead of issuing duplicate Connect commands.

Default incoming parse is JSON text followed by Standard Schema; binary messages are
ArrayBuffers (`binaryType: 'arraybuffer'`). Set synchronous `parse(payload)` for binary/other
text formats. Async schemas preserve message order. Malformed payloads emit
`WebSocketDecodeFailed` without ending the connection. Required `encode(value)` returns a
native string, Blob, ArrayBuffer or ArrayBufferView. Server-rendered model state stays JSON;
binary protocol values belong at the driver boundary or in client-only state.

The outgoing limit defaults to 65,536 bytes. `maxBufferedBytes` must be a nonnegative safe
integer (invalid configuration throws before resources open). Send requires an owned OPEN
socket and native bufferedAmount plus encoded bytes within the limit (UTF-8 for strings).
Failure uses `WebSocketSendError` with reason not-open/buffer-limit/encode/send. A successful
`WebSocketSent` means browser enqueue, not server processing or acknowledgement. No offline
queue or automatic resend exists. Native WebSocket has no inbound backpressure; the outgoing
limit does not bound incoming load.

Clean normal code 1000 closure resolves Connect with `WebSocketClosed`; an explicit Close
(default code 1000) also completes, including application close codes. `requested: true`
identifies that explicit request. Other closures emit `WebSocketClosed`, then reject with
`WebSocketClosedError` retaining code/reason/wasClean and `errored` (native error occurred).
Constructor/duplicate-ID errors use `WebSocketConnectError`; invalid Close requests use
`WebSocketCloseError`. Native errors expose no HTTP details.

Reconnection is opt-in through `retry`. Choose backoff/jitter and a retryIf predicate that
accepts your recoverable connection failures and excludes Send errors. Do not drop the
Connect subscription merely because an abnormal attempt emitted Closed: that aborts the
retry wrapper too. Drop it on requested/normal completion or final onFailure. An ended
subscription stays ended until its lane/input is removed and re-added/changed. Abort never
retries; cleanup removes listeners, releases ownership, closes the socket and suppresses
late events/decoders. Application acknowledgements and resynchronization are protocol data.
Tests use `fakeDriver(raw)` by name (`websocket` by default) for both streams and sends.
