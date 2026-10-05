---
title: Testing
description: Test models without a DOM, components in a real browser with fake drivers and virtual time, and server-rendered pages through hydration.
section: Guides
order: 11
---

# Testing

Gyral's loop is made of pure functions and data, so most of a component can be tested without a
browser: feed messages to `update`, look at the state and the commands. What's left, rendering
and the platform, you test in a real browser. `@gyral/testing` covers both, and works with any
test runner.

```sh
npm install -D @gyral/testing vitest
```

The examples on this page test this component: a lookup that debounces typing, then asks a
server.

```ts
// src/lookup.ts
import { define, html } from '@gyral/core';
import { get } from '@gyral/http';
import { debounce } from '@gyral/time';
import * as v from 'valibot';

const Result = v.object({ name: v.string() });

export interface State {
  readonly query: string;
  readonly found: string | undefined;
}

export type Msg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Search'; readonly query: string }
  | { readonly _tag: 'Found'; readonly query: string; readonly name: string }
  | { readonly _tag: 'Failed' };

export const Lookup = define<State, Msg>('my-lookup', {
  init: () => ({ query: '', found: undefined }),
  intent: { Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }) },
  update: {
    Typed: (s, m) => [
      { ...s, query: m.query },
      [debounce<Msg>(300, { _tag: 'Search', query: m.query })],
    ],
    Search: (s, m) => [
      s,
      [
        get(`/api/lookup?q=${encodeURIComponent(m.query)}`, {
          schema: Result,
          key: 'lookup',
          concurrency: 'switch',
          onSuccess: (r): Msg => ({ _tag: 'Found', query: m.query, name: r.name }),
          onFailure: (): Msg => ({ _tag: 'Failed' }),
        }),
      ],
    ],
    // A late answer for an old query is ignored.
    Found: (s, m) => (m.query === s.query ? { ...s, found: m.name } : s),
    Failed: (s) => ({ ...s, found: undefined }),
  },
  view: (s, i) => html`
    <label for="q">Name</label>
    <input id="q" .value=${s.query} data-intent=${i.Typed} />
    <output for="q">${s.found ?? ''}</output>
  `,
});
```

## step() and run()

`Lookup.spec` is the object passed to `define()`. `step(spec, state, msg)` runs one message
through `update`; `run(spec, messages)` folds several, starting from `init`. Both return the
state and the commands, so a test never has to unpack `[state, commands]` itself.

```ts
// src/lookup.test.ts
import { expect, it } from 'vitest';
import { http } from '@gyral/http';
import { inputsFor, resolve, run, step } from '@gyral/testing';
import { Lookup } from './lookup.js';

it('asks the server for the typed name', () => {
  const searched = step(
    Lookup.spec,
    { query: 'ada', found: undefined },
    { _tag: 'Search', query: 'ada' },
  );
  expect(inputsFor(searched.commands, http).map((r) => r.url)).toEqual(['/api/lookup?q=ada']);

  // Answer the command through its own mapper, then feed the message back.
  const request = searched.commands[0];
  if (request === undefined) throw new Error('expected a request');
  const answer = resolve(request, { name: 'Ada Lovelace' });
  if (answer === undefined) throw new Error('expected a message');
  expect(step(Lookup.spec, searched.state, answer).state.found).toBe('Ada Lovelace');
});

it('ignores answers to an older query', () => {
  const { state } = run(Lookup.spec, [
    { _tag: 'Typed', query: 'ada' },
    { _tag: 'Typed', query: 'grace' },
    { _tag: 'Found', query: 'ada', name: 'Ada Lovelace' },
  ]);
  expect(state).toEqual({ query: 'grace', found: undefined });
});
```

- `inputsFor(commands, driver)` lists the inputs of the commands for one driver, matched by
  name, so the test reads the request that would be sent.
- `resolve(command, output)` and `reject(command, error)` run a command's own mappers, so the
  test checks the exact message the component would receive.
- Framework messages step like any other: `{ _tag: 'PropsChanged', props, prev }`,
  `IntentRejected`, `StoreChanged`.
- `step(…, props, stores)` and `run(…, { props, stores, state })` give reducers their context.

These tests run in Node, in milliseconds, and cover most of the behaviour.

## Browser tests

For rendering, events and focus, test the real element in a real browser. Gyral's own tests use
[Vitest browser mode](https://vitest.dev/guide/browser/) with Chromium; spread
`gyralVitePreset()` into the browser project's config.

```ts
// src/lookup.browser.test.ts
import { afterEach, expect, it } from 'vitest';
import { fakeHttp } from '@gyral/http/testing';
import { virtualTime, type VirtualTime } from '@gyral/testing';
import { Lookup } from './lookup.js';

let time: VirtualTime | undefined;

afterEach(() => {
  time?.restore();
  document.body.replaceChildren();
});

it('debounces typing, then shows the answer', async () => {
  time = virtualTime();
  const http = fakeHttp(); // the real http driver over a fake fetch: schemas still decode
  const el = new Lookup();
  el.drivers = { http };
  document.body.append(el);
  await el.updateComplete;

  const input = el.shadowRoot?.querySelector('input');
  if (input == null) throw new Error('missing input');
  input.value = 'ada';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

  await time.advance(299);
  expect(http.requests).toHaveLength(0);
  await time.advance(1);
  expect(http.requests.map((r) => r.url)).toEqual(['/api/lookup?q=ada']);

  http.respondNext({ body: { name: 'Ada Lovelace' } });
  await time.advance(0);
  await el.updateComplete;
  expect(el.shadowRoot?.querySelector('output')?.textContent).toBe('Ada Lovelace');
});
```

## Fake drivers and commands

Substitute drivers by name, as the app would ([Effects](/docs/effects/#substituting-drivers)):

- **`el.drivers = { http }`** for one element.
- **`withDrivers(root, drivers)`** for every component under a container, including nested
  components in shadow roots. It returns a function that removes the overrides.
- **`fakeDriver(driverOrName, { impl? })`** records every call and waits for the test:
  `resolveNext(output)`, `rejectNext(error)`, `emitNext(value)` for streaming drivers, or
  `calls[i].resolve(…)`. With `impl`, it answers at once.
- **`fakeHttp()`** from `@gyral/http/testing` is the real HTTP driver over a controllable
  `fetch`, so response schemas, status errors and JSON parsing behave as in production.
  `respondNext({ status, body })`, `reply(422, problem)` and `failNext()` answer requests.

Removing an element cancels its commands on a later tick, so yield (`await time.advance(0)`)
before asserting that a request was aborted.

## Virtual time

`virtualTime()` replaces timers, `Date` and `requestAnimationFrame` with a virtual clock.
`advance(ms)` runs what's due and the promise work in between; `runAll()` runs every pending
timer; `restore()` puts the real clock back. It patches the platform, not Gyral, so it covers
debounces, `periodic`, driver timeouts and retry delays alike.

## SSR and hydration tests

Server rendering is tested in two halves. In Node, render the page and compare it with a golden
file. In the browser, mount that output the way a page load would, then let the components
hydrate:

```ts
// src/page.browser.test.ts
import { expect, it } from 'vitest';
import { hydrated, mountSsr } from '@gyral/testing';
import pageHtml from './fixtures/lookup-page.html?raw';

it('hydrates the server page in place', async () => {
  const page = mountSsr(pageHtml);
  const before = page.root.querySelector('my-lookup');
  await import('./lookup.js'); // import after mounting, as a real page load would
  await hydrated(page);
  expect(page.root.querySelector('my-lookup')).toBe(before); // same element: no re-render
  page.unmount();
});
```

- **`mountSsr(html)`** parses Declarative Shadow DOM, applies only the `<head>` styles, restores
  the store seed and `<meta>` tags, and starts recording console errors.
- **`hydrated(page)`** waits until every component, including nested ones, has hydrated. It fails
  on a hydration mismatch, on any console error or warning since mounting, and on a
  server-rendered element whose module was never imported.

## Property tests from schemas

`arbitraryFrom(schema)` from `@gyral/testing/arbitraries` turns a Standard Schema into a
[fast-check](https://fast-check.dev) arbitrary, so the schema that guards a form also generates
its test inputs. It reads Standard JSON Schema when the library provides it (Zod 4 does), or
takes a `toJsonSchema` converter.

## Testing stores

`stepStore(store, state, msg)` runs a store reducer, `testStore(store, initial)` gives a test its
own instance (`el.stores = { cart: instance }`), and `sentTo(commands, store)` lists the messages
a reducer sent to a store.
