---
title: Using third-party web components
description: Use Web Awesome, Shoelace, Material Web or any other custom element inside a Gyral view - turn its events into intents and style it through parts.
section: Guides
order: 19
---

# Using third-party web components

Component libraries built as custom elements (Web Awesome, Shoelace, Material Web, Spectrum,
or a design system of your own) work inside Gyral views, because to Gyral they're just
elements. You render them in the view, turn their events into intents, and style them through
the hooks they expose.

## Their events as intents

A library element fires its own events, such as `wa-change` or `sl-change`. Put
**`data-intent-on`** on the element to say which event fires its intent. A component listens for
every event its templates name there, so nothing else is needed.

```ts
// src/size-field.ts
import { define, html } from '@gyral/core';

export interface State {
  readonly size: string;
}

export type Msg = { readonly _tag: 'SizeChanged'; readonly size: string };

/** Reads `value` from any element that has one (library inputs usually do). */
const valueOf = (el: Element): string | undefined =>
  'value' in el && typeof el.value === 'string' ? el.value : undefined;

export const SizeField = define<State, Msg>()('my-size-field', {
  init: () => ({ size: 'M' }),
  intent: {
    SizeChanged: ({ target }) => {
      const size = valueOf(target);
      return size === undefined ? undefined : { _tag: 'SizeChanged', size };
    },
  },
  update: { SizeChanged: (_s, m) => ({ size: m.size }) },
  view: (s, i) => html`
    <sl-select
      label="Size"
      .value=${s.size}
      data-intent=${i.SizeChanged}
      data-intent-on="sl-change"
    >
      <sl-option value="S">Small</sl-option>
      <sl-option value="M">Medium</sl-option>
      <sl-option value="L">Large</sl-option>
    </sl-select>
    <p>Size: <output>${s.size}</output></p>
  `,
});
```

**Without `data-intent-on`**, Gyral treats any custom element with a `data-intent` as a child
component and waits for its `gyral-output` event, which a library element never sends. Only
when the event name itself is bound, `data-intent-on=${…}`, list the types it can produce in
the spec's `events`, such as `events: ['sl-change']`.

The event can also go in the attribute's name: `data-intent-sl-change=${i.SizeChanged}` does
the same as the pair above, and leaves `data-intent` free for another event on the same element
(see [Intent](/docs/intent/#one-element-an-intent-per-event)). Attribute names are lower case,
so this works for event names without capitals. For a name such as `valueChange`, use
`data-intent-on="valueChange"`.

## What the parser gets

- **`target`** is the library element. Read its state from it (`value`, `checked`, …), as the
  example does. The `value` field of the intent input is only filled for native `<input>`,
  `<select>`, `<textarea>` and `<button>` elements.
- **`detail`** is the `detail` of any `CustomEvent`, so a library that sends data that way (a
  map's selected marker, a date picker's range) reaches the parser like a Gyral child's output.
  Its type is `unknown`: check it with a type guard or a schema before you use it.
- **`event`** is the raw event, if you need anything else.

A store finder whose map element dispatches `marker-select`, with the marker as `detail`:

```ts
// src/store-finder.ts
import { define, html } from '@gyral/core';

export interface Marker {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
}

const isMarker = (u: unknown): u is Marker =>
  typeof u === 'object' &&
  u !== null &&
  'id' in u &&
  typeof u.id === 'string' &&
  'lat' in u &&
  typeof u.lat === 'number' &&
  'lng' in u &&
  typeof u.lng === 'number';

export type Msg = { readonly _tag: 'Select'; readonly marker: Marker };

export const StoreFinder = define<{ readonly selected: string }, Msg>()('my-store-finder', {
  init: () => ({ selected: '' }),
  intent: {
    Select: ({ detail }) => (isMarker(detail) ? { _tag: 'Select', marker: detail } : undefined),
  },
  update: { Select: (_s, m) => ({ selected: m.marker.id }) },
  view: (s, i) => html`
    <geo-map data-intent-marker-select=${i.Select}></geo-map>
    <p>Selected store: <output>${s.selected}</output></p>
  `,
});
```

The element's events must bubble, or be dispatched on the element that carries the intent
attribute, as here.

Keep the parser the place where library specifics live: the message it returns is plain data,
so `update` and your tests never know which library you used.

This website's build checks this path: a Gyral component hosts a non-Gyral custom element,
receives its custom event through `data-intent-on` alone, and reads both `detail` and the
element. A second component receives the same event through a `data-intent-<event>` attribute.

## Styling them

Style a library element from your component's `styles`, with the hooks the library documents:

- **Custom properties** pass through shadow roots, so a library's tokens can be set on the
  element or on `:host`:
  `:host { --sl-input-border-radius-medium: 0; }`.
- **`::part()`** reaches the parts a library exposes:
  `sl-select::part(combobox) { border-color: var(--brand); }`.
- Ordinary selectors style the element itself (its host box), not its insides.

Gyral's own [theming](/docs/styling/#theming-with-custom-properties) uses the same two
mechanisms, so one set of design tokens can drive your components and the library's.

## Loading and server rendering

- Load the library in the browser, the way its docs say (usually one import per component, or
  a loader script). Its elements upgrade when their definitions arrive.
- On the server, don't import browser-only libraries. Gyral's server renderer writes a custom
  element that isn't a Gyral component as a plain element, with its attributes and children, so
  `<sl-select>` and its `<sl-option>` children arrive as plain HTML and the library upgrades
  them in the browser. Hydration leaves whatever the library renders inside it alone.
  Property bindings such as `.value=${…}` are applied in the browser only; pass anything the
  first paint needs as an attribute.
- Until the library loads, its elements aren't interactive. For anything that must work
  without JavaScript, such as a form's main fields, use native elements (`<select>`, `<input>`)
  and style them.

## Types

Libraries usually register their tags in `HTMLElementTagNameMap` when you import their types,
which lets `target instanceof` checks and `querySelector` know the element's class. Without
that, read properties defensively, as `valueOf` does above.
