---
title: Intent
description: How Gyral turns clicks, input, form submissions and keys into typed messages, and why the view never holds event handlers.
section: Guides
order: 2
---

# Intent

**Intent** answers one question: what did the user mean? It turns platform events into
messages, and it is the only place where raw input is read. Everything after it, the model and
the view, works with typed, already-parsed data.

```ts
// src/search-box.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly query: string;
  readonly submitted: string | undefined;
}

export type Msg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Search'; readonly query: string }
  | { readonly _tag: 'Clear' };

export const SearchBox = define<State, Msg>()('my-search-box', {
  init: () => ({ query: '', submitted: undefined }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }),
    Search: ({ formData }) => {
      const q = formData?.get('q');
      return typeof q === 'string' && q.trim() !== ''
        ? { _tag: 'Search', query: q.trim() }
        : undefined;
    },
    Clear: ({ key }) => (key === 'Escape' ? { _tag: 'Clear' } : undefined),
  },
  update: {
    Typed: (s, m) => ({ ...s, query: m.query }),
    Search: (s, m) => ({ ...s, submitted: m.query }),
    Clear: () => ({ query: '', submitted: undefined }),
  },
  view: (s, i) => html`
    <search data-intent=${i.Clear} data-intent-on="keydown">
      <form data-intent=${i.Search}>
        <label for="q">Search</label>
        <input id="q" name="q" type="search" value=${s.query} data-intent=${i.Typed} />
        <button>Search</button>
      </form>
    </search>
    <p>${s.submitted === undefined ? 'Nothing searched yet.' : `Results for “${s.submitted}”`}</p>
  `,
});
```

## Naming intents in markup

The view puts `data-intent=${i.Search}` on an element. `i` holds the message tags, typed, so a
misspelt intent is a compile error. When that element's trigger event fires, Gyral calls the
parser registered under the same name in `intent`, and sends whatever it returns through
`update`.

The view never attaches a closure. That keeps it a pure function of state, which matters for
[server rendering](/docs/server-rendering/) (the markup the server sends already names every
intent) and for testing (there's nothing to call but `update`).

## Trigger events

Each element has a natural event, so you rarely say which one:

| Element                                  | Fires on                                |
| ---------------------------------------- | --------------------------------------- |
| `<form>`                                 | `submit` (Gyral prevents the page load) |
| `<input>` (text-like), `<textarea>`      | `input`                                 |
| checkbox and radio `<input>`, `<select>` | `change`                                |
| a custom element (a child component)     | its outputs                             |
| anything else (`<button>`, …)            | `click`                                 |

Override it with `data-intent-on`, such as `data-intent-on="keydown"`. Any event type works
there: `keyup`, `focusin`, `focusout`, `toggle` (popovers and `<details>`), `command` (invoker
commands, below), `pointerdown` or a third-party element's own event. A component listens only
for the events its templates name, so a component without keyboard intents never runs intent
lookup on a keystroke. If the value itself is bound, `data-intent-on=${…}`, the component listens
for `keydown`, `keyup`, `focusin`, `focusout`, `toggle` and `command` as well; list any other
event type it can produce in the spec: `events: ['pointerdown']`.

`data-intent-on` also takes a list, separated by spaces: `data-intent-on="keydown keyup"` fires
the intent for both events. The parser tells them apart with `event.type`. Use a list when the
events mean the same thing to the model, such as the press and the release of a
[hold-to-record button](#press-and-hold).

## One element, an intent per event

When each event on an element means something different, name an intent per event type with
`data-intent-<event>`. A task in a sortable list grabs on `pointerdown`, drops on `pointerup`,
moves with the keyboard and tracks focus, all on the `<li>` itself:

```ts
// src/task-list.ts
import { define, each, html, intentsOf, type TemplateResult } from '@gyral/core';

export interface Task {
  readonly id: string;
  readonly title: string;
}

export interface State {
  readonly tasks: readonly Task[];
  readonly dragging: string | undefined;
  readonly focused: string | undefined;
}

export type Msg =
  | { readonly _tag: 'Grab'; readonly id: string }
  | { readonly _tag: 'Drop'; readonly id: string }
  | { readonly _tag: 'Move'; readonly id: string; readonly by: -1 | 1 }
  | { readonly _tag: 'Focus'; readonly id: string };

// The component's intent names, for rows. A row's return type is written out, or the row and
// `TaskList`'s type would infer each other.
const i = intentsOf<typeof TaskList>();

const TaskRow = (t: Task): TemplateResult =>
  html`<li
    tabindex="0"
    data-id=${t.id}
    data-intent-pointerdown=${i.Grab}
    data-intent-pointerup=${i.Drop}
    data-intent-keydown=${i.Move}
    data-intent-focusin=${i.Focus}
  >
    ${t.title}
  </li>`;

const idOf = (el: Element): string => el.getAttribute('data-id') ?? '';

/** Moves the task `id` to the place `to(from)` gives, clamped to the list. */
const moved = (tasks: readonly Task[], id: string, to: (from: number) => number) => {
  const from = tasks.findIndex((t) => t.id === id);
  const task = tasks[from];
  if (task === undefined) return tasks;
  const rest = tasks.filter((t) => t !== task);
  const at = Math.max(0, Math.min(rest.length, to(from)));
  return [...rest.slice(0, at), task, ...rest.slice(at)];
};

export const TaskList = define<State, Msg>()('my-task-list', {
  init: () => ({
    tasks: [
      { id: 'a', title: 'Write the brief' },
      { id: 'b', title: 'Review the designs' },
    ],
    dragging: undefined,
    focused: undefined,
  }),
  intent: {
    Grab: ({ target }) => ({ _tag: 'Grab', id: idOf(target) }),
    // Released over another task: the dragged one moves there.
    Drop: ({ target }) => ({ _tag: 'Drop', id: idOf(target) }),
    // Alt+ArrowUp and Alt+ArrowDown move the focused task; other keys keep their default.
    Move: ({ target, key, event }) => {
      const by = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      if (by === 0 || !(event instanceof KeyboardEvent) || !event.altKey) return undefined;
      event.preventDefault();
      return { _tag: 'Move', id: idOf(target), by };
    },
    Focus: ({ target }) => ({ _tag: 'Focus', id: idOf(target) }),
  },
  update: {
    Grab: (s, m) => ({ ...s, dragging: m.id }),
    Drop: (s, m) => {
      const onto = s.tasks.findIndex((t) => t.id === m.id);
      return s.dragging === undefined
        ? s
        : { ...s, dragging: undefined, tasks: moved(s.tasks, s.dragging, () => onto) };
    },
    Move: (s, m) => ({ ...s, tasks: moved(s.tasks, m.id, (from) => from + m.by) }),
    Focus: (s, m) => ({ ...s, focused: m.id }),
  },
  view: (s) => html`
    <ul aria-label="Tasks">
      ${each(s.tasks, (t) => t.id, TaskRow)}
    </ul>
  `,
});
```

- **Per-event attributes come first.** For an event of type T, an element's `data-intent-T`
  answers before its plain `data-intent`, which keeps handling its own trigger. Lookup still
  starts at the element that was hit and goes outward, and the nearest element with an intent
  for that event wins.
- **Write the event name in lower case**, as event types are: `data-intent-pointerdown`. The HTML
  parser lower-cases attribute names, so an event whose name has capitals, such as a library's
  `valueChange`, can't be named this way: `data-intent-valueChange` becomes
  `data-intent-valuechange`. Put such a name in `data-intent-on` instead.
- **`data-intent-on` is reserved** for the trigger list. It is never read as an event called
  `on`.
- **The component listens for every event these names mention**, bound or static, in list rows
  and in `raw()` markup too. No `events` entry is needed.
- `data-intent-keydown=${s.editing ? i.Key : nothing}` gives the element that intent only while
  editing.

When the events share one message, keep one `data-intent` with a `data-intent-on` list instead.
And an intent can still sit on an ancestor, as `Clear` does in the first example: keys typed in
the input bubble to the `<search>` around it. `data-intent-keydown=${i.Clear}` on the input
itself would work as well.

## What a parser receives

A parser gets an `IntentInput` object, and the component's read-only context as a second
argument (see [props, state and stores in a parser](#props-state-and-stores-in-a-parser)):

| Field      | Holds                                                                          |
| ---------- | ------------------------------------------------------------------------------ |
| `value`    | The `value` of the input, select, textarea or button that has the intent       |
| `checked`  | `checked`, for checkboxes and radios                                           |
| `formData` | The submitted `FormData` (with the submitter button), for a `<form>`           |
| `key`      | `KeyboardEvent.key`, for `keydown` and `keyup`                                 |
| `newState` | `'open'` or `'closed'`, for `toggle`                                           |
| `detail`   | The `detail` of any `CustomEvent`: a child's output, a library element's event |
| `command`  | The invoker command and its source, for `command`                              |
| `name`     | The intent's name: the `data-intent-<event>` or `data-intent` value            |
| `event`    | The raw event                                                                  |
| `target`   | The element that carries the intent                                            |

Prefer the parsed fields to `event`: they read the same way for every element, and they're
what [tests](/docs/testing/) can construct.

### The intent element and the element that was hit

Read the element with the intent from `target`, not from the event. Gyral listens on the
component's root, so `event.currentTarget` is that root (the shadow root, or the host of a
light-DOM component), and `event.target` is whatever was hit inside the element: the `<span>`
in a button's label, an icon. `target` is always the element whose intent attribute answered.
Compare the two when it matters where an event started, as in
[declining](#declining-passing-an-event-outward).

`detail` is `unknown` until the parser checks it, with a type guard or a schema, because any
element can dispatch a `CustomEvent`. [Using third-party web
components](/docs/third-party-components/#what-the-parser-gets) shows a map's custom event
parsed this way.

## Parse, don't validate

A parser returns one of three things:

- **A message** of its own tag's variant.
- **`undefined`** to decline the event. Above, `Clear` declines every key but Escape, and
  `Search` declines an empty query. Declining is not an error, and an intent further out may
  still take the event ([below](#declining-passing-an-event-outward)).
- **`IntentRejected`**, a framework message with field issues, when input fails a schema. The
  [Forms](/docs/forms/) helpers `form()` and `field()` produce it for you.

Parsers may return a promise, because schema validation can be async. They must not do side
effects. The one exception is `event.preventDefault()`, for example to stop arrow keys moving
the caret.

## Declining: passing an event outward

Lookup starts at the element that was hit and goes outward, and the nearest element with an
intent for the event runs its parser. When that parser returns `undefined` synchronously, it
declines: the next element outward with an intent for the same event gets it, up to the
component's root. So a container's keyboard shortcuts and its fields' own keys live together:

```ts
// src/note-editor.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly body: string;
  readonly draft: string;
  readonly tags: readonly string[];
  readonly saving: boolean;
}

export type Msg =
  | { readonly _tag: 'Body'; readonly text: string }
  | { readonly _tag: 'Draft'; readonly text: string }
  | { readonly _tag: 'AddTag'; readonly tag: string }
  | { readonly _tag: 'Save' };

/** Ctrl+S, or Command+S on a Mac. */
const isSave = (event: Event, key: string | undefined): boolean =>
  key === 's' && event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey);

export const NoteEditor = define<State, Msg>()('my-note-editor', {
  init: () => ({ body: '', draft: '', tags: [], saving: false }),
  intent: {
    Body: ({ value }) => ({ _tag: 'Body', text: value ?? '' }),
    Draft: ({ value }) => ({ _tag: 'Draft', text: value ?? '' }),
    // The tag field keeps Enter. Every other key declines, so Ctrl+S goes on to Save.
    AddTag: ({ key, value }) => {
      const tag = value?.trim() ?? '';
      return key === 'Enter' && tag !== '' ? { _tag: 'AddTag', tag } : undefined;
    },
    // The editor's shortcut, wherever focus is inside it.
    Save: ({ key, event }) => {
      if (!isSave(event, key)) return undefined;
      event.preventDefault(); // not the browser's "Save page as"
      return { _tag: 'Save' };
    },
  },
  update: {
    Body: (s, m) => ({ ...s, body: m.text }),
    Draft: (s, m) => ({ ...s, draft: m.text }),
    AddTag: (s, m) => ({ ...s, draft: '', tags: [...s.tags, m.tag] }),
    // In an app, this also returns the command that sends the note.
    Save: (s) => ({ ...s, saving: true }),
  },
  view: (s, i) => html`
    <section aria-label="Note" data-intent-keydown=${i.Save}>
      <label for="body">Note</label>
      <textarea id="body" data-intent=${i.Body}>${s.body}</textarea>
      <label for="tag">Add a tag</label>
      <input id="tag" value=${s.draft} data-intent=${i.Draft} data-intent-keydown=${i.AddTag} />
      <p>Tags: ${s.tags.join(', ')}</p>
      <p role="status">${s.saving ? 'Saving…' : ''}</p>
    </section>
  `,
});
```

A keystroke in the textarea has no `keydown` intent of its own, so it goes straight to `Save`.
In the tag field, `AddTag` answers first: it takes Enter and declines everything else, and the
section's `Save` sees Ctrl+S from there too.

- **Only a synchronous `undefined` declines.** A parser that returns a promise has taken the
  event, whatever the promise resolves to: lookup can't wait for it.
- **Declining stays inside the component.** A nested component's lookup ends at its own root.
  The outer component sees the same event through its own listener, once, as before.
- **To skip events by where they started** rather than by key, compare `event.target` (the
  element that was hit) with `target` (the element with the intent).

Before Gyral 0.3.1, `undefined` ended the lookup, so an outer intent never saw an event that an
inner parser ignored. See the [migration guide](/docs/migrating-0-3-0-to-0-3-1/#behavior-changes).

## Props, state and stores in a parser

A parser's second argument is a read-only context: `props` and the component's `state`, as they
are when the event fires, and `read(store)` for the stores in the spec's `stores`. Parsers that don't need it
take one parameter. Use it when the decision must be made during the event, such as whether to
call `preventDefault()`: by the time a reducer runs, the browser has already acted.

A listbox owns the arrow keys of its orientation and leaves the others to the page:

```ts
// src/folders.ts
import { define, html, prop } from '@gyral/core';

export interface Props {
  /** `vertical` lists take ArrowUp and ArrowDown; `horizontal` ones ArrowLeft and ArrowRight. */
  readonly orientation: string;
}

export type Msg = { readonly _tag: 'Step'; readonly by: -1 | 1 };

const FOLDERS = ['Inbox', 'Drafts', 'Sent'] as const;

const KEYS: Readonly<Record<string, readonly [string, string]>> = {
  vertical: ['ArrowUp', 'ArrowDown'],
  horizontal: ['ArrowLeft', 'ArrowRight'],
};

export const Folders = define<{ readonly active: number }, Msg, Props>()('my-folders', {
  props: { orientation: prop.string({ default: 'vertical' }) },
  init: () => ({ active: 0 }),
  intent: {
    // Only the arrow keys this orientation owns are taken; the others still scroll the page.
    Step: ({ key, event }, { props }) => {
      const [back, next] = KEYS[props.orientation] ?? KEYS.vertical ?? ['', ''];
      const by = key === back ? -1 : key === next ? 1 : 0;
      if (by === 0) return undefined;
      event.preventDefault();
      return { _tag: 'Step', by };
    },
  },
  update: {
    Step: (s, m) => ({ active: (s.active + m.by + FOLDERS.length) % FOLDERS.length }),
  },
  view: (s, i, { props }) => html`
    <ul
      role="listbox"
      tabindex="0"
      aria-label="Folders"
      aria-orientation=${props.orientation}
      aria-activedescendant=${`folder-${String(s.active)}`}
      data-intent-keydown=${i.Step}
    >
      ${FOLDERS.map(
        (name, n) =>
          html`<li id=${`folder-${String(n)}`} role="option" aria-selected=${n === s.active}>
            ${name}
          </li>`,
      )}
    </ul>
  `,
});
```

Where the user is often decides the default, and that's state. A seat grid keeps Tab while
there is a next seat, and lets it move focus on from the last one:

```ts
// src/seats.ts
import { define, html } from '@gyral/core';

interface Grid {
  readonly cell: number;
  readonly cells: number;
}
type Msg = { readonly _tag: 'NextCell' };

export const Seats = define<Grid, Msg>()('my-seat-grid', {
  init: () => ({ cell: 0, cells: 12 }),
  intent: {
    NextCell: ({ key, event }, { state }) => {
      if (key !== 'Tab' || state.cell === state.cells - 1) return undefined;
      event.preventDefault();
      return { _tag: 'NextCell' };
    },
  },
  update: { NextCell: (s) => ({ ...s, cell: s.cell + 1 }) },
  view: (s, i) => html`
    <div role="grid" tabindex="0" aria-label="Seats" data-intent-keydown=${i.NextCell}>
      Seat ${s.cell + 1} of ${s.cells}
    </div>
  `,
});
```

`state` includes messages sent earlier in the same task, before the next render. Read it,
don't write it: apart from `preventDefault()`, a parser stays pure, and the view doesn't need
to write `data-first`/`data-last` attributes just so a parser can read them.

Keep parsers pure apart from `preventDefault()`: they read the context, they never write.
`form()`, `field()` and `child()` return one-parameter parsers, so code that calls one directly,
`field(schema, toMsg)(input)`, still works.

## Typing parsers

Each key in `intent` produces its own variant: the `Search` parser above returns a
`{ _tag: 'Search'; … }`. Inside the spec, leave the return type off, and the key types it.

Don't annotate a parser with the whole union. `(): Msg => …` widens it, and TypeScript answers
with a long error that ends in "`IntentParser<Msg, …>` is not assignable to …". A parser written
outside the spec returns its variant:

```ts
// src/search-parser.ts
import type { IntentInput } from '@gyral/core';
import type { Msg } from './search-box.js';

/** The variant, not the union; `undefined` declines the event. */
export const parseSearch = ({
  formData,
}: IntentInput): Extract<Msg, { _tag: 'Search' }> | undefined => {
  const q = formData?.get('q');
  return typeof q === 'string' && q.trim() !== '' ? { _tag: 'Search', query: q.trim() } : undefined;
};
```

`_tag: 'Search' as const` in the returned object works too. The same holds for the mappers of
`child()`, `form()` and `field()`. To type a parser that reads the context, use
`IntentParser<Variant, Props>`.

## Buttons carry their own data

A button's `value` is part of `IntentInput`, so a list of buttons needs one intent, not one
closure per row:

```html
<button type="button" value="sku-42" data-intent="AddToCart">Add to cart</button>
```

The parser reads `value` and the reducer finds the product. This is also what keeps the markup
meaningful without JavaScript.

## Several controls, one intent

Controls that all change one thing don't need a message each. Give them the same intent and
tell them apart by their `name`, as in a search filters panel:

```ts
// src/search-filters.ts
import { define, html } from '@gyral/core';

export interface Filters {
  readonly category: string;
  readonly sort: string;
}

export type Msg = {
  readonly _tag: 'Filter';
  readonly field: keyof Filters;
  readonly value: string;
};

const FIELDS: readonly (keyof Filters)[] = ['category', 'sort'];
const isField = (name: string): name is keyof Filters => FIELDS.some((f) => f === name);

export const SearchFilters = define<Filters, Msg>()('my-search-filters', {
  init: () => ({ category: 'all', sort: 'relevance' }),
  intent: {
    // One parser for every <select>: the name says which filter changed.
    Filter: ({ target, value }) => {
      const name = target.getAttribute('name') ?? '';
      return isField(name) && value !== undefined
        ? { _tag: 'Filter', field: name, value }
        : undefined;
    },
  },
  update: {
    Filter: (s, m) => ({ ...s, [m.field]: m.value }),
  },
  view: (s, i) => html`
    <label>
      Category
      <select name="category" data-intent=${i.Filter}>
        <option value="all" ?selected=${s.category === 'all'}>All</option>
        <option value="books" ?selected=${s.category === 'books'}>Books</option>
      </select>
    </label>
    <label>
      Sort by
      <select name="sort" data-intent=${i.Filter}>
        <option value="relevance" ?selected=${s.sort === 'relevance'}>Relevance</option>
        <option value="price" ?selected=${s.sort === 'price'}>Price</option>
      </select>
    </label>
  `,
});
```

Give each control its own message only when the reducers really differ. A view that names an
intent with no parser fails to compile: `Property 'Category' does not exist on type
'IntentNames<"Filter">'`.

## Intent names that aren't messages

Sometimes each control does something different, but all of them end in the same message. A
table toolbar's Archive, Restore and Duplicate buttons all become one request to the server.
Give each control its own parser key: the keys of `intent` are the component's intent names,
and a key that isn't a message tag may return any message.

```ts
// src/doc-table.ts
import { define, each, html, intentsOf, type TemplateResult } from '@gyral/core';

export interface Doc {
  readonly id: number;
  readonly title: string;
  readonly archived: boolean;
}

export type Action =
  { readonly kind: 'archive' | 'restore'; readonly id: number } | { readonly kind: 'duplicate' };

export type Msg = { readonly _tag: 'Request'; readonly action: Action };

export interface State {
  readonly docs: readonly Doc[];
  readonly pending: readonly Action[];
}

const i = intentsOf<typeof DocTable>(); // the parser keys, for rows

const idOf = (target: Element): number =>
  Number(target.closest('[data-id]')?.getAttribute('data-id'));

const request = (action: Action): Msg => ({ _tag: 'Request', action });

const Row = (doc: Doc): TemplateResult =>
  html`<li data-id=${doc.id}>
    ${doc.title}
    <button type="button" data-intent=${doc.archived ? i.Restore : i.Archive}>
      ${doc.archived ? 'Restore' : 'Archive'}
    </button>
  </li>`;

export const DocTable = define<State, Msg>()('my-doc-table', {
  init: () => ({ docs: [], pending: [] }),
  intent: {
    Archive: ({ target }) => request({ kind: 'archive', id: idOf(target) }),
    Restore: ({ target }) => request({ kind: 'restore', id: idOf(target) }),
    Duplicate: () => request({ kind: 'duplicate' }),
  },
  // One reducer for all three. In an app, it also returns the command that sends the request.
  update: { Request: (s, m) => ({ ...s, pending: [...s.pending, m.action] }) },
  // The view uses its own `i`; the module constant is for rows.
  view: (s, i) => html`
    <ul>
      ${each(s.docs, (doc) => doc.id, Row)}
    </ul>
    <button type="button" data-intent=${i.Duplicate}>Duplicate</button>
  `,
});
```

- **The intent names are the keys of `intent`.** `define<State, Msg>()(…)` takes them from the
  object you write, so there is nothing to declare twice.
- **A key that is a message tag returns that message**, as before. Any other key may return any
  message and gets no reducer: `update` has keys only for messages.
- **`i` holds exactly the keys.** Markup that names an intent with no parser fails to compile.
  For rows, `intentsOf<typeof Component>()` gives the same names as a module constant; write the
  row's return type (`: TemplateResult`), and use the view's own `i` inside the component.
- **A misspelled key is a new intent name.** The view's correct name then fails with
  `Property 'Archive' does not exist on type 'IntentNames<"Archvie" | …>'. Did you mean
'Archvie'?`, so fix the key; a key no template names at all is reported by the
  `gyral/unused-intent` lint rule.

It is a type-level feature: the keys were always the names at runtime. Prefer one shared intent
([previous section](#several-controls-one-intent)) when one parser that reads `name` is
clearer; give each control its own key when the parsers differ.

## Press and hold

A hold-to-record button, like a voice message in a chat, needs the press and the release. List
both in `data-intent-on` and read `event.type`: one intent, one message with a `down` flag.

```ts
// src/record-button.ts
import { capturePointer, define, html } from '@gyral/core';

export interface State {
  readonly recording: boolean;
}

export type Msg = { readonly _tag: 'Record'; readonly down: boolean };

const PRESS = new Set(['pointerdown', 'keydown']);

export const RecordButton = define<State, Msg>()('my-record-button', {
  init: () => ({ recording: false }),
  intent: {
    Record: ({ event, key }) => {
      if (event instanceof KeyboardEvent) {
        if (key !== ' ' || event.repeat) return undefined;
        event.preventDefault(); // no page scroll, and no click when Space comes up
      }
      return { _tag: 'Record', down: PRESS.has(event.type) };
    },
  },
  update: {
    // In an app, these also start and stop the microphone with commands.
    Record: (_s, m) => ({ recording: m.down }),
  },
  view: (s, i) => html`
    <button
      type="button"
      aria-pressed=${s.recording}
      ${capturePointer()}
      data-intent=${i.Record}
      data-intent-on="pointerdown pointerup pointercancel keydown keyup"
    >
      ${s.recording ? 'Recording…' : 'Hold to record'}
    </button>
  `,
});
```

The release must arrive even when the pointer leaves the button before it lets go. That is
**pointer capture**, and the `capturePointer()` [element hook](/docs/views/#element-hooks)
provides it: it calls `setPointerCapture` on `pointerdown`, so the pointer's events stay with the
button until release. `pointercancel`, when the browser takes the touch over for scrolling, is a
release too. For the keyboard, the same button holds while Space is down, and the parser ignores
auto-repeat.

- Give the button `touch-action: none` in CSS, so a held finger doesn't scroll or zoom, and
  `user-select: none`, so a long press doesn't select the label.
- A button that may disappear mid-press, in a render that drops it, never gets its `pointerup`.
  Also list `lostpointercapture` and treat it as a release, ignoring ones from other elements
  (`event.target !== target`): the event bubbles.
- While an element holds capture, the browser sends that pointer's events to it. Intents on the
  capturing element keep firing, but intents on elements _inside_ it stop until release. Put
  `capturePointer()` on the element whose intent needs the release, not on a container of other
  controls.
- Keys reach the button only while it has focus. For a shortcut anywhere on the page, read keys
  in a driver: a [subscription](/docs/outside-state/) to `keydown` and `keyup` on `window`.

## The element under a captured pointer

While an element holds pointer capture, every move lands on it, not on what the pointer is
over. To trace a path across items (drawing across a grid of cells, selecting a range of days
by dragging), capture on the container and ask the component's root which element is under the
pointer: `elementFromPoint` on the shadow root (or `document` for a light-DOM component) sees
inside the shadow tree. The cell carries its index in `data-cell`:

```ts
// src/path-grid.ts
import { capturePointer, define, html } from '@gyral/core';

interface State {
  readonly path: readonly number[];
}
type Msg = { readonly _tag: 'Trace'; readonly cell: number; readonly start: boolean };

const CELLS = Array.from({ length: 16 }, (_, n) => n);

export const PathGrid = define<State, Msg>()('my-path-grid', {
  init: () => ({ path: [] }),
  intent: {
    Trace: ({ event, target }) => {
      if (!(event instanceof PointerEvent)) return undefined;
      if (event.type === 'pointermove' && event.buttons === 0) return undefined;
      const root = target.getRootNode() as Document | ShadowRoot;
      const under = root.elementFromPoint(event.clientX, event.clientY);
      const cell = under?.closest('[data-cell]')?.getAttribute('data-cell');
      if (cell == null) return undefined;
      return { _tag: 'Trace', cell: Number(cell), start: event.type === 'pointerdown' };
    },
  },
  update: {
    Trace: (s, m) =>
      m.start ? { path: [m.cell] } : s.path.at(-1) === m.cell ? s : { path: [...s.path, m.cell] },
  },
  view: (s, i) => html`
    <div
      class="grid"
      ${capturePointer()}
      data-intent=${i.Trace}
      data-intent-on="pointerdown pointermove"
    >
      ${CELLS.map(
        (n) => html`<span data-cell=${n} class=${s.path.includes(n) ? 'on' : ''}>${n}</span>`,
      )}
    </div>
  `,
});
```

Give the container `touch-action: none` so a finger traces instead of scrolling.

## Invoker commands

An element with `data-intent-on="command"` receives
[invoker commands](https://developer.mozilla.org/en-US/docs/Web/API/Invoker_Commands_API)
aimed at it, from buttons anywhere in the component:

```ts
// src/shopping-list.ts
import { define, each, html } from '@gyral/core';

export interface State {
  readonly items: readonly string[];
}

export type Msg = { readonly _tag: 'Command'; readonly command: '--add' | '--clear' };

const Item = (item: string) => html`<li>${item}</li>`;

export const ShoppingList = define<State, Msg>()('my-shopping-list', {
  init: () => ({ items: [] }),
  intent: {
    Command: ({ command }) =>
      command?.command === '--add' || command?.command === '--clear'
        ? { _tag: 'Command', command: command.command }
        : undefined,
  },
  update: {
    Command: (s, m) =>
      m.command === '--add'
        ? { items: [...s.items, `Item ${String(s.items.length + 1)}`] }
        : { items: [] },
  },
  view: (s, i) => html`
    <button type="button" commandfor="list" command="--add">Add item</button>
    <button type="button" commandfor="list" command="--clear">Clear</button>
    <ul id="list" data-intent=${i.Command} data-intent-on="command">
      ${each(s.items, (item) => item, Item)}
    </ul>
  `,
});
```

Invoker commands are newly available in browsers. Where the native `CommandEvent` is missing,
Gyral dispatches an equivalent event for custom (`--…`) commands, so the same markup works
everywhere. Built-in commands such as `show-modal` are left to the browser.

## Isolation

Only `data-intent` elements in the component's own render root count. A click inside a child
component belongs to the child, never to the parent, because the child's shadow root is a
boundary. Light-DOM components keep the same rule by stopping at the next Gyral host. A parser
that declines passes the event outward only within its own component.
