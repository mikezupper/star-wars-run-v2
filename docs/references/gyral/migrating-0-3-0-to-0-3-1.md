---
title: Migrating from 0.3.0 to 0.3.1
description: Move a Gyral 0.3.0 app to 0.3.1 - the two-call define, the head model, retries and CSRF on the driver, one error channel, behavior changes - and what's new.
section: Reference
order: 3
---

# Migrating from 0.3.0 to 0.3.1

Gyral 0.3.1 changes some 0.3.0 APIs. This is a one-time exception while Gyral is still before
its first stable release: 0.3.1 takes the breaking changes once, so later 0.3 releases don't
have to. Move every `@gyral/*` package to 0.3.1 together (they share one version), then work
through the sections below. The API changes are type errors, so the type checker finds each
place to change; the behavior changes after them keep compiling, so check those against your
app and its tests.

## `define` takes two calls

`define` now takes the types you write in a first call and the tag and spec in a second, so
TypeScript can infer the component's intent names from the keys of `intent`:

```text
define<State, Msg>('my-todos', spec)    →  define<State, Msg>()('my-todos', spec)
define('my-badge', spec)                →  define()('my-badge', spec)
const i = intents<Msg>()                →  const i = intentsOf<typeof Todos>()
```

- **List rows** that name intents through the module constant need a return type,
  `(t: Todo): TemplateResult =>`, and the view uses its own `i` parameter, so the row and the
  component don't infer each other's types ([Lists](/docs/views/#lists)).
- **`IntentName<…>` and `Messages<M>` are gone.** Remove `IntentName<…>` from your message union
  and keep the parsers: every key of `intent` is an intent name, and a key that isn't a message
  tag may return any message ([Intent names that aren't messages](/docs/intent/#intent-names-that-arent-messages)).
  Type helpers that built messages with `Msg` instead of `Messages<Msg>`.
- **A view that names a tag with no parser** no longer compiles: the view's `i` offers only the
  keys of `intent`. Add the parser.
- **`IntentNames` takes the names** (`IntentNames<'Save' | 'Cancel'>`), not the message union.

## The head model

The page's head is one `Head` value, used by the server and the router alike
([The head](/docs/routing/#the-head)):

- **`setTitle(title)` is removed.** Return `setHead({ title })`, or better
  `setHead(pageHead(route))` with the same function the server uses, from your `Routed`
  reducer. A router fake's `{ _tag: 'Title' }` input is `{ _tag: 'Head', head }`, and
  `snapshot().title` is `snapshot().head?.title`.
- **`page({ head })` is `page({ extraHead })`.** Move the description, canonical, robots, Open
  Graph meta, alternates and JSON-LD into the `Head` fields `page()` and `renderPage()` now take;
  keep in `extraHead` only what the head model doesn't manage. Managed elements, the
  description meta included, carry `data-gyral-head`, so tests that match their exact markup
  change.

## Retries and CSRF tokens

Retries and CSRF tokens are now set where you choose the driver, so apps that don't use them
don't bundle them ([Effects](/docs/effects/#retries)):

- **`retry` is a wrapper.** The `retry` option of drivers, `subscription(…)`,
  `makeHttpDriver(…)`, `fakeDriver(…)` and `fakeHttp(…)` is gone; wrap the driver instead:
  `retry(makeHttpDriver({ … }), { times: 2, delayMs: 300 })`. In tests, keep reading `calls`
  and `inputs` from the fake itself, not the wrapper.
- **A CSRF token from a `<meta>` is a driver setting.** `request({ csrf: { meta } })` and
  `submitForm(…, { csrf: { meta } })` are gone. Configure it once:
  `provideDrivers(document.body, { http: makeHttpDriver({ headers: csrfFromMeta('csrf-token') }) })`.
  `submitForm(…, { csrf: { token } })` stays for a token the app already holds. Development
  builds warn once when a `POST` goes out without the token while the page has the `<meta>`.
- **`HttpError` has a timeout case.** `makeHttpDriver({ timeoutMs })` fails a slow attempt with
  `HttpTimeoutError`, so a `switch` over `HttpError` that handles every case needs a branch for
  it ([Retries](/docs/effects/#retries)).

## Stricter checks inside `<svg>`

0.3.1 brings back [`svg` templates](/docs/views/#svg-fragments), and with them the template
rule about SVG content got stricter. The compiler, the development runtime and ESLint now
reject:

- **HTML elements inside an `<svg>`**, such as a `<button>` or an `<input>`, in `html` templates
  too. The browser would make them unknown SVG elements that render nothing. Move them out of
  the graphic, or into a `<foreignObject>`.
- **A bound namespaced attribute**, `xlink:href=${…}` or `xml:lang=${…}`. A binding can't set
  an attribute in another namespace. Bind SVG 2's plain `href=${…}` (or `lang=${…}`); static
  `xlink:href="#a"` is still fine.

An `html` template whose top level is SVG-only content (a `<path>` without an `<svg>` around
it) was already an error; its message now points to `svg`. Bound attribute names on SVG
elements take the browser's spelling, so `viewbox=${v}` binds `viewBox`.

## settled() waits until messages stop

`await settled()` now waits until messages stop arriving, not only until the scheduler is idle:
each message dispatched to a component or a store restarts a short quiet window. Chains such as
a store that notifies in a microtask, a stream that re-arms in one, or a reducer that answers
with the next command are waited for to the end. It still doesn't wait for commands that never
end (a store watch, a socket) and never waits for timers.

- **Delete `await Promise.resolve()` loops** before `settled()`. They are no longer needed.
- **A test that looked at an in-between state** ("Loading…") right after `settled()` may now
  see the final one, because a fake that answers in microtasks runs to the end first. Use a fake
  that waits for the test, assert, then answer it:

```ts
// src/loading.test-helper.ts
import { settled } from '@gyral/core';
import { fakeDriver } from '@gyral/testing';

/** Clicks, checks the loading text, then lets the fake answer and returns the final text. */
export async function loadingThenDone(
  el: HTMLElement & { drivers: Record<string, unknown> },
  button: HTMLButtonElement,
  status: HTMLElement,
): Promise<readonly [string | null, string | null]> {
  const user = fakeDriver<string, { readonly name: string }>('user'); // no impl: it waits
  el.drivers = { user };
  button.click();
  await settled();
  const loading = status.textContent; // "Loading…": the fake hasn't answered yet
  user.resolveNext({ name: 'Ada' });
  await settled();
  return [loading, status.textContent];
}
```

- **A cycle now fails the test.** When messages never stop (more than 100 flushes or busy
  turns), `settled()` rejects with an error that names the likely cycle, like the loop guard.

## The router scrolls and moves focus

After a navigation, once the new page has rendered, the browser router now scrolls to the
`#fragment` target or the top, restores the position on back and forward, and resets focus,
with or without the Navigation API (see [Scroll and focus](/docs/routing/#scroll-and-focus)).
0.3.0 did none of this on the History API path, and on the Navigation API path the browser did
it against the old page.

- **If your app scrolled or focused after navigating itself**, keep that code and turn the
  router's off: `makeRouter({ scroll: false, focusReset: false })`, or per call
  `navigate(url, { scroll: false, focusReset: false })`.
- **If it moved focus to the new heading**, keep doing it with `focus('main h1')` from the
  `Routed` reducer: focus your app moves during a navigation wins over the reset.
- **A `replace` leaves scroll and focus alone**, so keeping a search box in sync with
  `navigate('?q=…', { replace: true })` doesn't jump. Pass `scroll: true` or `focusReset: true`
  to a replace that should.
- In browsers without the Navigation API, the History API code now loads on first use, so the
  first navigation there resolves a moment later. If it can't load, navigations become full
  page loads.

## Errors go through one channel

Every failure Gyral catches in a component (`init`, a reducer, the view, a parser, a command's
mappers, a driver without `onFailure`, an element hook, a store) is now a `GyralError`, reported
once through one channel ([Error handling](/docs/error-handling/)). That changes what your tests
and logs see:

- **Failures that were only logged now reach `window`'s `error` event** through
  `reportError()`, so monitoring sees them, and so does a test runner: Vitest fails a run on
  one. In a browser test that makes a component fail on purpose, use `collectErrors()` from
  `@gyral/testing` and assert on the errors it collected. Tests that spied on `console.error`
  for these failures switch to it too.
- **A driver failure without `onFailure` is an error**, no longer a warning. Give every command
  whose failure is expected an `onFailure` that maps it to a message.
- **Nothing throws to the caller.** A throwing `init`, synchronous parser or intent reducer is
  reported with its component and phase instead of escaping, `el.send()` reports a failing
  reducer instead of throwing, and a store reducer that throws doesn't throw to the sender. A
  reducer that throws changes nothing.
- **Fixed:** a store subscriber that throws no longer keeps the other subscribers stale; an
  element hook that throws no longer skips the other hooks of that render; a failed
  `PropsChanged` is sent again with the next render.
- **`Errored` is a framework message name**, like `PropsChanged`: rename an app message that
  uses it. Devtools' `DevEvent` has a new `kind: 'error'`.
- **On the server, a failing component no longer truncates the page.** It renders its `error`
  view (or nothing) and the rest of the page is sent; pass `onError: 'throw'` to `renderPage` to
  fail the whole page instead.
- New error codes G0073 to G0078; G0031, G0040 and G0041 have new texts
  ([error codes](/errors/)).

## Exports removed from the public API

0.3.1 reviews every export before the API locks; the full list is in Gyral's
`docs/references/public-api-0.3.1.md`. These are no longer exported, and `tsc` names any you
used:

- `@gyral/core`: `StoreRegistry` and `withStoreScope` (import them from `@gyral/core/server`);
  the internals `headEntries`, `HEAD_ATTRIBUTE`, `HeadEntry`, `scriptSafeJson`, `STORE_SEND`,
  `StoreSendInput`, `STORE_SEED_ATTRIBUTE`, `warnJsonHazard`, `formFields`, `formDataToObject`,
  `intentRejectedSchema`, `runInit`, `ISLAND_ATTRIBUTE`, `devtoolsEnabled` and
  `devtoolsLiveComponents` (use the documented APIs: `Head` with `page()` and `setHead()`,
  `form()`, `submitForm()`, `validateForm()`, `step()`); `isLightComponent`, `findInScope`.
- `@gyral/core/vite`: everything but `gyralVitePreset`, `gyralTemplateCompiler`,
  `gyralClientOnly` and their option types. `@gyral/core/eslint`: the rule re-exports (use the
  plugin).
- `@gyral/router`: `capturedUrl`. `@gyral/testing`: `customElementsIn`, `undefinedElementsIn`.
  `@gyral/time`: `makeTime`, `TimeOptions`; `@gyral/time/delay`: `makeDelayTime`.
- `@gyral/devtools`, `@gyral/mcp` and `create-gyral`: only their documented entry points.

## Behavior changes

These keep compiling but behave differently. Check each against your app and its tests.

- **A parser's `undefined` declines the event.** In 0.3.0 the nearest element with an intent
  for an event took it, and a parser that returned `undefined` ended the lookup. Now a
  synchronous `undefined` passes the event to the next intent outward for the same event, within
  the component ([Declining](/docs/intent/#declining-passing-an-event-outward)). An outer intent
  can therefore receive events that an inner parser ignored: a wrapper's `keydown` intent now
  sees the keys an input's own `keydown` intent declined. If the outer intent must not see them,
  have the inner parser return a message that changes nothing, or check `event.target` in the
  outer parser. Async parsers keep the event, as before.
- **A prop that receives an equal value changes nothing.** No render and no `PropsChanged`:
  `prop.string`, `prop.number` and `prop.boolean` compare with `Object.is`, `prop.json` compares
  the `JSON.stringify` text, and `prop.value` compares with `Object.is` or its new `equals`
  option ([When a prop counts as changed](/docs/components/#when-a-prop-counts-as-changed)). A
  parent that binds a fresh but equal object to a `prop.json` prop on every render no longer
  re-renders the child. A child that relied on that render, or a test that sets an equal value
  and waits for `PropsChanged`, must change the value instead.
- **A `style` attribute written in the browser reads back as the browser serializes it**
  (`color: red;`), because Gyral now writes it through the CSSOM (see
  [inline styles](/docs/styling/#inline-styles-under-a-strict-csp)). Declarations the browser
  doesn't understand are dropped. Compare computed styles, or the value with its trailing
  semicolon.
- **Removing a component stops its commands one microtask later.** A component that is removed
  and inserted again in the same task (a keyed list reordering rows, `appendChild` of an
  attached element) is a move: its subscriptions, timers and requests keep running, where 0.3.0
  stopped them for good. A test that checks a command was aborted right after `el.remove()`
  awaits one microtask first (`await Promise.resolve()`). A component removed for real and
  attached later can re-issue its watches from the new `Connected` message
  ([Moves and reconnects](/docs/outside-state/#moves-and-reconnects)).
- **`match()` returns `path` too**, the route's canonical path: `{ name, params, path }`. A test
  that compares a whole match with `toEqual` needs the new field. Servers can redirect to it
  ([One URL per page](/docs/routing/#one-url-per-page)).

## Smaller changes tests may notice

- **Empty segments never match**: `/users//7` no longer matches `/users/:id` in browsers
  without URLPattern, as it already didn't with it. Patterns the two matchers would read
  differently (`/v:id`, `:post-id`, a param named twice) throw.
- **A parser takes a second argument**, the read-only context `{ props, state, read }`
  ([Props, state and stores in a parser](/docs/intent/#props-state-and-stores-in-a-parser)).
  Parsers with one parameter still fit, and so do direct calls of `form()`, `field()` and
  `child()`. A test that calls a parser from a spec, `SearchBox.spec.intent.Search?.(input)`,
  must now pass a context: `{ props: {}, state, read: readerOf([]) }`, with `readerOf` from
  `@gyral/testing`. `IntentParser` takes the state type as a third type parameter.

## Short error messages in production

Production builds print a code, the message's arguments and a link instead of the full text:

```text
Gyral G0010 my-cart Add https://gyral.dev/errors/#G0010
```

Development builds keep the full sentences. If your monitoring matches Gyral's message text,
match the code instead; every code is explained on the [errors page](/errors/). A hydration
mismatch keeps its sentence in production and ends with its code and link.

## If you tried a 0.3.1 prerelease

An early 0.3.1 prerelease let `defineHook` take a `dispose`. The released API is a function of
its own, so apps whose hooks need no teardown don't bundle the tracking: rename those hooks'
`defineHook` to [`defineDisposableHook`](/docs/views/#widgets-with-a-lifecycle). `defineHook`
with a `dispose` is a type error and an error in development. 0.3.0 had neither, so apps coming
from 0.3.0 have nothing to change.

The first prerelease (0.3.1-next.0) also scanned the text of every dependency for spec fields
and `raw(`, so a word in an unrelated package's comments could keep custom states or the
invoker fallback. Later builds [read less](/docs/rendering-modes/#what-the-build-reads): if a
package of yours writes spec fields but doesn't depend on Gyral, give it `@gyral/core` as a peer
dependency.

## Small cleanups

- `gyralVitePreset()` no longer returns an empty `resolve: { dedupe: [] }`, a leftover from Lit.
  Spreading the preset is unchanged; a config that read `gyralVitePreset().resolve` drops it.
- `useDefineForClassFields: false` in `tsconfig.json` is a leftover from Lit too. New apps no
  longer set it, and existing apps can remove the line.
- A package that writes `viewTransition`, `renderOnFrame` or `states` for your components but
  doesn't depend on any `@gyral/*` package: declare `@gyral/core` as a peer dependency. The build
  bundles those features only when it [sees the field](/docs/rendering-modes/#what-the-build-reads),
  and it reads only your code and packages that depend on Gyral.
- New development warnings may show up: a function in a property binding (`.onclick=${fn}`, or
  a function prop on a Gyral component), and, from ESLint's recommended config,
  `gyral/unused-intent` for intent parsers no template names.

## New in 0.3.1

- Intents: [`data-intent-on` lists](/docs/intent/#trigger-events) such as
  `"pointerdown pointerup"`, [per-event attributes](/docs/intent/#one-element-an-intent-per-event)
  `data-intent-<event>`, [declining parsers](/docs/intent/#declining-passing-an-event-outward),
  [props, state and stores in a parser](/docs/intent/#props-state-and-stores-in-a-parser),
  [intent names inferred from parser keys](/docs/intent/#intent-names-that-arent-messages),
  including names that aren't message tags, `detail` for every `CustomEvent`, and the
  [`capturePointer()`](/docs/intent/#press-and-hold) hook for press-and-hold and drag.
- Errors: [one channel](/docs/error-handling/) with a `GyralError` per failure, parent
  boundaries through a cancelable `error` event, a component's `error` view and `Errored`
  reducer, isolated failures on the server with `renderPage({ onError })`, and
  `collectErrors()` for tests.
- Components: [`shadow: { delegatesFocus: true }`](/docs/views/#focusing-into-a-child-component),
  also written by the server, [`focus(selector, { wait: true })`](/docs/views/#focusing-what-a-later-render-brings)
  for a target a later render brings, and [prop equality](/docs/components/#when-a-prop-counts-as-changed)
  with an `equals` option for `prop.json` and `prop.value`.
- [`svg` templates](/docs/views/#svg-fragments) for SVG fragments that are templates of their
  own.
- [`subscription()`](/docs/outside-state/) for state Gyral doesn't own: signals, Redux-style
  stores, XState actors, WebSocket feeds.
- [`outputs<Out>()`](/docs/components/#child-components-and-outputs), a typed `emit`, and
  [`OUTPUT_EVENT`](/docs/components/#outputs-and-other-code) with `OutputEvent` and `OutputsOf`
  for parents that aren't Gyral components.
- [Type guards in `prop.value()` and `prop.json()`](/docs/components/#objects-type-guards-and-identity),
  and production builds that drop a `prop.value` check passed by name (its schema leaves the
  bundle where the bundler allows: single-chunk builds, or a schema library not shared across
  chunks).
- [`defineDisposableHook`](/docs/views/#widgets-with-a-lifecycle), and the advice to give
  widgets with a lifecycle their own custom element.
- [Client-only builds](/docs/rendering-modes/#client-only-builds) with
  `gyralVitePreset({ clientOnly: true })`, the default in `create-gyral`'s `basic` template.
- [`@gyral/time/delay`](/docs/effects/#built-in-drivers): `delay` and `debounce` alone.
- `style` bindings and static `style="…"` attributes that work under a strict Content
  Security Policy on the client ([inline styles](/docs/styling/#inline-styles-under-a-strict-csp)).
- Router: a canonical `path` from `match()`, [scroll and focus](/docs/routing/#scroll-and-focus)
  after a navigation, with `scroll` and `focusReset` options, and the
  [head model](/docs/routing/#the-head) with `setHead()`.
- `retry(driver, policy)` with `jitter` and `retryIf`, `makeHttpDriver({ timeoutMs })` with
  `retryableHttpError`, and `csrfFromMeta` on the driver ([Effects](/docs/effects/#retries)).
- [Moves keep commands running](/docs/outside-state/#moves-and-reconnects), and the framework
  message `Connected` for a component attached again after a real removal.
- Patterns: [the element under a captured pointer](/docs/intent/#the-element-under-a-captured-pointer)
  and [telling a refused request from no change](/docs/effects/#telling-a-refused-request-from-no-change).
- Server: opt-in [hashes for server-rendered `style` attributes](/docs/server-rendering/#content-security-policy)
  (`renderPage({ csp: { styleAttributes: 'hash' } })`), and a
  [Trusted Types](/docs/server-rendering/#trusted-types) policy named `gyral`.
- Server: [hashed stylesheets](/docs/static-sites/#a-static-build) (`css` from
  `clientAssetsFromManifest`, `renderPage({ stylesheets })`, `assets(modules)` in
  `productionServer`), safer asset serving with `assetHandler`, and `toNodeListener` from
  `@gyral/ssr/node` for Node's `http` module ([Deploying](/docs/deploying/#node)), which
  passes the handler [the client's address](/docs/deploying/#the-clients-address).
  `assetHandler` answers single `Range` requests, so media can seek, and `productionServer`
  takes Vite's `base`.
- Testing: [`renderOnServer`](/docs/testing/#server-markup-on-demand) for hydration tests with
  real server markup, `outputsIn` and `focusTargetsIn`, `fakeDriver(name, run)`, drivers
  that go into `el.drivers` with no cast, and `virtualTime()` in Vitest node projects.
- [Development errors that name the template's file, line and column](/docs/views/#checked-before-it-runs),
  under Vite exactly, elsewhere from the stack trace.
- `registryVersion()` from `@gyral/core/server`: `renderPage({ csp })` now rebuilds its header
  whenever a component registers.
- Smaller bundles: view transitions, the frame lane and custom states ship only when a module
  names their spec field, and production messages are codes. Those savings pay for most of
  0.3.1's additions; error handling adds about 0.75 KiB to every app. Hello-world's first load
  is 9.3 KiB gzip (8.9 on 0.3.0; 8.2 KiB built client-only); see [Packages](/docs/packages/).

This site's islands grew a little. Their entry chunk was 13.7 KiB gzip (level 9) on 0.3.0 and
is 14.4 KiB on 0.3.1: the size work and retries leaving the command runner paid for the search
box's new debounce with `@gyral/time/delay` (0.25 KiB) and for most of 0.3.1's additions
(Trusted Types, prop equality, declining parsers), and error handling adds about 0.75 KiB. The
hydration chunk stays at about 2.8 KiB.
