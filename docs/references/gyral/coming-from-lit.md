---
title: Coming from Lit
description: Move a Lit component to Gyral's Model-View-Intent loop: explicit props, pure views, typed messages, keyed rows, drivers, stores and native hydration.
useWhen: porting a Lit component or app to Gyral, or comparing the two
section: Background
order: 3
---

# Coming from Lit

Gyral components are standard custom elements, so you can migrate one at a time alongside
your existing Lit elements. Gyral uses its own renderer. Its templates are not Lit
templates, and Lit directives do not work in them.

## A small component

In Lit, a click handler often mutates a reactive property and waits for the component's
update. In Gyral, intent names a message, a reducer returns state, and the view renders it:

```ts
// src/counter.ts
import { define, html } from '@gyral/core';

type State = { readonly count: number };
type Msg = { readonly _tag: 'Increment' };

export const Counter = define<State, Msg>()('my-counter', {
  init: () => ({ count: 0 }),
  intent: { Increment: true },
  update: { Increment: (s) => ({ count: s.count + 1 }) },
  view: (s, i) => html`
    <button type="button" data-intent=${i.Increment}>Increment</button>
    <output aria-live="polite">${s.count}</output>
  `,
});
```

There is no event closure in the template. `true` creates the tag-only message; a parser
extracts typed data for a message that needs it. Reducers and views are pure, while commands
describe work performed by drivers. `define` takes two calls: the first names the types, the
second the tag and the spec.

## Translate responsibilities

| Lit concept                         | Gyral equivalent                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `LitElement` subclass               | `define<State, Msg, Props>()(tag, spec)` returns a custom-element class                                  |
| Internal reactive fields / `@state` | Immutable model returned from `init` and `update`                                                        |
| Reactive properties / converters    | Declared `prop.string`, `number`, `boolean`, `json` or schema-validated `value`; read `ctx.props`        |
| Property-change lifecycle logic     | Optional `PropsChanged` reducer; keep external props out of state unless synchronization is needed       |
| `render()`                          | Pure `view(state, intents, ctx)` returning Gyral `html` or `svg`                                         |
| `@click=${handler}`                 | `data-intent=${i.Name}` plus a parser in `intent`                                                        |
| `repeat()`                          | `each(items, key, row, pick?)`, with pure rows and explicit changing inputs                              |
| `classMap` / `styleMap`             | Explicit attribute/CSS-variable bindings or an application helper; no matching built-in directive        |
| `live()` for controls               | Gyral's native live form bindings: `value`, `?checked`, `?selected` and textarea text                    |
| `ref()` / element work              | An explicit element hook, with a server half where markup is needed                                      |
| Reactive controller / observer      | A subscription driver for outside sources, or a lifecycle hook with `dispose` for element-owned work     |
| `@lit/task`                         | Commands, a driver, and loading/success/failure messages in the model                                    |
| `@lit/context`                      | Gyral stores listed in `stores` and read with `ctx.read(store)`, or props for parent-owned inputs        |
| `requestUpdate()`                   | Send a typed message or change a declared prop/store; no general manual update API                       |
| `updateComplete`                    | `await settled()` for the page's pending Gyral rendering                                                 |
| Lit SSR / hydration                 | `renderPage` or `renderToString` from `@gyral/ssr`, with Gyral seeds and native declarative shadow roots |

`settled()` waits for Gyral rendering and outputs, not pending network work or updates inside
a Lit element. Await those elements' own lifecycle promises separately. Props default to
kebab-case attribute names and do not automatically reflect properties back into attributes.
See [Components](/docs/components/) for validation, defaults and synchronization.

## Templates and directives

Import `html`, `svg`, `each`, `nothing` and hooks from Gyral. A template result from Lit is
not a Gyral child value. Render a Lit component by its custom-element tag instead:

```ts
// src/interop.ts
import { html } from '@gyral/core';

// Import the module defining vendor-chart separately before this template renders.
export const chart = (values: readonly number[]) =>
  html`<vendor-chart .values=${values}></vendor-chart>`;
```

Gyral's compiler checks its own template grammar. Avoid expressions in tag/attribute names,
event bindings, parser-repaired markup and promises in child holes. `each` rows cannot capture
changing state from the view; expose it through `pick`. Read [Views](/docs/views/) rather than
assuming every lit-html directive or binding rule transfers.

## Effects, styles and server rendering

Move fetches, timers and listeners out of the view. Return commands from `init`/reducers for
one-off work; use `subscriptions(state, props)` for sources that should keep running while
their inputs remain active. Gyral cancels their lanes on replacement or disconnect. The
[effects guide](/docs/effects/) shows expected failures and concurrency policies.

Move component styles into ``styles: css`...` `` or trusted CSS strings. Gyral shares native
constructable stylesheets; expose `part` names and custom properties as your public theme
contract. Existing third-party components keep their own style system.

On the server, register component definitions before rendering or use the component manifest.
Commands wait for the client; initial state, props and request-scoped stores are serialized
for hydration. Test edited controls and node identity under a production build. You can keep
Lit installed for your remaining Lit elements, but Gyral itself does not depend on it. See
[Server rendering](/docs/server-rendering/) and
[Using third-party components](/docs/third-party-components/).

For Lit's original contracts, see its official
[properties](https://lit.dev/docs/components/properties/),
[lifecycle](https://lit.dev/docs/components/lifecycle/) and
[controllers](https://lit.dev/docs/composition/controllers/) documentation.
