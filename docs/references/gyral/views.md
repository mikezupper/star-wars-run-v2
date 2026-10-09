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

export const Profile = define<State, Msg>()('my-profile', {
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

Everything a view needs comes from `@gyral/core`: `html`, `svg`, `css`, `nothing`, `each`,
`raw`, `defineHook` and `defineDisposableHook`. Gyral renders with its own small view layer, built for this one job: no virtual
DOM, no runtime dependencies. A template is prepared once per call site. After that a render
only compares each `${…}` with the value it wrote last time and touches the DOM where they
differ.

| Binding                     | Sets                                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| `${value}`                  | Text content (escaped), a nested template, a list, or nothing            |
| `attr=${value}`             | An attribute; `null`, `undefined` and `nothing` remove it                |
| `class="card ${s.kind}"`    | An attribute built from several pieces (quote it)                        |
| `?attr=${bool}`             | A boolean attribute, present or absent                                   |
| `.prop=${value}`            | A property: data for a child Gyral component, such as objects and arrays |
| `<input ${hook(…)}>`        | An [element hook](#element-hooks) on that element                        |
| `<textarea>${v}</textarea>` | The textarea's value (see [Form state](#form-state))                     |

In a text position, `false`, `null`, `undefined` and `nothing` render nothing, so
``${s.open && html`…`}`` works. Classes and inline styles are plain strings:
`class=${s.done ? 'done' : ''}`, `style="--w: ${s.width}px"` (under a strict Content Security
Policy, see [inline styles](/docs/styling/#inline-styles-under-a-strict-csp)). Inline `<svg>`
works inside `html`, so icons and charts need nothing special; an SVG fragment that is a
template of its own uses [`svg`](#svg-fragments). Property bindings carry data, never
functions: events are [intents](#no-event-handlers), and behaviour on an element is a
[hook](#element-hooks).

Whitespace is normalized once per template, the same way on the server and in the browser:
indentation between block-level tags disappears, and a run of whitespace between inline
elements becomes one space. `<pre>` and `<textarea>` keep theirs. Exact whitespace belongs in
`<pre>` or in a value.

## SVG fragments

Write a whole graphic, `<svg>` included, in `html`. When part of it is a template of its own, a
mark shown only in some states or one shape per list item, write that part with `svg`:

```ts
// src/status-strip.ts
import { define, each, html, nothing, svg } from '@gyral/core';

export interface Service {
  readonly id: number;
  readonly status: 'up' | 'down' | undefined;
  readonly name: string;
}

// Fragments are plain functions that return svg templates.
const mark = (status: 'up' | 'down') =>
  status === 'up'
    ? svg`<circle cx="5" cy="5" r="3" />`
    : svg`<rect x="2" y="2" width="6" height="6" />`;

// A list row: it reads only its service, so it stays pure.
const tile = (service: Service) => svg`<g transform="translate(${(service.id - 1) * 12} 0)">
  ${service.status === undefined ? nothing : mark(service.status)}
  <text x="1" y="13">${service.name}</text>
</g>`;

export const StatusStrip = define<{ readonly services: readonly Service[] }, never>()(
  'my-status-strip',
  {
    init: () => ({ services: [{ id: 1, status: 'up', name: 'API' }] }),
    intent: {},
    update: {},
    view: (s) =>
      html`<svg viewBox="0 0 ${s.services.length * 12} 14" role="img" aria-label="Service status">
        ${each(s.services, (service) => service.id, tile)}
      </svg>`,
  },
);
```

An `svg` template is `html` for SVG content:

- **Its top level is SVG**, as if it stood inside an `<svg>`: `<path />` and `<g>` are SVG
  elements, self-closing tags are fine, and camelCase names such as `clipPath` and `viewBox`
  keep their case.
- **It renders only inside SVG content**: in a hole of an `<svg>` or of another SVG element. At
  a view's root or inside an HTML element, the browser's parser would build HTML elements from
  the server's markup, so it is an error in development, on the server and in the browser.
- **HTML at its top level is a template error.** HTML inside a graphic goes in a
  `<foreignObject>`, written with `html`.
- Bind `href=${…}`, not `xlink:href=${…}`: SVG 2's plain `href` is the one a binding can set.
  Static `xlink:href="#a"` is fine.

Only apps that use `svg` carry its code, about 0.2 KB minified.

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
  renders and throws with the same message, naming where the template is written:
  `at src/cart.ts:12:5`. Under Vite the preset gives the exact file, line and column; elsewhere
  they come from the stack trace. Hydration mismatches name it too.
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
`<table>`, a `<div>` inside a `<p>`), an HTML element such as `<button>` inside an `<svg>` (it
would become an unknown SVG element that renders nothing), a bound `xlink:href=${…}`, a
`${…}` inside `<script>` or `<style>`, and a list row that reads the view's variables. Each
message says what to write instead.

The ESLint config also reports a function written in a hole (`${() => …}`), which is never
right in a view, and warns, with `gyral/unused-intent`, about an intent parser that no template
in the module names with `data-intent`: a renamed intent or dead code. That rule is static, so
intents rendered only in some states count as used, and it skips components whose intent names
may be used in another module.

In development, Gyral also warns once when a property binding gets a function: `.onclick=${fn}`
on a built-in element (use `data-intent`), or a function prop on a Gyral component (props are
data, and they travel to the browser in hydration seeds). Other custom elements don't warn,
since a third-party widget's API may take a callback.

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
module-level values.** Name intents with a module-level `intentsOf<typeof Component>()`, the
same names the view gets as `i`, and pass anything else from the view, such as the selection,
through `pick`. Write the row's return type (`: TemplateResult`) and use the view's own `i`, so
the row and the component don't infer each other's types:

```ts
// src/todos.ts
import { define, each, html, intentsOf, type TemplateResult } from '@gyral/core';

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
const i = intentsOf<typeof Todos>();

// A row: reads only its item, what `pick` returned, and module constants.
const Row = (todo: Todo, selected: boolean): TemplateResult =>
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

export const Todos = define<State, Msg>()('my-todos', {
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
- To get a fresh element when an id changes, render a one-item list:
  `each([s.run], (run) => run.id, Run)`. To restart a CSS animation, a hook is lighter: see
  [Replaying a CSS animation](#replaying-a-css-animation).

### .map or each?

Plain arrays render too, by position: ``${s.tags.map((t) => html`<li>${t}</li>`)}``. Choose
by what the list does:

- **`.map`** for short lists whose items don't move: a few options, a breadcrumb, table headers.
  Its rows may read anything in the view's scope, since every row runs on every render. Keep
  them cheap, and sort or filter once above the template, not inside the row.
- **`each`** for lists that are long, change often or reorder: search results, an inbox, kanban
  columns. A moved item keeps its element, with its focus, input state and animations, and a
  row renders again only when its item or `pick` result changes. That second point is why
  `each` rows must be pure, and why `gyral/each-row-purity` checks only `each` rows.

### Moving items between lists

A task that moves from one kanban column to another leaves one `each` list and joins another,
so it is a new element, and the browser can't animate the move by itself. A FLIP hook can
("first, last, invert, play"): it remembers where each key was last seen and, when its element
appears somewhere else, plays the move with the Web Animations API.

```ts
// src/board.ts
import { define, defineHook, each, html, intentsOf, type TemplateResult } from '@gyral/core';

/** Where each key was last seen, in page coordinates. */
const seen = new Map<string, { readonly x: number; readonly y: number }>();

/** Animates the element from where `key` was last seen to where it is now. */
export const flip = defineHook<[key: string, slot: number]>({
  client: (el, [key]) => {
    const box = el.getBoundingClientRect();
    const now = { x: box.left + scrollX, y: box.top + scrollY };
    const before = seen.get(key);
    seen.set(key, now);
    if (before === undefined || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dx = before.x - now.x;
    const dy = before.y - now.y;
    if (dx === 0 && dy === 0) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
      duration: 200,
      easing: 'ease-out',
    });
  },
});

export interface Task {
  readonly id: string;
  readonly label: string;
}

export interface State {
  readonly todo: readonly Task[];
  readonly done: readonly Task[];
}

export type Msg = { readonly _tag: 'Move'; readonly id: string };

const i = intentsOf<typeof Board>();

const TaskCard = (t: Task, slot: number): TemplateResult =>
  html`<li ${flip(t.id, slot)}>
    <button type="button" value=${t.id} data-intent=${i.Move}>${t.label}</button>
  </li>`;

const column = (label: string, tasks: readonly Task[]) =>
  html`<section>
    <h2>${label}</h2>
    <ul>
      ${each(
        tasks,
        (t) => t.id,
        TaskCard,
        (t) => tasks.indexOf(t),
      )}
    </ul>
  </section>`;

export const Board = define<State, Msg>()('my-board', {
  init: () => ({
    todo: [
      { id: 'a', label: 'Write the release notes' },
      { id: 'b', label: 'Update the screenshots' },
    ],
    done: [],
  }),
  intent: { Move: ({ value }) => (value ? { _tag: 'Move', id: value } : undefined) },
  update: {
    Move: (s, { id }) => {
      const task = [...s.todo, ...s.done].find((t) => t.id === id);
      if (task === undefined) return s;
      return s.todo.includes(task)
        ? { todo: s.todo.filter((t) => t !== task), done: [...s.done, task] }
        : { done: s.done.filter((t) => t !== task), todo: [...s.todo, task] };
    },
  },
  view: (s) => html`${column('To do', s.todo)} ${column('Done', s.done)}`,
});
```

- **The hook gets the item's slot** (`pick` returns its index), so it also runs when a task
  shifts inside its column. A hook runs only when its arguments change: for the new element in
  the other column, and for tasks whose slot changed. Tasks that move because the layout changed
  around them, after a resize, aren't animated.
- **`seen` keeps the keys of deleted tasks.** Clear it when the board loads new data.
- **The native way is a View Transition.** With [`viewTransition`](#view-transitions), a task
  whose `view-transition-name` is the same before and after (a style binding on the row,
  `style="view-transition-name: task-${t.id}"`) morphs from its old place to its new one.
  Same-document View Transitions are only newly available in browsers, so keep the hook as the
  fallback for now.

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
Core ships three:

- **`invalid(errors)`** mirrors model errors into native validity (`setCustomValidity` and
  `aria-invalid`). See [Forms](/docs/forms/).
- **`labelledBy('page-title')`** names a form or region after a heading outside the component's
  shadow root, which `aria-labelledby` can't reach on its own.
- **`capturePointer()`** keeps a pointer on its element from `pointerdown` until release, for
  [press-and-hold](/docs/intent/#press-and-hold) and drag intents.

Write your own with `defineHook`. `client(el, args, prev)` runs after the render whenever the
arguments change (`prev` is `undefined` the first time). An optional `server(args)` returns
attributes for the server-rendered start tag, so the page is right before scripts run. A hook
acts only on its own element, and listeners it adds there go away with the element, so most
hooks need no teardown:

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

export const Steps = define<State, Msg>()('my-steps', {
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

### Custom properties

To hand a value to CSS, bind a custom property in a `style` attribute and let the stylesheet
use it, with a fallback:

```ts
// src/upload-progress.ts
import { css, define, html, prop, type Stateless } from '@gyral/core';

export interface Props {
  readonly sent: number;
  readonly total: number;
}

export const UploadProgress = define<Stateless, never, Props>()('my-upload-progress', {
  props: { sent: prop.number({ default: 0 }), total: prop.number({ default: 1 }) },
  intent: {},
  update: {},
  view: (_s, _i, { props }) => html`
    <div class="bar" style="--fill: ${props.sent / props.total}"></div>
    <p>${props.sent} of ${props.total} files</p>
  `,
  styles: css`
    .bar {
      block-size: 0.5rem;
      background: linear-gradient(to right, currentColor calc(var(--fill, 0) * 100%), #0000 0);
    }
  `,
});
```

Gyral writes `style` bindings through the CSSOM, so they work under a Content Security Policy
without `'unsafe-inline'`. In server-rendered markup such a policy blocks the attribute until the
component hydrates, which is why the stylesheet keeps a default, `var(--fill, 0)`. [Inline styles
under a strict CSP](/docs/styling/#inline-styles-under-a-strict-csp) has the details.

A `style` binding owns the whole attribute. For the rare element whose inline style a hook
writes too, let a hook set only the properties it names:

```ts
// src/css-vars.ts
import { defineHook } from '@gyral/core';

/** Sets the named custom properties, leaving the element's other inline styles alone. */
export const cssVars = defineHook<[vars: Readonly<Record<`--${string}`, string>>]>({
  client: (el, [vars]) => {
    if (!(el instanceof HTMLElement)) return;
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
  },
});
```

### Replaying a CSS animation

A CSS animation runs once, when its element appears. A "flash on change", such as an unread
badge that pulses when a message arrives or a field that shakes on a rejected value, has to
replay it. Count the replays in state, and restart the element's animations with the Web
Animations API when the count changes:

```ts
// src/inbox-badge.ts
import { css, define, defineHook, html } from '@gyral/core';

/** Restarts the element's CSS animations whenever `count` changes, not on the first render. */
export const replay = defineHook<[count: number]>({
  client: (el, [count], prev) => {
    if (prev === undefined || prev[0] === count) return;
    for (const animation of el.getAnimations()) {
      animation.cancel();
      animation.play();
    }
  },
});

export interface State {
  readonly unread: number;
  readonly pulses: number;
}

export type Msg = { readonly _tag: 'Arrived' };

export const InboxBadge = define<State, Msg>()('my-inbox-badge', {
  init: () => ({ unread: 0, pulses: 0 }),
  intent: { Arrived: () => ({ _tag: 'Arrived' }) },
  update: { Arrived: (s) => ({ unread: s.unread + 1, pulses: s.pulses + 1 }) },
  view: (s, i) => html`
    <output class="badge" ${replay(s.pulses)}>${s.unread}</output>
    <button type="button" data-intent=${i.Arrived}>Simulate a message</button>
  `,
  styles: css`
    .badge {
      animation: pulse 300ms ease-out;
    }
    @keyframes pulse {
      50% {
        scale: 1.3;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .badge {
        animation: none;
      }
    }
  `,
});
```

`getAnimations()` covers the CSS animations and transitions running on the element; pass
`{ subtree: true }` to include its descendants. The count lives in state because the model
decides when something deserves attention, and a count, unlike a boolean, changes every time.
Without a hook, a one-item keyed list replays by replacing the element,
`each([s.pulses], String, Badge)`, at the cost of a new node (and its focus, if it had any).

## Widgets with a lifecycle

Something with setup and teardown, such as a WebGL stage, a chart or map library, an observer or
a connection, has a native home: **a custom element of its own**. Give it one property for its
input, keep its state inside, set up in `connectedCallback` and tear down in
`disconnectedCallback`. The browser then tells it about every connect, disconnect and move, the
view stays a description of data, and the widget can be tested on its own:

```ts
// src/scene-editor.ts
import { define, html } from '@gyral/core';

interface Scene {
  readonly cubes: number;
}

/** The widget: one property in, its own lifecycle. */
class StageElement extends HTMLElement {
  #scene: Scene = { cubes: 0 };
  #frame = 0;

  set view(scene: Scene) {
    this.#scene = scene;
    this.#schedule();
  }

  connectedCallback(): void {
    this.#schedule(); // set up the renderer, canvas and observers here
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#frame); // dispose the renderer and listeners here
  }

  #schedule(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => {
      this.textContent = `${String(this.#scene.cubes)} cubes`;
    });
  }
}
customElements.define('my-stage', StageElement);

interface State {
  readonly scene: Scene;
}

type Msg = { readonly _tag: 'Add' };

export const SceneEditor = define<State, Msg>()('my-scene-editor', {
  init: () => ({ scene: { cubes: 1 } }),
  intent: { Add: () => ({ _tag: 'Add' }) },
  update: { Add: (s) => ({ scene: { cubes: s.scene.cubes + 1 } }) },
  view: (s, i) => html`
    <my-stage .view=${s.scene}></my-stage>
    <button type="button" data-intent=${i.Add}>Add a cube</button>
  `,
});
```

The widget reports back with events: it dispatches
`new CustomEvent(OUTPUT_EVENT, { detail: { _tag: 'Picked' }, bubbles: true })` on itself, and the
parent parses that like a [child component's output](/docs/components/#outputs-and-other-code).
When the widget has a model of its own, make it a Gyral component (`prop.value` for its input,
`outputs<Out>()` for its events).

For a **small imperative behaviour** on an element of the view, such as a timer, a
`ResizeObserver` or a third-party enhancer on one input, a hook with a teardown is lighter:
`defineDisposableHook` takes `dispose(el, args)` next to `client`.

```ts
// src/flash.ts
import { defineDisposableHook } from '@gyral/core';

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** Highlights the element for a moment whenever `value` changes. */
export const flash = defineDisposableHook<[value: unknown]>({
  client: (el, _args, prev) => {
    if (prev === undefined) return; // not on the first render
    el.classList.add('flash');
    clearTimeout(timers.get(el));
    timers.set(
      el,
      setTimeout(() => {
        el.classList.remove('flash');
      }, 600),
    );
  },
  dispose: (el) => {
    clearTimeout(timers.get(el));
  },
});
```

- `dispose` runs when Gyral removes the element (its part cleared, its template replaced, its
  list row removed), when the position stops holding the hook, and when the component
  disconnects. It never runs for moves: rows reordered in a list, or a component moved with
  `moveBefore()`.
- After a component disconnects and reconnects, `client` runs again with `prev` undefined.
- `defineHook` takes no `dispose` (a type error, and an error in development), so apps whose
  hooks need no teardown don't bundle the tracking; `defineDisposableHook` adds about 0.25 KiB
  gzip.

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

export const Pager = define<State, Msg>()('my-pager', {
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

### Focusing what a later render brings

`focus()` runs after the render its update caused. When the target only appears later, such as
the first result once a search answers, pass `wait: true`: the request stays pending until a
render of the component produces the target. A newer `focus()` from the component replaces it,
and after one second it gives up with the usual warning. `settled()` doesn't wait for it.

```ts
// src/result-search.ts
import { command, define, defineDriver, focus, html } from '@gyral/core';

interface Result {
  readonly id: string;
  readonly title: string;
}
export interface State {
  readonly query: string;
  readonly results: readonly Result[];
}
export type Msg =
  | { readonly _tag: 'Search'; readonly query: string }
  | { readonly _tag: 'Found'; readonly results: readonly Result[] };

const search = defineDriver<string, readonly Result[]>({
  name: 'search',
  run: async (query, { signal }) => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
    return (await response.json()) as readonly Result[];
  },
});

export const ResultSearch = define<State, Msg>()('my-result-search', {
  init: () => ({ query: '', results: [] }),
  intent: {
    Search: ({ formData }) => ({ _tag: 'Search', query: String(formData?.get('q') ?? '') }),
  },
  update: {
    // The first result exists only after `Found` renders: the focus waits for it.
    Search: (s, m) => [
      { ...s, query: m.query },
      [
        command(search, m.query, { onSuccess: (results): Msg => ({ _tag: 'Found', results }) }),
        focus('#results li:first-child a', { wait: true }),
      ],
    ],
    Found: (s, m) => ({ ...s, results: m.results }),
  },
  view: (s, i) => html`
    <form data-intent=${i.Search}>
      <input name="q" aria-label="Search" .value=${s.query} />
      <button>Search</button>
    </form>
    <ul id="results">
      ${s.results.map((r) => html`<li><a href=${`/items/${r.id}`}>${r.title}</a></li>`)}
    </ul>
  `,
});
```

### Focusing into a child component

`focus()` looks inside the component's own root, so it can't reach an element in a child's
shadow root. Give the child `shadow: { delegatesFocus: true }` and focus the child itself:
focusing the host then focuses its first focusable element.

```ts
// src/name-field.ts
import { define, html, type Stateless } from '@gyral/core';

/** Focusing <my-name-field> focuses its input. */
export const NameField = define<Stateless, never>()('my-name-field', {
  shadow: { delegatesFocus: true },
  intent: {},
  update: {},
  view: () => html`<label>Name <input name="name" autocomplete="name" /></label>`,
});
```

```ts
// src/contact-form.ts
import { define, focus, html, type Stateless } from '@gyral/core';
import './name-field.js';

export type Msg = { readonly _tag: 'Edit' };

export const ContactForm = define<Stateless, Msg>()('my-contact-form', {
  intent: { Edit: () => ({ _tag: 'Edit' }) },
  update: { Edit: (s) => [s, [focus('my-name-field')]] },
  view: (_s, i) => html`
    <button type="button" data-intent=${i.Edit}>Edit name</button>
    <my-name-field></my-name-field>
  `,
});
```

The same delegation works for `el.focus()` from page script and for a click on a part of the
child that can't take focus, and `:focus` matches the host while focus is inside it. The server
writes `shadowrootdelegatesfocus` on the declarative shadow root, so a server-rendered child
delegates focus before and after hydration.

### Keeping focus across renders

Focus stays only as long as the focused element does. When a render removes it, the browser
moves focus to the page body. Render focusable rows with a keyed `each`, so a row moves instead
of being created again, and when the focused item really goes away, such as a deleted row,
return a `focus()` command for its neighbour or for the list.

## View transitions

Return `true` from the optional `viewTransition(prev, next, msg)` spec field to render that
change inside a [View Transition](https://developer.mozilla.org/docs/Web/API/View_Transition_API):
a route change, a list that reorders. Gyral skips it where the browser has no support or the
visitor asked for reduced motion, and the animation itself is CSS.

## When the DOM updates

Reducers run as soon as a message arrives; the DOM updates in a microtask, once for all the
messages that arrived together, parents before children. In a test, `await settled()` waits
until every component has rendered and messages have stopped arriving. See
[Testing](/docs/testing/).

## Pure means repeatable

Because a view only reads its arguments, the server can render it, the browser can hydrate the
same markup without changes, and a test can render a state and inspect it. If a view needs the
time, a random number or a measurement, put it in state through a
[command](/docs/effects/) first.
