---
title: Accessibility
description: Build Gyral views with native controls, useful labels, announced errors, predictable focus, and browser tests that cover keyboard interaction.
section: Guides
order: 22
---

# Accessibility

Start with the element that already has the behavior you need:

```html
<form action="/search" method="get">
  <label for="query">Search products</label>
  <input id="query" name="q" type="search" />
  <button type="submit">Search</button>
</form>
```

Native controls provide keyboard behavior, focus and accessible roles. Your Gyral view keeps
those semantics while `data-intent` names the messages. Use links for navigation, buttons for
actions, labels for inputs, and `fieldset`/`legend` for related choices. A placeholder does
not replace a visible label.

## Labels and shadow roots

A label and its control must share the relevant tree. A page's `label for` cannot simply
point at an input hidden in another component's shadow root. Put the label inside the
component, or use a deliberate naming contract that copies the external label into its
accessible name. The skill's [view recipes](https://github.com/gyraljs/gyral/blob/next/skills/gyral/references/view.md)
include naming a component's form from the page. The former `labelledBy` export was removed
in 0.3.1; the recipe is application code.

Test the computed accessible name in the browser. Setting a prop called `label` does not
itself guarantee the rendered control has a name. Prefer native semantics before adding ARIA;
the [WAI guidance](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/) explains when custom
interaction patterns need more work.

## Form errors

Keep schema failures as `IntentRejected` messages and visible errors in state.
`invalid(errors)` mirrors an error to native validity and `aria-invalid` on the server and
client. Add visible error text and connect it to the control:

```ts
// src/email-control.ts
import { html, invalid } from '@gyral/core';

export const emailControl = (errors: readonly string[]) => html`
  <label for="email">Email address</label>
  <input
    id="email"
    name="email"
    type="email"
    required
    aria-describedby="email-error"
    ${invalid(errors)}
  />
  <p id="email-error">${errors.join(' ')}</p>
`;
```

For a submit failure, show a useful summary and move focus to it or the first invalid control
when that helps the user recover. Do not put every keystroke's validation message in an alert
region. See the complete [form validation example](/docs/forms/).

## Focus after an update or navigation

Return `focus(selector)` as a command. Gyral applies it after the DOM update, within the
component's own root. A heading needs `tabindex="-1"` to accept programmatic focus without
becoming a normal Tab stop. `focus(selector, { wait: true })` can wait for a target that appears
in a later render. Avoid moving focus for routine background changes.

The router's [scroll and focus options](/docs/routing/#scroll-and-focus) handle navigation
after rendering settles. Test forward navigation and back/forward traversal; preserving a
user's place and announcing a new page require different behavior. Lists should use stable
`each()` keys so focus follows the same item when rows move. Where `moveBefore()` is absent,
the renderer uses `insertBefore()`; check your application's focus-sensitive interactions on
the browsers you support.

## Announcements, language and motion

Use `output` for a computed result and a restrained status/live region for asynchronous
results that need announcing. Give a busy region `aria-busy` when appropriate. Do not announce
the whole page on every render. Use `dialog.showModal()` through a modal binding for modal
interaction, and keep a visible close control and a useful accessible name.

Set the document's `lang` and text direction. Keep machine date values locale-neutral and
isolate unknown-direction names with `bdi`. Honor `prefers-reduced-motion`; Gyral skips its
view transition when reduced motion is requested, but your own CSS animations need the same
care. Color must not be the only signal of selection, errors or status.

## Verify the real interface

Use browser tests to check roles, names, keyboard actions, focus after errors, Escape/close
behavior and focus return. Run axe on the rendered document and its shadow roots; the Gyral
repository's `pnpm ui:check` runs axe, overflow and console checks across desktop/phone and
light/dark. Apps own their equivalent checks. Automated checks catch some defects; also
exercise keyboard-only and screen-reader flows for your important tasks.

See [Testing](/docs/testing/) for browser helpers and [Browser support](/docs/browser-support/)
for enhancement behavior.
