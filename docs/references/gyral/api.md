---
title: API reference
description: The public API of every Gyral package, generated from the type declarations at build time so it always matches the code.
section: Reference
order: 2
---

# API reference

Each package's page lists everything it exports, entry point by entry point: the declaration as
written in the source (function bodies left out) and its documentation comment. The pages are
generated from the packages this site is built with, every time it's built, so they can't drift
from the code.

| Package                                  | What's in it                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| [`@gyral/core`](/docs/api/core/)         | `define`, commands, stores, forms, the view layer; server, Vite and ESLint     |
| [`@gyral/http`](/docs/api/http/)         | `get`, `request`, `submitForm`, the `http` driver; `fakeHttp` for tests        |
| [`@gyral/router`](/docs/api/router/)     | `routes`, `listen`, `navigate`, `setTitle`, `makeRouter`                       |
| [`@gyral/time`](/docs/api/time/)         | `delay`, `debounce`, `periodic`, `animationFrames`                             |
| [`@gyral/ssr`](/docs/api/ssr/)           | `renderPage`, `page`, `contentSecurityPolicy`, `formAction`; static generation |
| [`@gyral/testing`](/docs/api/testing/)   | `step`, `run`, fake drivers, virtual time, `mountSsr`, `hydrated`; arbitraries |
| [`@gyral/devtools`](/docs/api/devtools/) | `mountDevtools` and the panel                                                  |

## Reading the reference

- **Types are the contract.** A component is `define<State, Msg, Props, Output>(tag, spec)`;
  `ComponentSpec` in `@gyral/core` describes every field of `spec`.
- **Functions return data.** Command helpers such as `get`, `delay` and `navigate` return a
  `Command`, which does nothing until a reducer returns it.
- **The view layer is Gyral's own.** `html`, `css`, `each`, `raw`, `defineHook` and `nothing`
  are documented with the rest of `@gyral/core`; `@gyral/core/server` is the server renderer,
  `@gyral/core/vite` the preset and template compiler, `@gyral/core/eslint` the template rules.

The guides explain how the pieces fit together: start with [Components](/docs/components/).
