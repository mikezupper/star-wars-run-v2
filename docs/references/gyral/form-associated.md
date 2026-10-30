---
title: Custom form controls
description: Make a Gyral component participate in native forms, with reset, disabled state, validity and a server-rendered fallback.
useWhen: writing a custom element that takes part in a native form: value, validity, reset and restore
section: Guides
order: 6.5
---

# Custom form controls

Use `formAssociated` when the custom element itself should submit a native form value under
its `name` attribute. The projection stays pure; Gyral owns the ElementInternals attachment.

```ts
// src/choice-field.ts
import { define, html } from '@gyral/core';

interface State {
  readonly value: string;
  readonly live: boolean;
  readonly disabled: boolean;
}
type Msg = { readonly _tag: 'Edited'; readonly value: string };

export const ChoiceField = define<State, Msg>()('my-choice-field', {
  init: () => ({ value: 'Default', live: false, disabled: false }),
  intent: { Edited: ({ value }) => ({ _tag: 'Edited', value: value ?? '' }) },
  update: {
    Edited: (s, m) => ({ ...s, value: m.value, live: true }),
    FormDisabled: (s, m) => ({ ...s, disabled: m.disabled }),
    FormReset: (s) => ({ ...s, value: 'Default' }),
    FormStateRestore: (s, m) =>
      typeof m.state === 'string' ? { ...s, value: m.state, live: true } : s,
  },
  formAssociated: { value: (s) => (s.live ? s.value : null) },
  shadow: false,
  view: (s, i) => html`
    <label>
      Choice
      <input
        name=${s.live ? undefined : 'choice'}
        value=${s.value}
        ?disabled=${s.disabled}
        data-intent=${i.Edited}
      />
    </label>
  `,
});
```

```html
<form action="/choices" method="post">
  <my-choice-field name="choice"></my-choice-field>
  <button type="submit">Save</button>
  <button type="reset">Reset</button>
</form>
```

The light DOM fallback input participates in the outer form before JavaScript runs. The
custom control returns `null` until an input event captures the live value in the model.
It then submits that value and removes the fallback's `name`, avoiding duplicate entries.
The input remains usable. Switching solely on `Hydrated` can lose a value typed before
hydration; Gyral does not automatically read arbitrary fallback inputs into state.

`value` may return a string, File, FormData or null. An optional `state` projection supplies
a separate restoration value. Keep server-rendered model state JSON-compatible; binary
values belong at the browser boundary.

An optional `validity` projection returns native flags, a message and an anchor selector:

```ts
const validity = (s: { readonly value: string }) =>
  s.value === ''
    ? { flags: { customError: true }, message: 'Enter a choice.', anchor: 'input' }
    : undefined;
```

Returning `undefined` clears validity. Mirror effective disabled state to inner controls.
`FormReset`, `FormDisabled` and `FormStateRestore` reducers are optional; reset does not rerun
`init`. Restoration messages carry `state` and `mode` (`restore` or `autocomplete`). Forms
and the `states` spec share Gyral's single internals attachment.
