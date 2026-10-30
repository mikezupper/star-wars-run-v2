---
title: Recipes
description: Complete components to copy, with their tests. A todo list with filters, a signup form with native validation, and fixes for common bugs.
section: Start here
order: 2
useWhen: building a list with add, toggle, delete and filters, or a form with validation and custom error messages; you want a complete, tested component to start from
---

# Recipes

Each recipe is a whole component in one file, with its tests. They need only `@gyral/core`,
plus `@gyral/testing` and Vitest for the tests, so they work in a new `basic` app from
[create-gyral](/docs/getting-started/#create-a-project). Every recipe compiles against Gyral
0.3.8, and the site tests each one in a browser when it builds.

## A todo list with filters

Add todos, tick them off, delete them, and show all, active or done ones:

<!-- include: recipes/todo-app.ts.txt -->

How it works:

- **State keeps the whole list. The view filters it.** `visible(todos, filter)` is a plain
  function that the view and the tests call. The filter is state; the filtered list isn't, so
  the two can't get out of step.
- **Controls carry the id**: `value=${todo.id}`, and the parser reads `value`. A message says
  which todo, never which row. See
  [the wrong item changes](#toggling-an-item-in-a-filtered-list-changes-the-wrong-item).
- **Rows are keyed by id**: `each(shown, (t) => t.id, Row)`. A todo keeps its element when the
  filter changes or another row goes away.
- **Rows are pure.** `Row` reads only its todo and module constants, such as
  `i = intentsOf<typeof TodoApp>()`. Its return type is written out, so `Row` and `TodoApp`
  don't infer each other's types. The view uses its own `i`.
- **The input is form state.** `value=${s.draft}` follows `Typed`, and `Add` sets `draft` back
  to `''`, which empties the input. Without `draft` in state, the text would stay after Add.
- **Focus is a command.** `Add` and `Delete` return `focus('#new-todo')`, so focus never falls
  to the page body when its row is deleted.
- The filter buttons use `.map`: three buttons that never move don't need `each`.

Test the model without a browser. `run` folds messages from `init` (or from `state`), and
`parse` runs one parser without a DOM:

<!-- include: recipes/todo-app.test.ts.txt -->

## A signup form with native validation

No extra packages. The browser's constraint checks find what is wrong, and your own messages
say it. The [Forms](/docs/forms/#complete-example-a-validated-form) page starts with this same
component and explains each part; here it comes with its tests:

<!-- include: recipes/account-form.ts.txt -->

How it works:

- **`novalidate` on the form, constraints on the fields.** `required`, `type="email"` and
  `minlength` still set each field's `validity`. `novalidate` stops the browser from blocking
  the submit. Without it, a failing constraint shows the browser's bubble and no `submit` event
  fires, so your messages never appear.
- **The submit parser reads `validity`.** `problemWith(input)` turns `valueMissing`,
  `typeMismatch`, `tooShort` and an unchecked checkbox into your words. `Submit` checks every
  field and returns `Rejected` with all the errors, or `SignedUp` with clean values. Reading the
  form is input parsing, the intent layer's job; reducers see only the result.
- **Check what the browser doesn't.** `required` accepts a name made of spaces, so the parser
  trims first. `tooShort` is set only after the user types, not for a value set by script or
  rendered by a server, so the parser checks the length too.
- **Errors are state**: one string per field, `''` for none. The view writes `aria-invalid` and
  the message, and `aria-describedby` links the message to its field.
- **Focus goes to the first invalid field**, through a `focus()` command from `Rejected`,
  and the `role="alert"` paragraph announces how many fields to fix.
- **An error clears as soon as the field is fixed.** Each field sends `Checked` on input (the
  checkbox on change). The reducer updates only a field that already shows an error, so nothing
  turns red while someone is still typing.
- **Enter submits.** The form has a submit button, so Enter in any field submits it, like a
  click.
- **No password in state.** `SignedUp` carries the name and the email. To send the form to a
  server, keep the raw `FormData` in the message and post it with a command, as in
  [Submitting to the server](/docs/forms/#submitting-to-the-server).

The reducers are tested without a browser:

<!-- include: recipes/account-form.test.ts.txt -->

The submit parser reads the form's fields, so test it in a browser too. In a `basic` app,
`npm test` runs both files in Chromium. `mount()` sets values with script, which is why the
parser's own length check matters:

<!-- include: recipes/account-form.browser.test.ts.txt -->

To validate on the server with the same rules, use one schema for both sides:
[Forms](/docs/forms/#one-schema-for-both-sides).

## Troubleshooting

### Toggling an item in a filtered list changes the wrong item

**What you see.** With a filter on, ticking a row ticks a different item, often one that isn't
shown.

**Why.** The control carries the row's position, and the reducer uses it as an index into the
whole list:

```ts
// Wrong: in the view, `n` is the row's place in the filtered list…
${visible(s.todos, s.filter).map(
  (t, n) => html`<input type="checkbox" value=${n} data-intent=${i.Toggle} />`,
)}

// …and the reducer reads it as a place in the whole list.
Toggle: (s, m) => ({
  ...s,
  todos: s.todos.map((t, n) => (n === m.index ? { ...t, done: !t.done } : t)),
}),
```

With "Active" showing, the second row on screen may be the fourth todo, so the reducer changes
`s.todos[1]` instead. A sort or a search breaks it the same way.

**Fix.** Carry the id, and find the item by id:

- Put `value=${todo.id}` on the control, and parse `value` as an id.
- Match by id in the reducer: `t.id === m.id`.
- Key the list by id: `each(shown, (t) => t.id, Row)`.

A key alone doesn't fix it. The key keeps each element with its item; the message still has to
say which item. The [todo list](#a-todo-list-with-filters) recipe does all three.

### Custom error messages never show

**What you see.** Submitting an empty form shows the browser's bubble ("Please fill out this
field"), and your parser never runs.

**Why.** Without `novalidate`, the browser checks `required`, `type="email"`, `minlength` and
`pattern` before it fires `submit`. When one fails, there is no `submit` event, so there is no
intent.

**Fix.** Add `novalidate` to the `<form>` and keep the constraints on the fields. Read each
field's `validity` in the submit parser, as the
[signup form](#a-signup-form-with-native-validation) does.
