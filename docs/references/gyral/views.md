---
title: Views
description: Views are pure functions from state to html templates. Name intents, render keyed lists, bind form state, and let the compiler check markup.
section: Guides
order: 4
---

# Views

A **view** is a function from state to HTML. It receives the state, the typed intent names
`i`, and the context `{ props, read }`, and returns an `html` template. It has no other inputs
and no side effects, so the same state always renders the same markup, on the server and in the
browser.

```ts
// src/profile.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly editing: boolean;
  readonly name: string;
}

export type Msg = { readonly _tag: 'Edit' } | { readonly _tag: 'Save'; readonly name: string };

export const Profile = define<State, Msg>('my-profile', {
  init: () => ({ editing: false, name: 'Ada' }),
  intent: {
    Edit: () => ({ _tag: 'Edit' }),
    Save: ({ formData }) => {
      const name = formData?.get('name');
      return typeof name === 'string' ? { _tag: 'Save', name } : undefined;
    },
  },
  update: {
    Edit: (s) => ({ ...s, editing: true }),
    Save: (_s, m) => ({ editing: false, name: m.name }),
  },
  view: (s, i) => html`
    <h2>${s.name}</h2>
    ${
      s.editing &&
      html`<form data-intent=${i.Save}>
        <label for="name">Name</label>
        <input id="name" name="name" autocomplete="name" value=${s.name} required />
        <button>Save</button>
      </form>`
    }
    <button type="button" data-intent=${i.Edit} ?hidden=${s.editing}>Edit name</button>
  `,
});
```

## Templates

Everything a view needs comes from `@gyral/core`: `html`, `css`, `nothing`, `each`, `raw` and
`defineHook`. Gyral renders with its own small view layer, built for this one job: no virtual
DOM, no runtime dependencies. A template is prepared once per call site. After that a render
only compares each `${…}` with the value it wrote last time and touches the DOM where they
differ.

| Binding                     | Sets                                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| `${value}`                  | Text content (escaped), a nested template, a list, or nothing            |
| `attr=${value}`             | An attribute; `null`, `undefined` and `nothing` remove it                |
| `class="card ${s.kind}"`    | An attribute built from several pieces (quote it)                        |
| `?attr=${bool}`             | A boolean attribute, present or absent                                   |
| `.prop=${value}`            | A property: props of a child Gyral component, such as objects and arrays |
| `<input ${hook(…)}>`        | An [element hook](#element-hooks) on that element                        |
| `<textarea>${v}</textarea>` | The textarea's value (see [Form state](#form-state))                     |

In a text position, `false`, `null`, `undefined` and `nothing` render nothing, so
``${s.open && html`…`}`` works. Classes and inline styles are plain strings:
`class=${s.done ? 'done' : ''}`. Inline `<svg>` works inside `html`, so icons need nothing
special.

Whitespace is normalized once per template, the same way on the server and in the browser:
indentation between block-level tags disappears, and a run of whitespace between inline
elements becomes one space. `<pre>` and `<textarea>` keep theirs. Exact whitespace belongs in
`<pre>` or in a value.

## No event handlers

There is no `@click=${…}` binding, and a template that tries one doesn't compile. Views name an
[intent](/docs/intent/) with `data-intent=${i.Edit}` and let the intent layer read the event.
Everything a view needs to express, such as "this button means Edit, for item 42", fits in
markup: the intent name and the button's `value`.

## Checked before it runs

Templates are static, so their mistakes can be found before anyone loads the page. One set of
rules runs in three places, with the same messages:

- **`vite build`**, through `gyralVitePreset()`: every template is checked and precompiled, and a
  mistake fails the build with a code frame. Precompiled templates also leave the code that
  prepares templates at runtime out of your bundle. With the optional `parse5` package
  installed, the compiler also compares each template with what a full HTML parser builds.
- **The development runtime** (the dev server and tests) checks each template the first time it
  renders and throws with the same message.
- **ESLint**, in your editor, with `@gyral/core/eslint`:

```js
// eslint.config.js
import gyral from '@gyral/core/eslint';

export default [
  // …your other configs (typescript-eslint, …)
  { files: ['src/**/*.ts'], ...gyral.configs.recommended },
];
```

The rules catch what would otherwise break quietly: an event binding, a `.value=` on a form
control, a self-closing `<my-el />` (HTML ignores the slash, so the element swallows what
follows it), an unquoted `class=a${b}`, markup the browser would repair (a `<tr>` directly in a
`<table>`, a `<div>` inside a `<p>`), a `${…}` inside `<script>` or `<style>`, and a list row
that reads the view's variables. Each message says what to write instead.

## Use the right element

Views are where accessibility is decided, and semantic HTML gets you most of it for free:

- A `<button>` for actions, an `<a href>` for navigation, a `<form>` for anything submitted.
- A `<label for>` for every control, `<output>` for computed values, `<fieldset>` and
  `<legend>` for groups.
- Landmarks (`<header>`, `<main>`, `<nav>`, `<search>`) and a sensible heading order.
- Native `<dialog>`, `popover` and `<details>` instead of hand-built widgets.

Forms with a real `action` and `method` keep working before JavaScript loads. See
[Forms](/docs/forms/).

## Lists

Render a list with `each(items, key, row, pick?)`. The key ties each row, and any child
component in it, to its item, so reordering moves elements instead of rewriting them.

A row re-renders only when its item or its `pick` result changes, and is skipped otherwise.
That makes long lists cheap, and it has one rule: **a row reads only its arguments and
module-level values.** Name intents with a module-level `intents<Msg>()`, the same names the view
gets as `i`, and pass anything else from the view, such as the selection, through `pick`:

```ts
// src/todos.ts
import { define, each, html, intents } from '@gyral/core';

export interface Todo {
  readonly id: number;
  readonly text: string;
  readonly done: boolean;
}

export interface State {
  readonly todos: readonly Todo[];
  readonly selected: number;
}

export type Msg =
  | { readonly _tag: 'Toggle'; readonly id: number }
  | { readonly _tag: 'Select'; readonly id: number };

// The intent names as a module constant, so rows can use them and stay pure.
const i = intents<Msg>();

// A row: reads only its item, what `pick` returned, and module constants.
const Row = (todo: Todo, selected: boolean) =>
  html`<li class=${selected ? 'selected' : ''}>
    <label>
      <input type="checkbox" value=${todo.id} ?checked=${todo.done} data-intent=${i.Toggle} />
      ${todo.text}
    </label>
    <button type="button" value=${todo.id} data-intent=${i.Select}>Select</button>
  </li>`;

const idOf = (value: string | undefined): number | undefined => {
  const id = Number(value);
  return Number.isInteger(id) ? id : undefined;
};

export const Todos = define<State, Msg>('my-todos', {
  init: () => ({ todos: [{ id: 1, text: 'Write docs', done: false }], selected: 1 }),
  intent: {
    Toggle: ({ value }) => {
      const id = idOf(value);
      return id === undefined ? undefined : { _tag: 'Toggle', id };
    },
    Select: ({ value }) => {
      const id = idOf(value);
      return id === undefined ? undefined : { _tag: 'Select', id };
    },
  },
  update: {
    Toggle: (s, m) => ({
      ...s,
      todos: s.todos.map((t) => (t.id === m.id ? { ...t, done: !t.done } : t)),
    }),
    Select: (s, m) => ({ ...s, selected: m.id }),
  },
  view: (s) => html`
    <ul aria-label="Todos">
      ${each(
        s.todos,
        (todo) => todo.id,
        Row,
        (todo) => todo.id === s.selected,
      )}
    </ul>
  `,
});
```

When the selection moves, `pick` runs for every row (one comparison each), and only the two
rows whose answer changed render again. `pick` results are compared one level deep, so returning
a small tuple or object is fine.

- Keys are unique strings or numbers. A duplicate key is an error in development.
- The ESLint rule `gyral/each-row-purity` names any variable a row reads from the view and
  tells you to move it into `pick`.
- Plain arrays still render, by position: ``${s.tags.map((t) => html`<li>${t}</li>`)}`` is fine
  for a short list that never reorders.
- To get a fresh element when an id changes, for example to restart a CSS animation, render a
  one-item list: `each([s.run], (run) => run.id, Run)`.

## Form state

Each piece of form state has one spelling, and it means the same on the server and in the
browser:

| Control                 | Write                                        |
| ----------------------- | -------------------------------------------- |
| Text-like `<input>`     | `value=${s.text}`                            |
| Checkbox or radio       | `?checked=${s.on}`                           |
| Indeterminate checkbox  | `?indeterminate=${s.some}`                   |
| `<option>`              | `?selected=${s.size === 'm'}`                |
| `<details>`, `<dialog>` | `?open=${s.open}`                            |
| `<textarea>`            | `<textarea name="note">${s.note}</textarea>` |

A binding writes the control only when the model's value for it changes. Then the model wins,
even after the user has edited the control (the view compares with what the control shows now
and writes only if they differ). A render for any other reason, such as another field's
message or a reducer that refused the edit, leaves what the user typed or toggled alone. On the
server the bindings write the attribute, so the page is right before JavaScript loads, and
hydration keeps what the user typed before scripts ran until the model's value changes.

To put a control back after a refused edit, change the model: clamp or normalize to a value
that differs from the one rendered last, or re-create the form with a key. Keep a counter in
the state, bump it on reset, and render the fields as a one-item list,
`each([s], (x) => x.formKey, (x) => fields(x))`: the new key brings fresh elements with the
model's values. `form.reset()` is no substitute; it restores the first values, not the model's.

Never bind form state as a property (`.value=`, `.checked=`): the server can't write a
property, so the page would arrive empty. The compiler rejects it. A checkbox's `value` and a
`<button value>` are submitted values, not state, so they're plain attributes.

## Element hooks

A hook is a small behaviour attached to the element it sits on, written inside the start tag.
Core ships two:

- **`invalid(errors)`** mirrors model errors into native validity (`setCustomValidity` and
  `aria-invalid`). See [Forms](/docs/forms/).
- **`labelledBy('page-title')`** names a form or region after a heading outside the component's
  shadow root, which `aria-labelledby` can't reach on its own.

Write your own with `defineHook`. `client(el, args, prev)` runs after the render whenever the
arguments change (`prev` is `undefined` the first time). An optional `server(args)` returns
attributes for the server-rendered start tag, so the page is right before scripts run. A hook
acts only on its own element:

```ts
// src/steps.ts
import { define, defineHook, html } from '@gyral/core';

/** Marks the current step, and scrolls it into view when it becomes current. */
export const currentStep = defineHook<[active: boolean]>({
  // The server writes the attribute into the start tag, so it's there before scripts run.
  server: ([active]) => (active ? { 'aria-current': 'step' } : {}),
  client: (el, [active], prev) => {
    if (active) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
    if (active && prev !== undefined && !prev[0]) el.scrollIntoView({ block: 'nearest' });
  },
});

export interface State {
  readonly current: number;
}

export type Msg = { readonly _tag: 'Next' };

export const Steps = define<State, Msg>('my-steps', {
  init: () => ({ current: 0 }),
  intent: { Next: () => ({ _tag: 'Next' }) },
  update: { Next: (s) => ({ current: (s.current + 1) % 3 }) },
  view: (s, i) => html`
    <ol>
      <li ${currentStep(s.current === 0)}>Choose</li>
      <li ${currentStep(s.current === 1)}>Pay</li>
      <li ${currentStep(s.current === 2)}>Done</li>
    </ol>
    <button type="button" data-intent=${i.Next}>Next step</button>
  `,
});
```

## Trusted markup with raw()

`raw(markup)` renders a string as HTML: Markdown you converted at build time, highlighted code,
a JSON-LD script. Use it only for markup your own code produced, never for user input. It
belongs mostly on the server: in a component that renders in the browser, every change parses
the string again, and development mode warns about it. This site renders every docs page with
`raw()` inside a server-only template.

## Focus is a command

Moving focus is a side effect, so it comes from `update`, not the view. `focus(selector)`
focuses the first match in the component once the update has rendered, so it can target an
element the same update creates:

```ts
// src/pager.ts
import { define, focus, html } from '@gyral/core';

export interface State {
  readonly page: number;
}

export type Msg = { readonly _tag: 'Next' };

export const Pager = define<State, Msg>('my-pager', {
  init: () => ({ page: 1 }),
  intent: { Next: () => ({ _tag: 'Next' }) },
  update: {
    // Move focus to the new page's heading, as a screen reader user would expect.
    Next: (s) => [{ page: s.page + 1 }, [focus('h2', { preventScroll: true })]],
  },
  view: (s, i) => html`
    <h2 tabindex="-1">Page ${s.page}</h2>
    <button type="button" data-intent=${i.Next}>Next page</button>
  `,
});
```

Headings aren't focusable by default, hence `tabindex="-1"`.

## View transitions

Return `true` from the optional `viewTransition(prev, next, msg)` spec field to render that
change inside a [View Transition](https://developer.mozilla.org/docs/Web/API/View_Transition_API):
a route change, a list that reorders. Gyral skips it where the browser has no support or the
visitor asked for reduced motion, and the animation itself is CSS.

## When the DOM updates

Reducers run as soon as a message arrives; the DOM updates in a microtask, once for all the
messages that arrived together, parents before children. In a test, `await settled()` waits
until every component has rendered. See [Testing](/docs/testing/).

## Pure means repeatable

Because a view only reads its arguments, the server can render it, the browser can hydrate the
same markup without changes, and a test can render a state and inspect it. If a view needs the
time, a random number or a measurement, put it in state through a
[command](/docs/effects/) first.
