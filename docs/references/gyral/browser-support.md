---
title: Browser support
description: Gyral targets Baseline widely available browser features, with explicit fallbacks and progressive enhancement for newer platform APIs.
section: Reference
order: 3
---

# Browser support

Shipped browser code targets **Baseline widely available**: features supported across the
major browser engines for at least 30 months. The repository uses the Browserslist query
`baseline widely available`; compatibility lint checks JavaScript and CSS. This is a moving
feature floor, not a promise to support one permanently fixed browser version.

Custom elements, Shadow DOM, template cloning, constructable stylesheets and declarative
shadow roots are part of that floor. Gyral renders with these native primitives. Node 24+
is the repository's server/build target; browser support and server-runtime support are
separate questions.

## What happens without newer APIs

| Native enhancement      | Baseline behavior                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `URLPattern`            | A constrained literal/parameter matcher with the same supported patterns                |
| Navigation API          | Lazy History API implementation, popstate and link capture                              |
| `command`/`commandfor`  | Lazy component-scoped command shim                                                      |
| `moveBefore()`          | `insertBefore()`; test focus-sensitive moves in your app                                |
| `requestIdleCallback()` | A short timer releases the island                                                       |
| `startViewTransition()` | Ordinary rendering; reduced motion also skips the transition                            |
| `:state()`              | State enhancement is skipped; keep meaning in markup and ARIA                           |
| Popover API             | Model-driven toggling is skipped; provide an accessible inline alternative where needed |
| The `gyral` HTML policy | Ordinary string parsing when the API is absent                                          |

Gyral never installs a global browser polyfill. Substantial fallbacks are internal modules
loaded when needed; small fallbacks stay beside the native call. Capability checks for Node
or workers, such as the absence of animation frames, remain even as browser support improves.

## Removal dates

These dates follow the `web-features` 3.35.0 snapshot in
[ADR 0003](https://github.com/gyraljs/gyral/blob/next/docs/design-docs/0003-browser-baseline.md),
adding 30 months to newly available. They are scheduled review points, not claims that the
fallback has already been removed:

| Primitive                 | Widely available date |
| ------------------------- | --------------------- |
| `Promise.withResolvers()` | 2026-09-05            |
| `AbortSignal.any()`       | 2026-09-19            |
| `AbortSignal.timeout()`   | 2026-10-18            |
| Custom states             | 2026-11-17            |
| Popover                   | 2027-07-27            |
| `URLPattern`              | 2028-03-15            |
| View Transitions          | 2028-04-14            |
| Invoker commands          | 2028-06-12            |
| Navigation API            | 2028-07-13            |
| Trusted Types             | 2028-08-24            |

`moveBefore()` and `requestIdleCallback()` have no Baseline removal date in that snapshot.
The [native-first audit](https://github.com/gyraljs/gyral/blob/next/docs/references/native-first-audit-2026-10-11.md)
records why cancellable and virtual-time timers remain useful even when native timeout
signals become widely available.

## Your application's features

Feature-detect newer JavaScript APIs and keep a working experience when they are absent.
Guard newer CSS with `@supports`, preserving an accessible baseline layout. Do not make
essential labels, errors or interactions depend on a skipped enhancement. Check current
[Baseline data](https://web.dev/baseline) before choosing a new primitive, and test your actual
minimum browser versions.

SSR mounting in `@gyral/testing` uses `setHTMLUnsafe()` to reproduce declarative shadow roots,
so choose a test browser that supports it. The repository runs real Chromium tests in
development and production configurations. Those tests are not evidence that every app flow
has also been tested in Firefox or Safari.
