---
title: Using Gyral in other frameworks
description: Gyral components are standard custom elements. Use them in plain HTML, React, Vue or Svelte - set their props and listen to their outputs.
section: Guides
order: 17
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
import { define, emit, html } from '@gyral/core';

export type PickerOutput = { readonly _tag: 'Picked'; readonly id: string };

type Msg = { readonly _tag: 'Pick'; readonly id: string };

export interface PickerProps {
  readonly label: string;
  readonly max: number;
  readonly items: readonly string[];
}

export const Picker = define<{ readonly picks: number }, Msg, PickerProps, PickerOutput>(
  'my-picker',
  {
    props: {
      label: { type: String, default: 'Pick one' },
      max: { type: Number, default: 0 },
      items: { attribute: false, default: [] },
    },
    init: () => ({ picks: 0 }),
    intent: { Pick: ({ value }) => (value ? { _tag: 'Pick', id: value } : undefined) },
    update: {
      Pick: (s, m) => [{ picks: s.picks + 1 }, [emit({ _tag: 'Picked', id: m.id })]],
    },
    view: (_s, i, { props }) => html`
      <p>${props.label} (up to ${props.max})</p>
      <ul>
        ${props.items.map(
          (id) => html`<li><button value=${id} data-intent=${i.Pick}>${id}</button></li>`,
        )}
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

A prop declared with a `type` (`String`, `Number`, `Boolean`) can be set either way:

- as an **attribute**, a string in HTML: `<my-picker label="Choose" max="2">`. Gyral converts
  it by the prop's type, so `max` arrives as the number `2`;
- as a **property**, any JavaScript value: `picker.max = 2`.

A prop declared with `attribute: false`, like `items`, is a property only. Use that for arrays,
objects and anything else that doesn't fit in a string.

## Outputs: the gyral-output event

A component's outputs (whatever it passes to `emit()`) are dispatched from its element as a
`gyral-output` event, with the output in `event.detail`. The event **bubbles but isn't
composed**: it travels up the tree the element is in, and stops at the edge of a shadow root.

So listen on the element itself, or on any ancestor in the same tree:

```ts
// src/main.ts
import './picker.js';
import type { PickerOutput } from './picker.js';

const picker = document.createElement('my-picker');
picker.setAttribute('label', 'Choose a size');
picker.items = ['S', 'M', 'L'];

picker.addEventListener('gyral-output', (event) => {
  const output = (event as CustomEvent<PickerOutput>).detail;
  console.log(`picked ${output.id}`);
});

document.body.append(picker);
```

If you put the element inside another shadow root, listeners outside that shadow root don't
hear it. That is what keeps a Gyral parent's children private, and why the element itself is
the reliable place to listen.

These rules are checked: this website's build mounts a component like this one in a plain page
and verifies that attribute props convert, property props render, the output reaches the
element and the document, and it doesn't leave an enclosing shadow root.

## TypeScript

The `HTMLElementTagNameMap` entry in the component file (above) is what makes
`document.createElement('my-picker')` and `querySelector('my-picker')` return the component's
type, props included. Add one for every component you expose.

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

Not yet tested by Gyral: React's own `on…` props for custom events with `gyral-output`, and
server-rendering Gyral components inside a React server render. The `ref` approach above uses
only the DOM.

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

Not yet tested by Gyral; this follows Vue's custom elements guide.

## Svelte

Svelte sets a value as a property when the element defines that property, so import the
component's module before the markup renders. For outputs, listen on the element with
`addEventListener` in an effect, as in the React example. Not yet tested by Gyral.

## Server rendering in another framework

Gyral's server renderer runs through Lit's (`@lit-labs/ssr`), which knows nothing about
React's or Vue's server renderers. Inside another framework's server render, a Gyral element is
written as its tag and attributes only, and renders in the browser once its module loads. For server-rendered
Gyral components, render those pages with [`@gyral/ssr`](/docs/server-rendering/).
