---
title: Forms
description: A complete validated form to copy, then the browser's own checks or one Standard Schema for client and server. Works with or without JavaScript.
section: Guides
order: 6
useWhen: building a form with validation and error messages (the page starts with one complete component to copy), with no extra packages or with one schema shared by client and server; posting a form; file uploads
---

# Forms

Gyral forms are real `<form>` elements, and a submit is an intent like any other. Start from
the complete example below: one component with everything a validated form needs, built on the
browser's own checks, with no extra packages. Copy it and change the fields; you don't need
another page to make it work.

## Complete example: a validated form

A signup form with a name, an email, a password and a checkbox the user must tick. On submit it
shows every error next to its field, announces how many fields to fix, and moves focus to the
first invalid one. Fixing a field clears its error; a valid submit announces a welcome.

<!-- include: recipes/account-form.ts.txt -->

What each part does:

- **`novalidate` on the form, constraints on the fields.** `required`, `type="email"` and
  `minlength` still set each field's `validity`; `novalidate` only stops the browser from
  blocking the submit with its own bubble. Without it, no `submit` event fires and your
  messages never appear.
- **The submit intent is the parser.** `data-intent=${i.Submit}` on the `<form>` runs `Submit`
  on `submit` (and Gyral prevents the page load). `target` is the `<form>`, so
  `target.elements.namedItem('email')` is the email input, and `formData` holds the submitted
  values. `Submit` isn't a message tag, so it may return either message: `Rejected` with every
  field's error, or `SignedUp` with the trimmed values.
- **`problemWith(input)` turns `validity` into your words**: `valueMissing`, `typeMismatch`,
  `tooShort`, and `checked` for the checkbox. It trims first, because `required` accepts a value
  of spaces.
- **Errors are state**: one string per field, `''` for none. The view writes each message in a
  `<p>` next to its field, links it with `aria-describedby` and sets `aria-invalid`.
- **The `role="alert"` paragraph announces the summary.** It is always rendered, empty until a
  submit fails, so screen readers announce the text when it appears. `role="status"` announces
  the welcome the same way, politely.
- **Focus moves to the first invalid field** with a `focus()` command returned from the
  `Rejected` reducer. Commands are data; the runtime moves the focus after rendering.
- **Fixing a field clears its error.** Each control sends `Checked` (text fields on `input`,
  the checkbox on `change`); the reducer updates only a field that already shows an error, so
  nothing turns red while someone is still typing.
- **Values stay in the fields.** The view binds no `value`, so a rejected submit leaves what the
  user typed. Bind `value=${s.name}` only when state must set the text, such as emptying a
  field after a submit.
- **Enter submits**, because the form has a submit button, and a click submits the same way.
- **No password in state.** `SignedUp` carries the name and the email only.

To adapt it, add the field's name to `FIELDS`, give it a `case` in `problemWith`, and render a
labelled control with the same `id` and `name` plus its error `<p>`. To send the form to a
server, keep the raw `FormData` in the message and return a command that posts it, as in
[Submitting to the server](#submitting-to-the-server). The
[signup form recipe](/docs/recipes/#a-signup-form-with-native-validation) has the same
component with its tests: the reducers without a browser, and the parser with `mount()`.

There are two ways to validate a form. The example uses the first; add the second when a server
needs the same rules.

- **[Native validation](#native-validation)**, with no extra packages. The browser's
  constraints (`required`, `type="email"`, `minlength`) find what is wrong, and the submit
  parser reads each field's `validity` and returns your messages. It works in any app,
  including a new `basic` one.
- **[One schema for both sides](#one-schema-for-both-sides).** A
  [Standard Schema](https://standardschema.dev) library validates in the browser and on the
  server, the form posts with `@gyral/http`, and the same errors render without JavaScript.

## Native validation

**`required` without `novalidate` hides your errors.** The browser checks constraints before
it fires `submit`. When one fails, it shows its own bubble and fires no `submit` event, so your
parser never runs and your messages never appear. Put `novalidate` on any form that shows its
own errors, and keep the constraints on the fields: they still set `validity`, which the parser
reads, as in the [complete example](#complete-example-a-validated-form).

Each constraint sets one `validity` flag, so the parser can say exactly what is wrong:

| Constraint                       | Flag                                              | Notes                               |
| -------------------------------- | ------------------------------------------------- | ----------------------------------- |
| `required`                       | `valueMissing`                                    | A value of spaces passes: trim it   |
| `required` on a checkbox         | `valueMissing`                                    | Set while it is unchecked           |
| `type="email"`, `type="url"`     | `typeMismatch`                                    | Only for a value that isn't empty   |
| `minlength`, `maxlength`         | `tooShort`, `tooLong`                             | Only after the user edits the value |
| `pattern`                        | `patternMismatch`                                 |                                     |
| `min`, `max`, `step`             | `rangeUnderflow`, `rangeOverflow`, `stepMismatch` | Numbers, dates and times            |
| `type="number"`, unparsable text | `badInput`                                        | The `value` reads as `''`           |

`validity.valid` is `true` when no flag is set, and `form.checkValidity()` asks every field at
once. A message set with `setCustomValidity()`, as the [`invalid()`](#form-and-invalid) hook
does, sets `customError`, so read the specific flags rather than `valid` when you combine them.

`novalidate` in server-rendered markup turns validation off for visitors without JavaScript
too. If your form also posts to a server, render `?novalidate=${s.live}` and set `live` in the
`Hydrated` reducer, as in [Schema messages for everything](#schema-messages-for-everything),
and validate again on the server.

## One schema for both sides

When a server handles the form too, validate it with one schema on both sides. Each layer is
optional; use as many as a form needs:

1. **Native constraints**: `required`, `type="email"`, `minlength`, `pattern`.
2. **A schema-parsed intent**: `form(schema, toMsg)` validates the submission.
3. **Errors in the model**, mirrored into native validity with `invalid()`.
4. **Server checks** as ordinary commands: `submitForm()` posts the form.
5. **No-JavaScript parity**: the server's `formAction()` validates with the same schema and
   renders the same errors.

This path needs `@gyral/http` for the post, `@gyral/ssr` for the server half and a schema
library. Define the form once with any [Standard Schema](https://standardschema.dev) library, such as
Zod, Valibot, ArkType or Effect Schema. Form values arrive as strings; the schema coerces them.

```ts
// src/signup-form.ts
import { defineForm } from '@gyral/core';
import * as v from 'valibot';

export const SignupForm = defineForm(
  v.object({
    email: v.pipe(v.string(), v.trim(), v.email('Enter an email address like ada@example.com.')),
    password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters.')),
    invite: v.optional(v.string()),
  }),
  // Never echoed back after a failed submit. Fields named like `password` are secret already.
  { secret: ['invite'] },
);
```

The definition is also what the server uses: `SignupForm.validate(data)` checks a `FormData`
the way `form()` does, and `SignupForm.values(data)` returns the submitted values to re-fill a
form, without its secret fields.

**Secret fields are never echoed.** After a failed submit, the submitted values come back so the
form can be re-filled, except fields listed in `secret` (any posted field name, not only the
schema's) and any field whose name contains `password`, `passcode`, `csrf` or `xsrf`. They're left out of `IntentRejected.values` on both paths and out of
`values()`, and the devtools timeline shows them as `[secret]`. Development builds warn once
about an unlisted field whose name looks secret (`token`, `card`, `cvc`, …).

## form() and invalid()

```ts
// src/signup.ts
import { define, fieldErrors, form, html, invalid } from '@gyral/core';
import { redirectedTo, submitForm } from '@gyral/http';
import { SignupForm } from './signup-form.js';

export interface State {
  readonly email: string;
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly busy: boolean;
  readonly done: string | undefined;
}

export type Msg =
  | { readonly _tag: 'Submit'; readonly form: FormData }
  | { readonly _tag: 'Done'; readonly location: string | undefined }
  | { readonly _tag: 'Failed' };

export const Signup = define<State, Msg>()('my-signup', {
  init: () => ({ email: '', errors: {}, busy: false, done: undefined }),
  intent: {
    // Valid in the browser: post the raw FormData so the server parses it like a no-JS post.
    Submit: form(SignupForm, (_data, raw) => ({ _tag: 'Submit', form: raw })),
  },
  update: {
    Submit: (s, m) => [
      { ...s, errors: {}, busy: true },
      [
        submitForm('/signup', m.form, {
          onSuccess: (body): Msg => ({ _tag: 'Done', location: redirectedTo(body) }),
          onFailure: (): Msg => ({ _tag: 'Failed' }),
        }),
      ],
    ],
    Done: (s, m) => ({ ...s, busy: false, done: m.location ?? '/' }),
    Failed: (s) => ({ ...s, busy: false, errors: { '': ['Something went wrong. Try again.'] } }),
    // Browser-side and server-side rejections arrive as the same message.
    IntentRejected: (s, m) => ({
      ...s,
      busy: false,
      email: typeof m.values?.['email'] === 'string' ? m.values['email'] : s.email,
      errors: fieldErrors(m.issues),
    }),
  },
  view: (s, i) => html`
    <form data-intent=${i.Submit} action="/signup" method="post">
      <label for="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autocomplete="email"
        required
        value=${s.email}
        aria-describedby="email-error"
        ${invalid(s.errors['email'])}
      />
      <span id="email-error">${s.errors['email']?.join(' ') ?? ''}</span>

      <label for="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autocomplete="new-password"
        minlength="8"
        required
        aria-describedby="password-error"
        ${invalid(s.errors['password'])}
      />
      <span id="password-error">${s.errors['password']?.join(' ') ?? ''}</span>

      <p role="alert">${s.errors['']?.join(' ') ?? ''}</p>
      <button ?disabled=${s.busy}>Create account</button>
    </form>
  `,
});
```

What happens on submit:

- **The browser checks native constraints first.** If `required` or `type="email"` fails, the
  browser shows its own message and no `submit` event fires, so `form()` doesn't run. Keep
  them: they work without JavaScript and are accessible. To show the schema's messages instead,
  see [Schema messages for everything](#schema-messages-for-everything).
- **`form(schema, toMsg)`** turns the `FormData` into a plain object (repeated names become
  arrays) and validates it. Valid data goes to `toMsg`, which also gets the raw `FormData`.
  Invalid data becomes `IntentRejected`, with one issue per field: `path` matches the field's
  `name`.
- **Errors live in state.** `fieldErrors(issues)` groups them by field. Keep the result in
  state: it is data, so tests can see it.
- **`invalid(errors)`** is an [element hook](/docs/views/#element-hooks) that mirrors a field's
  errors into native validity: it calls `setCustomValidity` and sets `aria-invalid`, so
  `:user-invalid` styling, the browser's error bubble and your model agree. It clears the error
  when the user edits the field.
- **The server writes `aria-invalid="true"` too**: the hook has a server half that adds it to the
  rendered start tag, so the no-JavaScript page announces errors. `aria-describedby` points at
  the message, which is plain text in the view.

`field(schema, toMsg)` does the same for a single control. Pair it with
`data-intent-on="input"` to check while the user types.

## Submitting to the server

Some checks only the server can make: the email is taken, the password is wrong. That's why
the `Submit` reducer above posts the submission with `submitForm(url, formData, handlers)` from
`@gyral/http`, once it passed the browser's checks:

- The body is the `FormData` itself, so the server parses it exactly like a no-JS post.
- A `422` answer with an `IntentRejected` body goes to your `IntentRejected` reducer, the same
  one that handles browser-side rejections.
- The CSRF token comes from the `http` driver's headers, set once for the app:
  `makeHttpDriver({ headers: csrfFromMeta('csrf-token') })` ([Effects](/docs/effects/)).
  `csrf: { token }` sends a token the app already holds.
- The default concurrency is `exhaust`: a double click doesn't submit twice.
- `redirectedTo(body)` reads the location when the server answered with a redirect.

## The server half

On the server, `formAction(definition, handlers)` from `@gyral/ssr` handles the same route for
both paths:

```ts
// server/app.ts
import { Hono } from 'hono';
import { html, type IntentRejected } from '@gyral/core';
import { formAction, rejectWith, renderPage, seeOther } from '@gyral/ssr';
import { SignupForm } from '../src/signup-form.js';

const taken = new Set(['ada@example.com']);

const signupPage = (rejected: IntentRejected | undefined, status = 200): Response =>
  renderPage(
    {
      title: 'Create an account',
      body: html`<main>
        <h1>Create an account</h1>
        <my-signup .initialMessages=${rejected === undefined ? [] : [rejected]}></my-signup>
      </main>`,
      scripts: ['/src/entry-client.ts'],
    },
    { status },
  );

export const app = new Hono();

app.get('/signup', () => signupPage(undefined));

app.post('/signup', (c) =>
  formAction(SignupForm, {
    intent: 'Submit', // the form's data-intent name
    valid: (data) =>
      taken.has(data.email)
        ? rejectWith([{ path: 'email', message: 'That email is already registered.' }])
        : seeOther('/welcome'),
    invalid: (rejected) => signupPage(rejected, 422),
  })(c.req.raw),
);
```

- **One validator.** `formAction` runs the definition's `validate`, as `form()` does, so a
  submission is rejected with identical issues on either path.
- **One reducer.** On failure, the server renders the component with
  `initialMessages: [rejected]`. The component's own `IntentRejected` reducer builds the error
  state during the server render, and the browser resumes from it.
- **Post/Redirect/Get.** `seeOther(url)` answers `303`, so reloading never resubmits.
- **JSON for the JavaScript path.** When `submitForm` asks for JSON, a redirect becomes
  `{ _tag: 'Redirected', location }` and a rejection a `422` without the submitted values.
  Browser form posts get HTML. Leave `invalid` out and every rejection is that JSON `422`;
  `wantsJson(request)` tells your own routes which kind of request they got.
- **`rejectWith(issues | message)`** rejects a schema-valid submission; a string is a
  form-level message (path `''`).

Never keep passwords in state either: server-rendered state is written into the page.

## Schema messages for everything

Native constraints run before `form()`, so a missing required field shows the browser's wording,
not your schema's. That's usually what you want. If you'd rather show the schema's messages for
everything, keep the constraints in the server-rendered markup and add `novalidate` once the
component is live:

```html
<form data-intent="${i.Submit}" ?novalidate="${s.live}">…</form>
```

with `Hydrated: (s) => ({ ...s, live: true })` in `update`. No-JavaScript visitors still get
native validation, and every JavaScript submit reaches `form()`.

## File uploads

For a custom element that submits a native form value, see
[Custom form controls](/docs/form-associated/).

Use a native file input and keep the raw `FormData` from the parsed submit. This sends the
file bytes instead of converting them to JSON:

```ts
// src/photo-upload.ts
import { define, defineForm, form, html } from '@gyral/core';
import { submitForm } from '@gyral/http';
import * as v from 'valibot';

const PhotoForm = defineForm(v.object({ photo: v.instance(File) }));
type State = { readonly status: string };
type Msg =
  | { readonly _tag: 'Submit'; readonly data: FormData }
  | { readonly _tag: 'Uploaded' }
  | { readonly _tag: 'Failed' };

export const PhotoUpload = define<State, Msg>()('photo-upload', {
  init: () => ({ status: 'Choose a photo.' }),
  intent: { Submit: form(PhotoForm, (_data, raw) => ({ _tag: 'Submit', data: raw })) },
  update: {
    Submit: (_s, m) => [
      { status: 'Uploading…' },
      [
        submitForm('/photos', m.data, {
          onSuccess: (): Msg => ({ _tag: 'Uploaded' }),
          onFailure: (): Msg => ({ _tag: 'Failed' }),
        }),
      ],
    ],
    Uploaded: () => ({ status: 'Photo uploaded.' }),
    Failed: () => ({ status: 'Upload failed. Try again.' }),
    IntentRejected: () => ({ status: 'Choose a photo before uploading.' }),
  },
  view: (s, i) => html`
    <form action="/photos" method="post" enctype="multipart/form-data" data-intent=${i.Submit}>
      <label for="photo">Photo</label>
      <input id="photo" name="photo" type="file" accept="image/*" required />
      <button type="submit">Upload</button>
      <output aria-live="polite">${s.status}</output>
    </form>
  `,
});
```

Do not set `content-type` yourself: the browser adds the multipart boundary. `accept` is a
picker hint, not server validation. The server must enforce size, count, content and storage
rules and apply authentication/CSRF checks. The schema above checks only that a file object
exists; add your application's browser checks and validate again on the server. File inputs
cannot be restored from a hydration seed or sticky rejected values; keep files in the submit
boundary, not model state. See [Security](/docs/security/#uploaded-files).
