---
title: Forms
description: Real forms with native validation, one Standard Schema for client and server, errors kept in the model, and the same behaviour with or without JavaScript.
section: Guides
order: 6
---

# Forms

Gyral forms are real `<form>` elements. They post to a real URL, so they work before
JavaScript loads. With JavaScript, the same form is validated in the browser by the same schema
the server uses, and the server's answer comes back as a message. Each layer is optional; use
as many as a form needs.

1. **Native constraints**: `required`, `type="email"`, `minlength`, `pattern`.
2. **A schema-parsed intent**: `form(schema, toMsg)` validates the submission.
3. **Errors in the model**, mirrored into native validity with `invalid()`.
4. **Server checks** as ordinary commands: `submitForm()` posts the form.
5. **No-JavaScript parity**: the server's `formAction()` validates with the same schema and
   renders the same errors.

## One schema for both sides

Define the form once with any [Standard Schema](https://standardschema.dev) library, such as
Zod, Valibot, ArkType or Effect Schema. Form values arrive as strings; the schema coerces them.

```ts
// src/signup-form.ts
import { defineForm } from '@gyral/core';
import * as v from 'valibot';

export const SignupForm = defineForm(
  v.object({
    email: v.pipe(v.string(), v.trim(), v.email('Enter an email address like ada@example.com.')),
    password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters.')),
  }),
);
```

## form() and invalid()

```ts
// src/signup.ts
import { define, fieldErrors, form, html, invalid, redirectedTo } from '@gyral/core';
import { submitForm } from '@gyral/http';
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

export const Signup = define<State, Msg>('my-signup', {
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
          csrf: { meta: 'csrf-token' },
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
  browser shows its own message and no `submit` event fires. Keep them: they work without
  JavaScript and are accessible.
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
- `csrf: { meta: 'csrf-token' }` reads `<meta name="csrf-token">` when the request runs.
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

- **One validator.** `formAction` runs the same `validateForm` as `form()`, so a submission is
  rejected with identical issues on either path.
- **One reducer.** On failure, the server renders the component with
  `initialMessages: [rejected]`. The component's own `IntentRejected` reducer builds the error
  state during the server render, and the browser resumes from it.
- **Post/Redirect/Get.** `seeOther(url)` answers `303`, so reloading never resubmits.
- **JSON for the JavaScript path.** When `submitForm` asks for JSON, a redirect becomes
  `{ _tag: 'Redirected', location }` and a rejection a `422` without the submitted values.
  Browser form posts get HTML.
- **`rejectWith(issues | message)`** rejects a schema-valid submission; a string is a
  form-level message (path `''`).

Never keep passwords in state: server-rendered state is written into the page. Re-fill only the
fields that are safe to echo.

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
