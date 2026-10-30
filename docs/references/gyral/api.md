---
title: API reference
description: The public API of every Gyral package, generated from the type declarations at build time so it always matches the code.
useWhen: you need to know which package exports a name, or the API reference for one package
section: Reference
order: 2
---

# API reference

Each package's page lists everything it exports, entry point by entry point: the declaration as
written in the source (function bodies left out) and its documentation comment. The pages are
generated from the packages this site is built with, every time it's built, so they can't drift
from the code.

> **Writing code? Start from working code, not from the reference.** [Recipes](/docs/recipes/)
> has a task list with filters and a signup form, with their tests, and [Forms](/docs/forms/)
> opens with a complete validated form. Adapt the closest one and check it; come here to look up
> a name an example or a compiler error shows you. Most of the types are inferred, so you rarely
> write them yourself.

| Package                                  | What's in it                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| [`@gyral/core`](/docs/api/core/)         | `define`, commands, subscriptions, stores, forms, the view layer; Vite, ESLint |
| [`@gyral/http`](/docs/api/http/)         | `get`, `request`, `submitForm`, the `http` driver; `fakeHttp` for tests        |
| [`@gyral/router`](/docs/api/router/)     | `routes`, `listen`, `navigate`, `setHead`, `makeRouter`                        |
| [`@gyral/time`](/docs/api/time/)         | `delay`, `debounce`, `every`                                                   |
| [`@gyral/ssr`](/docs/api/ssr/)           | `renderPage`, `formAction`, CSP; static generation, Node adapter, dev server   |
| [`@gyral/testing`](/docs/api/testing/)   | `step`, `run`, `mount`, `parse`, fake drivers, virtual time, `mountSsr`        |
| [`@gyral/devtools`](/docs/api/devtools/) | `mountDevtools` and the panel                                                  |

`@gyral/mcp` (an MCP server for coding agents) and `create-gyral` (the app scaffolder) aren't
in this reference; [Packages](/docs/packages/) describes them.

## Reading the reference

- **Types are the contract.** A component is `define<State, Msg, Props, Output>()(tag, spec)`;
  `ComponentSpec` in `@gyral/core` describes every field of `spec`.
- **Helper types are exported.** `Reducer`, `Variant`, `ParseResult` and `StandardSchemaV1`
  (type-only) are the types `Update`, `IntentParser` and the form helpers are
  built from, so a reducer or parser written outside a spec can be typed without copying
  Gyral's definitions.
- **Functions return data.** Command helpers such as `get`, `delay` and `navigate` return a
  `Command`, which does nothing until a reducer returns it.
- **The view layer is Gyral's own.** `html`, `css`, `each`, `keyed`, `raw`, `defineHook` and
  `nothing` are documented with the rest of `@gyral/core`; `@gyral/core/vite` is `gyral()`, the Vite
  plugins, and `@gyral/core/eslint` the lint rules. Server rendering is `@gyral/ssr`.

The guides explain how the pieces fit together: start with [Components](/docs/components/).
