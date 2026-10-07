---
title: Migrating from 0.3.0 to 0.3.1
description: Move a Gyral 0.3.0 app to 0.3.1 - stricter svg checks, a settled() that waits for message chains, short production errors - and what's new.
section: Reference
order: 3
---

# Migrating from 0.3.0 to 0.3.1

Gyral 0.3.1 is a patch release: nothing was removed, and most apps update by moving every
`@gyral/*` package to 0.3.1 together (they share one version). Three changes can make a working
app fail a check or a test, so read those first. Everything else is new API and smaller bundles.

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
- [Development errors that name the template's file, line and column](/docs/views/#checked-before-it-runs),
  under Vite exactly, elsewhere from the stack trace.
- `registryVersion()` from `@gyral/core/server`: `renderPage({ csp })` now rebuilds its header
  whenever a component registers.
- Smaller bundles: view transitions, the frame lane and custom states ship only when a module
  names their spec field, and production messages are codes. Hello-world's first load went
  from 8.9 to 8.4 KiB gzip (7.4 KiB built client-only); see [Packages](/docs/packages/).

This site's islands moved too. Their entry chunk was 13.7 KiB gzip (level 9) on 0.3.0 and is
13.5 KiB on 0.3.1, although the search box now debounces with `@gyral/time/delay`, which added
0.25 KiB; the hydration chunk stays at 2.8 KiB.
