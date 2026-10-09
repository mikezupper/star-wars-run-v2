---
title: Testing
description: Test models without a DOM, components in a real browser with fake drivers and virtual time, and server-rendered pages through hydration.
section: Guides
order: 16
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
import { debounce } from '@gyral/time/delay';
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

export const Lookup = define<State, Msg>()('my-lookup', {
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
    <input id="q" value=${s.query} data-intent=${i.Typed} />
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
- `outputsIn(commands, Component)` lists what a reducer sent to the parent with `emit`, typed
  by the component's output union, and `focusTargetsIn(commands)` lists where it asked focus to
  go (below).
- `resolve(command, output)` and `reject(command, error)` run a command's own mappers, so the
  test checks the exact message the component would receive.
- Framework messages step like any other: `{ _tag: 'PropsChanged', props, prev }`,
  `IntentRejected`, `StoreChanged`.
- `step(…, props, stores)` and `run(…, { props, stores, state })` give reducers their context.

These tests run in Node, in milliseconds, and cover most of the behaviour.

Outputs and focus requests are commands too, so a model test checks them the same way. Take a
tag editor that tells its parent about each new tag and puts focus back in its input:

```ts
// src/tag-editor.ts
import { define, focus, html, outputs } from '@gyral/core';

export type TagEditorOutput = { readonly _tag: 'TagAdded'; readonly tag: string };

const emit = outputs<TagEditorOutput>();

export interface State {
  readonly tags: readonly string[];
}

export type Msg = { readonly _tag: 'Add'; readonly tag: string };

export const TagEditor = define<State, Msg, object, TagEditorOutput>()('my-tag-editor', {
  init: () => ({ tags: [] }),
  intent: { Add: ({ value }) => ({ _tag: 'Add', tag: value ?? '' }) },
  update: {
    Add: (s, m) => [
      { tags: [...s.tags, m.tag] },
      [emit({ _tag: 'TagAdded', tag: m.tag }), focus('input', { select: true })],
    ],
  },
  view: (s, i) => html`
    <label for="tag">New tag</label>
    <input id="tag" />
    <button type="button" value="urgent" data-intent=${i.Add}>Add “urgent”</button>
    <output for="tag">${s.tags.join(', ')}</output>
  `,
});
```

```ts
// src/tag-editor.test.ts
import { expect, it } from 'vitest';
import { focusTargetsIn, outputsIn, step } from '@gyral/testing';
import { TagEditor } from './tag-editor.js';

it('tells the parent about the new tag and keeps focus in the input', () => {
  const { commands } = step(TagEditor.spec, { tags: [] }, { _tag: 'Add', tag: 'urgent' });
  expect(outputsIn(commands, TagEditor)).toEqual([{ _tag: 'TagAdded', tag: 'urgent' }]);
  expect(focusTargetsIn(commands)).toEqual([{ selector: 'input', select: true }]);
});
```

Passing the class types the result by its outputs, so a test that expects an output the
component can't send doesn't compile. Without a class, `outputsIn<TagEditorOutput>(commands)`
names the union itself. Read outputs and focus requests through these helpers, not by
filtering on driver names: those are Gyral's internals and may change.

## Browser tests

For rendering, events and focus, test the real element in a real browser. Gyral's own tests use
[Vitest browser mode](https://vitest.dev/guide/browser/) with Chromium; spread
`gyralVitePreset()` into the browser project's config.

Gyral renders on a schedule: reducers run as soon as a message arrives, and the DOM updates in a
microtask, once for every message that arrived together. **`await settled()`** from
`@gyral/core` waits until every component on the page has rendered its latest state, including
view transitions, focus commands and lazily loaded code, and until messages have stopped
arriving. Await it before you look at the DOM; there's nothing to poll.

- **It waits for chains of messages**: a driver that answers at once, a store that notifies in a
  microtask, a stream that re-arms in one, a reducer that answers with the next command. Each
  message restarts its quiet window, so you need no `await Promise.resolve()` loops before it.
- **It doesn't wait for commands that never end**, such as a store watch or a socket, only for
  the messages they deliver.
- **It never waits for timers or the network.** Answer fake drivers and advance virtual time
  first, then `await settled()`.

Because it waits for the whole chain, a fake that answers at once runs to the end before
`settled()` resolves. To see an in-between state such as "Loading…", use a fake that waits for
the test (`fakeDriver(name)` without `impl`), assert, then answer it with `resolveNext`.

```ts
// src/lookup.browser.test.ts
import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
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
  await settled();

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
  await settled();
  expect(el.shadowRoot?.querySelector('output')?.textContent).toBe('Ada Lovelace');
});
```

### What a parser decides

Some decisions happen during the event itself: whether a parser calls `preventDefault()`, or
[declines](/docs/intent/#declining-passing-an-event-outward) so an outer intent gets the key. A
model test can't see them, but a browser test can, because parsers run while the event is
dispatched. Dispatch a cancelable event and read `defaultPrevented` as soon as
`dispatchEvent()` returns. Take a listbox that owns the arrow keys of its orientation prop:

```ts
// src/folder-list.ts
import { define, html, prop } from '@gyral/core';

export type Msg = { readonly _tag: 'Step'; readonly by: -1 | 1 };

export const FolderList = define<
  { readonly active: number },
  Msg,
  { readonly orientation: string }
>()('my-folder-list', {
  props: { orientation: prop.string({ default: 'vertical' }) },
  init: () => ({ active: 0 }),
  intent: {
    Step: ({ key, event }, { props }) => {
      const [back, next] =
        props.orientation === 'horizontal' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
      const by = key === back ? -1 : key === next ? 1 : 0;
      if (by === 0) return undefined;
      event.preventDefault();
      return { _tag: 'Step', by };
    },
  },
  update: { Step: (s, m) => ({ active: Math.min(1, Math.max(0, s.active + m.by)) }) },
  view: (s, i, { props }) => html`
    <ul
      role="listbox"
      tabindex="0"
      aria-label="Folders"
      aria-orientation=${props.orientation}
      data-intent-keydown=${i.Step}
    >
      <li role="option" aria-selected=${s.active === 0}>Inbox</li>
      <li role="option" aria-selected=${s.active === 1}>Sent</li>
    </ul>
  `,
});
```

```ts
// src/folder-list.browser.test.ts
import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { FolderList } from './folder-list.js';

afterEach(() => {
  document.body.replaceChildren();
});

/** Presses a key on `target` and returns the event, to read what the parser decided. */
const press = (target: Element, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
};

it('takes only the arrow keys of its orientation', async () => {
  const el = new FolderList();
  el.orientation = 'horizontal';
  document.body.append(el);
  await settled();
  const list = el.shadowRoot?.querySelector('[role="listbox"]');
  if (list == null) throw new Error('missing listbox');

  expect(press(list, 'ArrowDown').defaultPrevented).toBe(false); // left to the page
  expect(press(list, 'ArrowRight').defaultPrevented).toBe(true);
  await settled();
  expect(el.state.active).toBe(1);
});
```

Props reach the parser as they are when the event fires, so setting `el.orientation` before the
key press is enough. Setting a prop to a value [equal to the current
one](/docs/components/#when-a-prop-counts-as-changed) changes nothing, though: no render and no
`PropsChanged`. A test that expects either must set a different value.

## Fake drivers and commands

Substitute drivers by name, as the app would ([Effects](/docs/effects/#substituting-drivers)):

- **`el.drivers = { http }`** for one element.
- **`withDrivers(root, drivers)`** for every component under a container, including nested
  components in shadow roots. It returns a function that removes the overrides.
- **`fakeDriver(driverOrName, { impl? })`** records every call and waits for the test:
  `resolveNext(output)`, `rejectNext(error)`, `emitNext(value)` for streaming drivers, or
  `calls[i].resolve(…)`. With `impl`, it answers at once. **`fakeDriver(name, run)`** is the
  short form: it answers every call with `run` and records the inputs.
- **`fakeHttp()`** from `@gyral/http/testing` is the real HTTP driver over a controllable
  `fetch`, so response schemas, status errors and JSON parsing behave as in production.
  `respondNext({ status, body })`, `reply(422, problem)` and `failNext()` answer requests.

Drivers go in as they are: any driver, a fake included, fits `el.drivers`, `withDrivers` and
`provideDrivers` with no cast. When you keep a map of drivers yourself, type it as
`DriverOverrides` from `@gyral/core`. `Record<string, Driver<unknown, unknown>>` looks right but
rejects every driver with a typed input.

```ts
// src/test-drivers.ts
import type { DriverOverrides } from '@gyral/core';
import { fakeHttp } from '@gyral/http/testing';
import { fakeDriver } from '@gyral/testing';

/** What the component copied to the clipboard, for the test to read. */
export const copied: string[] = [];

export const testDrivers: DriverOverrides = {
  http: fakeHttp(),
  clipboard: fakeDriver<string, undefined>('clipboard', (text) => void copied.push(text)),
};
```

Removing an element stops its commands one microtask later, so that a move (removed and
inserted again in the same task) keeps them running. After `el.remove(); await
Promise.resolve();`, every running command's `signal.aborted` is `true`, its `abort` listeners
have run, and no later result is dispatched. Cleanup a driver runs after an `await` (a
`finally` once its promise settles) happens later still; yield again (or
`await clock.advance(0)` under `virtualTime()`) to observe it. To test a component that is
attached again after a real removal, step its `Connected` reducer:
`step(spec, state, { _tag: 'Connected', reconnect: true })`.

## Virtual time

`virtualTime()` replaces timers, `Date` and `requestAnimationFrame` with a virtual clock.
`advance(ms)` runs what's due and the promise work in between; `runAll()` runs every pending
timer; `restore()` puts the real clock back. It patches the platform, not Gyral, so it covers
debounces, `periodic`, driver timeouts and retry delays alike. Advance the clock, then
`await settled()` before you assert on the DOM.

It also works in a Vitest **node** project, where there is no `requestAnimationFrame` to fake,
so driver and polling tests that need no DOM can use it:

```ts
// test/poll.node.test.ts
import { afterEach, beforeEach, expect, it } from 'vitest';
import { virtualTime, type VirtualTime } from '@gyral/testing';

let time: VirtualTime;
beforeEach(() => {
  time = virtualTime();
});
afterEach(() => time.restore());

it('polls every 30 s', async () => {
  const seen: number[] = [];
  const id = setInterval(() => seen.push(Date.now()), 30_000);
  await time.advance(90_000);
  clearInterval(id);
  expect(seen).toHaveLength(3);
});
```

## SSR and hydration tests

A hydration test mounts real server markup in the browser, imports the component modules the
way a page load would, and checks that each component took over the server's DOM instead of
rendering again. The browser can't produce that markup itself (there, `define()` registers
elements rather than server specs), so it comes from Node, in one of two ways.

### Server markup on demand

`renderOnServer` from `@gyral/testing/vitest` is a [Vitest browser
command](https://vitest.dev/api/browser/commands): it runs in Vitest's Node process, loads your
module through the project's Vite server and renders it with Gyral's server renderer. Register
it in the browser project's config:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { gyralVitePreset } from '@gyral/core/vite';
import { renderOnServer } from '@gyral/testing/vitest';

export default defineConfig({
  ...gyralVitePreset(),
  test: {
    // Your browser setup (provider, instances) as usual, plus the command.
    browser: { commands: { renderOnServer } },
  },
});
```

Then a browser test asks for the markup, mounts it, imports the component and waits for it to
hydrate:

```ts
// src/lookup-ssr.browser.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { settled } from '@gyral/core';
import { fakeHttp } from '@gyral/http/testing';
import {
  hydrated,
  mountSsr,
  virtualTime,
  withDrivers,
  type MountedSsr,
  type VirtualTime,
} from '@gyral/testing';

let page: MountedSsr | undefined;
let time: VirtualTime | undefined;

afterEach(() => {
  time?.restore();
  page?.unmount();
});

// The first call loads the module graph on the server, which can take seconds in a busy run.
describe('the server-rendered lookup', { timeout: 60_000 }, () => {
  it('hydrates in place and answers typing', async () => {
    page = mountSsr(await commands.renderOnServer({ module: './lookup.ts', export: 'Lookup' }));
    const host = page.root.querySelector('my-lookup');
    const input = host?.shadowRoot?.querySelector('input');
    const http = fakeHttp();
    withDrivers(page.root, { http });

    await import('./lookup.js'); // import after mounting, as a real page load would
    await hydrated(page);
    expect(host?.shadowRoot?.querySelector('input')).toBe(input); // the server's node, adopted

    time = virtualTime();
    if (input == null) throw new Error('missing input');
    input.value = 'ada';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await time.advance(300);
    http.respondNext({ body: { name: 'Ada Lovelace' } });
    await time.advance(0);
    await settled();
    expect(host?.shadowRoot?.querySelector('output')?.textContent).toBe('Ada Lovelace');
  });
});
```

- **`module`** is relative to the test file. **`export`** names a `define()` class (rendered
  with `props`, which must be JSON), a function of `props` that returns a template, an HTML
  string or a `Response` (a whole page from `renderPage`, store seed included), or a template.
- The server keeps modules loaded between calls, like a dev server, so pass what a render needs
  as `props`. Give the tests that make the first call a long timeout, as above.
- If your `tsconfig.json` doesn't include `vitest.config.ts`, add
  `import type {} from '@gyral/testing/vitest';` to the test for the command's types.

### A golden fixture

When the markup needs your whole server (routing, data loading, the page shell), or when you
want markup changes to show up in review, render the page in a Node test and keep the output as
a file:

```ts
// src/lookup-page.node.test.ts
import { expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import './lookup.js';

it('renders the lookup page', async () => {
  const response = renderPage({
    title: 'Lookup',
    body: html`<main><my-lookup></my-lookup></main>`,
    scripts: ['/src/entry-client.ts'],
  });
  await expect(await response.text()).toMatchFileSnapshot('./fixtures/lookup-page.html');
});
```

`vitest -u` rewrites the file. The browser test imports it with `?raw`:

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

### mountSsr() and hydrated()

- **`mountSsr(html)`** parses Declarative Shadow DOM, applies only the `<head>` styles, restores
  the store seed and `<meta>` tags, and starts recording console errors.
- **`hydrated(page)`** waits until every component, including nested ones, has hydrated (it
  awaits `settled()`). It fails on a hydration mismatch, on any console error or warning since
  mounting, and on a server-rendered element whose module was never imported. Islands keep
  waiting unless you pass `{ releaseIslands: true }`.
- Render the markup with development output (Vitest does by default) and the browser also
  checks each template's id while hydrating. Run the hydration tests against a production build
  of your components too: production hydration recovers from a mismatch instead of throwing, so
  only a warning shows it.

## Property tests from schemas

`arbitraryFrom(schema)` from `@gyral/testing/arbitraries` turns a Standard Schema into a
[fast-check](https://fast-check.dev) arbitrary, so the schema that guards a form also generates
its test inputs. It reads Standard JSON Schema when the library provides it (Zod 4 does), or
takes a `toJsonSchema` converter.

## Testing stores

`stepStore(store, state, msg)` runs a store reducer, `testStore(store, initial)` gives a test its
own instance (`el.stores = { cart: instance }`), and `sentTo(commands, store)` lists the messages
a reducer sent to a store.
