---
title: Migrating from 0.3.0 to 0.3.1
description: Move a Gyral 0.3.0 app to 0.3.1 - the two-call define, subscriptions, drivers, the head model, server rendering, forms, errors, a smaller API - and what's new.
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

## Long-running work goes in `subscriptions`

Work that runs while a condition holds (a clock, polling, a socket, a store watch, the router's
`listen`) moves out of `init` and reducers into a new spec field,
[`subscriptions(state, props)`](/docs/update/#subscriptions), which returns the commands that
should be running. Gyral starts, restarts and stops them as state and props change:

```text
init: () => [s0, [listen(toMsg)]]              →  init: () => s0, subscriptions: () => [listen(toMsg)]
PropsChanged reducer that restarts a watch     →  subscriptions: (s, p) => [watch(p.id)]
periodic(1000, (ticks) => msg)                 →  every(1000, (now) => msg)
```

- **`periodic` is replaced by `every`**, which sends `Date.now()` at once and then every `ms`.
- **The `Connected` message from the prereleases is gone.** A component attached again after a
  real removal starts its subscriptions again on its own.

## Drivers: one override rule

- **The spec's `drivers` field is removed.** Provide drivers once, at the app's entry or a
  subtree: `provideDrivers(document.body, { router: makeRouter({ captureLinks: true }) })`, or
  `el.drivers` for one element ([Substituting drivers](/docs/effects/#substituting-drivers)).
- **A driver with no implementation of its own is a token**: `defineDriver<I, O, E>('session')`.
  It resolves from what an ancestor provides; nothing providing it is a clear error. Replace
  placeholder drivers that threw, and drop the `as AnyDriver` casts
  ([Drivers the app provides](/docs/effects/#drivers-the-app-provides)).
- **`command(driver, input)` needs no handlers** for fire-and-forget work, and with handlers the
  message type is inferred: `command<string, void, unknown, Msg>(log, line, { onSuccess: () =>
undefined })` becomes `command(log, line)`.
- **A parser that only sends its tag** can be written `true` (`intent: { Clear: true }`), and a
  component without messages leaves out `intent` and `update`. Nothing breaks if you don't.

## Server rendering

- **`page()` and `renderToStream()` are gone**: `renderPage(options)` takes the same options;
  for a string, `await renderPage(options).text()`.
- **`@gyral/core/server` is internal.** `renderToString` and `styleHashes` come from
  `@gyral/ssr`.
- **`clientAssets` and `clientEntryFromManifest`** are folded into
  `clientAssetsFromManifest(path, entry)` (`.entry` is the entry's URL). `cacheHeaders` and
  `staticFileFor` are gone: `productionServer` and `assetHandler` set cache headers.
- **Components can load themselves.** `gyralVitePreset({ components: true })` plus
  `renderPage({ components })` replaces a client entry that imports every island and per-page
  flags ([Loading components](/docs/server-rendering/#loading-components-in-the-browser)).
  `gyralDevServer()` from `@gyral/ssr/node` replaces a hand-written development server.
- **`productionServer` hands `createApp` `components`**, and `clientEntry` may be `undefined`
  when a build has no entry of its own.

## Forms

- **Secret fields are never echoed.** Fields named like `password`, and any listed in
  `defineForm(schema, { secret: [...] })`, are left out of `IntentRejected.values` and of the
  re-filled form. Delete hand-written redaction; list card numbers and similar fields in
  `secret` ([Forms](/docs/forms/#one-schema-for-both-sides)).
- **`validateForm(definition, …)` and `formValues(definition, …)` are methods**:
  `definition.validate(data)` and `definition.values(data)`.
- **`redirectedTo` moved to `@gyral/http`**, next to `submitForm`.

## Views, hooks and outputs

- **Boolean attributes need `?`.** `selected=${bool}`, `checked=${…}`, `disabled=${…}` and the
  rest of HTML's boolean attributes are template errors; write `?selected=${bool}`.
- **Hooks run after the whole render, children first**, so a parent hook sees its rendered
  children. `defineHook({ update: 'always' })` runs on every render.
- **Outputs reach only the direct parent.** Once the parent's `child()` intent takes an output,
  it goes no further, and content slotted into a child belongs to the component that wrote it. A
  parent that relied on a grandchild's outputs listens on the child instead.
- **`emit` is no longer exported**: `const emit = outputs<Out>()`.
- **One-item lists that only re-create an element** can become `keyed(key, template)`.

## Testing

- **`withDrivers(root, drivers)`** is `provideDrivers(root, drivers)` from `@gyral/core`, or
  `mount(Component, { drivers })`.
- **`readerOf`** is `parse(Component, intent, input, { props, state, stores })`.
- **`testStore(store, initial)`** is `store.instance(initial)`, and **`sentTo(commands, store)`**
  is `inputsFor(commands, store)`.
- **`@gyral/testing/arbitraries` is gone**: write fast-check arbitraries for your messages
  directly.

## Removed helpers

Each is a few lines of your own now; the docs show the recipe:

- `random`, `randomInt`, `randomDriver`, `toInt`: a random driver ([Writing a driver](/docs/effects/#writing-a-driver)).
- `capturePointer`: an element hook ([Press and hold](/docs/intent/#press-and-hold)).
- `labelledBy`: name the form from a prop, or set `ariaLabelledByElements` in a hook.
- `back`, `forward`, `go`: `command(router, { _tag: 'Traverse', delta: -1 })`.
- `animationFrames`, and `@gyral/time/delay` (import `delay` and `debounce` from `@gyral/time`;
  a delay-only app stays the same size).
- The `events` spec field: write `data-intent-<event>=${i.Name}`, which is always listened for.
- `gyralTemplateCompiler` and `gyralClientOnly`: `gyralVitePreset({ compiler, clientOnly })`.

## The head model

The page's head is one `Head` value, used by the server and the router alike
([The head](/docs/routing/#the-head)):

- **`setTitle(title)` is removed.** Return `setHead({ title })`, or better
  `setHead(pageHead(route))` with the same function the server uses, from your `Routed`
  reducer. A router fake's `{ _tag: 'Title' }` input is `{ _tag: 'Head', head }`, and
  `snapshot().title` is `snapshot().head?.title`.
- **`page({ head })` is `renderPage({ extraHead })`.** Move the description, canonical, robots,
  Open Graph meta (with `media` where needed), alternates and JSON-LD into the `Head` fields
  `renderPage()` now takes; keep in `extraHead` only what the head model doesn't manage. Managed elements, the
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

- `@gyral/core`: `StoreRegistry` and `withStoreScope` (`renderPage({ stores })` uses them for you);
  the internals `headEntries`, `HEAD_ATTRIBUTE`, `HeadEntry`, `scriptSafeJson`, `STORE_SEND`,
  `StoreSendInput`, `STORE_SEED_ATTRIBUTE`, `warnJsonHazard`, `formFields`, `formDataToObject`,
  `intentRejectedSchema`, `runInit`, `ISLAND_ATTRIBUTE`, `devtoolsEnabled` and
  `devtoolsLiveComponents` (use the documented APIs: `Head` with `renderPage()` and `setHead()`,
  `form()`, `submitForm()`, `definition.validate()`, `step()`); `isLightComponent`,
  `findInScope`; the constants `STORES_ELEMENT`, `DRIVERS_ELEMENT`, `LIGHT_ATTRIBUTE`,
  `DEVTOOLS_GLOBAL`, `invokersSupported`, `jsonHazard`, `HydrationMismatch`; the devtools
  protocol types.
- `@gyral/core/vite`: everything but `gyralVitePreset` and its option types.
  `@gyral/core/eslint`: the rule re-exports (use the plugin).
- `@gyral/router`: `capturedUrl`. `@gyral/testing`: `customElementsIn`, `undefinedElementsIn`.
  `@gyral/time`: `makeTime`, `TimeOptions`.
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
  attached later starts its subscriptions again
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
  call it through `parse(SearchBox, 'Search', input, { state })` from `@gyral/testing` instead.
  `IntentParser` takes the state type as a third type parameter.

## Short error messages in production

Production builds print a code, the message's arguments and a link instead of the full text:

```text
Gyral G0010 my-cart Add https://gyral.dev/errors/#G0010
```

Development builds keep the full sentences. If your monitoring matches Gyral's message text,
match the code instead; every code is explained on the [errors page](/errors/). A hydration
mismatch keeps its sentence in production and ends with its code and link.

## If you tried a 0.3.1 prerelease

The prereleases moved some APIs more than once. Where you used one, the released form is:

- `defineDisposableHook` (next.1 to next.6): `defineHook({ client, dispose })`.
- `IntentName<'…'>` (next.2, next.3): parser keys ([above](#define-takes-two-calls)).
- `Connected` (next.5, next.6): [`subscriptions`](#long-running-work-goes-in-subscriptions).
- `capturePointer` and `cssVars`: recipes.

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
  including names that aren't message tags, `true` for parsers that only send their tag,
  `detail` for every `CustomEvent`, and [press-and-hold](/docs/intent/#press-and-hold) with
  pointer capture.
- Effects: [`subscriptions`](/docs/update/#subscriptions) and `every`, typed
  [driver tokens](/docs/effects/#drivers-the-app-provides), commands without handlers, and
  `call(selector, method)` for [methods on elements](/docs/views/#calling-a-method-on-an-element).
- Errors: [one channel](/docs/error-handling/) with a `GyralError` per failure, parent
  boundaries through a cancelable `error` event, a component's `error` view and `Errored`
  reducer, isolated failures on the server with `renderPage({ onError })`, and
  `collectErrors()` for tests.
- Components: [`shadow: { delegatesFocus: true }`](/docs/views/#focusing-into-a-child-component),
  also written by the server, [`focus(selector, { wait: true })`](/docs/views/#focusing-what-a-later-render-brings)
  for a target a later render brings, and [prop equality](/docs/components/#when-a-prop-counts-as-changed)
  with an `equals` option for `prop.json` and `prop.value`; `keyed()`;
  [`?modal` and `?popover-open`](/docs/views/#dialogs-and-popovers); hooks that run children
  first, with `update: 'always'`; outputs that reach only the direct parent; generated element
  typings; and a template error for boolean attributes bound without `?`.
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
- [`defineHook` with `dispose`](/docs/views/#widgets-with-a-lifecycle), and the advice to give
  widgets with a lifecycle their own custom element.
- [Client-only builds](/docs/rendering-modes/#client-only-builds) with
  `gyralVitePreset({ clientOnly: true })`, the default in `create-gyral`'s `basic` template.
- `style` bindings and static `style="…"` attributes that work under a strict Content
  Security Policy on the client ([inline styles](/docs/styling/#inline-styles-under-a-strict-csp)).
- Router: a canonical `path` from `match()`, [scroll and focus](/docs/routing/#scroll-and-focus)
  after a navigation, with `scroll` and `focusReset` options, and the
  [head model](/docs/routing/#the-head) with `setHead()`.
- `retry(driver, policy)` with `jitter` and `retryIf`, `makeHttpDriver({ timeoutMs })` with
  `retryableHttpError`, and `csrfFromMeta` on the driver ([Effects](/docs/effects/#retries)).
- [Moves keep commands running](/docs/outside-state/#moves-and-reconnects).
- Forms: secret fields never echoed, and `definition.validate()` / `definition.values()`.
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
  takes Vite's `base`. [Components that load themselves](/docs/server-rendering/#loading-components-in-the-browser),
  [`gyralDevServer()`](/docs/server-rendering/#development-server),
  `renderPage({ headScripts })`, `media` on head entries, `wantsJson` and
  `productionServer({ onResponse })`.
- Testing: [`renderOnServer`](/docs/testing/#server-markup-on-demand) for hydration tests with
  real server markup, [`mount()`](/docs/testing/#browser-tests) and `parse()`,
  `subscriptionsFor`, `outputsIn` and `focusTargetsIn`, `fakeDriver(name, run)`, drivers that
  go into `el.drivers` with no cast, and `virtualTime()` in Vitest node projects.
- [Development errors that name the template's file, line and column](/docs/views/#checked-before-it-runs),
  under Vite exactly, elsewhere from the stack trace.
- `renderPage({ csp })` rebuilds its header whenever a component registers.
- Smaller bundles: view transitions, the frame lane and custom states ship only when a module
  names their spec field, and production messages are codes. Those savings pay for most of
  0.3.1's additions; error handling adds about 0.75 KiB to every app. Hello-world's first load
  is 9.3 KiB gzip (8.9 on 0.3.0; 8.2 KiB built client-only); see [Packages](/docs/packages/).

This site now loads each island on its own pages only, with `components`. On 0.3.0 one entry
chunk carried both islands, 13.7 KiB gzip (level 9). On 0.3.1 the home page loads the counter
with the shared core and the loader, 12.4 KiB, and the search page the search box, 14.6 KiB
(its debounce is new). The hydration chunk stays at about 2.8 KiB, and docs pages still load
no island code.
