---
title: Using Gyral in other frameworks
description: Gyral components are standard custom elements. Use them in plain HTML, React, Vue or Svelte - set their props and listen to their outputs.
useWhen: using a Gyral component inside React, Vue, Svelte or plain HTML pages
section: Guides
order: 18
---

# Using Gyral in other frameworks

Every Gyral component is a standard custom element. Anything that can put an element on a page
can use one: plain HTML, a server template, React, Vue, Svelte. That means you can adopt Gyral
one component at a time inside an existing app.

Two things cross the boundary: **props** go in, **outputs** come out.

## The component

This picker takes a label, a maximum and a list of items, and reports which one was picked:

```ts
// src/picker.ts
import { define, each, html, intentsOf, outputs, prop, type TemplateResult } from '@gyral/core';
import * as v from 'valibot';

export type PickerOutput = { readonly _tag: 'Picked'; readonly id: string };

const emit = outputs<PickerOutput>();

type Msg = { readonly _tag: 'Pick'; readonly id: string };

const i = intentsOf<typeof Picker>();
const Item = (id: string): TemplateResult =>
  html`<li><button type="button" value=${id} data-intent=${i.Pick}>${id}</button></li>`;

export interface PickerProps {
  readonly label: string;
  readonly max: number;
  readonly items: readonly string[];
}

export const Picker = define<{ readonly picks: number }, Msg, PickerProps, PickerOutput>()(
  'my-picker',
  {
    props: {
      label: prop.string({ default: 'Pick one' }),
      max: prop.number({ default: 0 }),
      items: prop.value(v.array(v.string()), { default: [] }),
    },
    init: () => ({ picks: 0 }),
    intent: { Pick: ({ value }) => (value ? { _tag: 'Pick', id: value } : undefined) },
    update: {
      Pick: (s, m) => [{ picks: s.picks + 1 }, [emit({ _tag: 'Picked', id: m.id })]],
    },
    view: (_s, _i, { props }) => html`
      <p>${props.label} (up to ${props.max})</p>
      <ul>
        ${each(props.items, (id) => id, Item)}
      </ul>
    `,
  },
);

declare global {
  interface HTMLElementTagNameMap {
    'my-picker': InstanceType<typeof Picker>;
  }
}
```

## Props: attributes or properties

A prop declared with `prop.string`, `prop.number`, `prop.boolean` or `prop.json` can be set
either way:

- as an **attribute**, a string in HTML: `<my-picker label="Choose" max="2">`. Gyral parses it
  with the prop's builder and validates it, so `max` arrives as the number `2`, and `max="lots"`
  is logged and ignored. Attribute names are the kebab-case of the prop name: a `maxItems` prop
  reads `max-items`;
- as a **property**, any JavaScript value: `picker.max = 2`.

A prop declared with `prop.value(schema)`, like `items`, is a property only. Use that for arrays,
objects and anything else that doesn't fit in a string. Props never write attributes back.

## Outputs: the gyral-output event

A component's outputs (what its reducers return through `outputs<Out>()`, `emit` above) are
dispatched from its element as a `gyral-output` event, with the output in `event.detail`.
`@gyral/core` exports the name as `OUTPUT_EVENT`, and the types `OutputEvent<O>` and
`OutputsOf<typeof Component>` to read it. The event **bubbles but isn't composed**: it travels up
the tree the element is in, and stops at the edge of a shadow root. Inside a Gyral app it also stops
at the direct parent whose intent takes it, so a grandparent never hears a grandchild's output.

So listen on the element itself, or on any ancestor in the same tree:

```ts
// src/main.ts
import { OUTPUT_EVENT, type OutputEvent, type OutputsOf } from '@gyral/core';
import './picker.js'; // defines <my-picker>
import type { Picker } from './picker.js';

const picker = document.createElement('my-picker');
picker.setAttribute('label', 'Choose a size');
picker.items = ['S', 'M', 'L'];

picker.addEventListener(OUTPUT_EVENT, (event) => {
  const output = (event as OutputEvent<OutputsOf<typeof Picker>>).detail;
  console.log(`picked ${output.id}`);
});

document.body.append(picker);
```

If you put the element inside another shadow root, listeners outside that shadow root don't
hear it. That is what keeps a Gyral parent's children private, and why the element itself is
the reliable place to listen.

The other direction works too: any custom element talks to a Gyral parent by dispatching
`new CustomEvent(OUTPUT_EVENT, { detail: { _tag: 'Picked', id }, bubbles: true })` on itself.
The parent names it with `data-intent`, as it would a Gyral child, and reads the output from the
parser's `detail`.

These rules are checked: this website's build mounts a component like this one in a plain page
and verifies that attribute props are parsed, property props render, the output reaches the
element and the document, it doesn't leave an enclosing shadow root, and a plain custom element
reaches a Gyral parent with `OUTPUT_EVENT`.

## TypeScript

The `HTMLElementTagNameMap` entry in the component file (above) is what makes
`document.createElement('my-picker')` and `querySelector('my-picker')` return the component's
type, props included. Inside a Gyral app `gyral()` generates these entries; for components
you publish to other apps, write the entry in the component's own file, as above, so it ships in
your package's types.

## React 19

React 19 supports custom elements directly. Per React's documentation, on the client it sets a
prop as a property when the element has a property of that name, and as an attribute
otherwise; during server rendering it writes primitive values as attributes and leaves out
objects and arrays. For outputs, attach the listener yourself:

```tsx
import { useEffect, useRef } from 'react';
import './picker.js';

export function SizePicker({ onPick }: { onPick: (id: string) => void }) {
  const ref = useRef<HTMLElementTagNameMap['my-picker']>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.items = ['S', 'M', 'L'];
    const listener = (e: Event) => onPick((e as CustomEvent<{ id: string }>).detail.id);
    el.addEventListener('gyral-output', listener);
    return () => el.removeEventListener('gyral-output', listener);
  }, [onPick]);
  return <my-picker ref={ref} label="Choose a size" />;
}
```

TypeScript needs to know the tag in JSX; declare it in React's `JSX.IntrinsicElements`
(`declare module 'react' { namespace JSX { interface IntrinsicElements { 'my-picker': … } } }`).

The client spike verifies React 19.2.8 assigning array properties, updating them and hearing
`gyral-output` with an exact-case `'ongyral-output'` handler passed to `createElement`.
The `ref` approach above also uses the DOM directly. React server rendering is outside that
check; see the server-rendering boundary below.

## Vue

Tell Vue's compiler which tags are custom elements, so it doesn't look for Vue components with
those names:

```js
// vite.config.js
import vue from '@vitejs/plugin-vue';

export default {
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('my-') } } }),
  ],
};
```

Then bind properties with `.prop` (or `:items` once the element is defined) and listen with
`@gyral-output`:

```vue
<my-picker label="Choose a size" :items.prop="['S', 'M', 'L']" @gyral-output="onPick" />
```

The client spike verifies Vue 3.5.43 with `isCustomElement`, `.prop`, property updates and
`@gyral-output`.

## Svelte

Svelte sets a value as a property when the element defines that property, so import the
component's module before the markup renders. For outputs, listen on the element with
`addEventListener` in an effect, as in the React example. The client spike verifies Svelte
5.57.2 assigning and updating array properties and hearing outputs with an effect listener.

These checks run in real Chromium with `pnpm verify:platforms` in the framework repository. They
install pinned host
packages in a temporary directory, leaving Gyral's runtime dependency graph unchanged. They cover
client mounts, not each host's SSR/hydration integration. The [spike
report](https://github.com/gyraljs/gyral/blob/v0.3.8/docs/references/platform-spikes-2026-10-11.md)
records the results, fixtures and limits.

## Server rendering in another framework

Gyral's server renderer knows nothing about React's or Vue's. Inside another framework's server
render, a Gyral element is written as its tag and attributes only, and renders in the browser
once its module loads. For server-rendered Gyral components, render those pages with
[`@gyral/ssr`](/docs/server-rendering/).
