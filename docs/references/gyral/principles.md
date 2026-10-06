---
title: Design principles
description: The beliefs behind Gyral, from "the platform is the framework" to "parse at boundaries", and what each one means for your code.
section: Background
order: 2
---

# Design principles

These are the beliefs Gyral is built on. Each one explains a decision you'll meet in the API.
The full reasoning lives in the decision records in
[Gyral's repository](https://github.com/gyraljs/gyral/tree/main/docs/design-docs).

## The platform is the framework

Custom elements, Shadow DOM, forms, `<dialog>`, popover, the Navigation and History APIs and
modern CSS come first. Gyral adds only what the platform lacks: a pure, testable application
loop.

That's why a component is a standard custom element, styles are plain CSS, links are `<a href>`
and forms are `<form>`. When the platform gains a feature, such as invoker commands or View
Transitions, Gyral uses it as an enhancement rather than building its own.

## Pure core, effects at the edges

`update` and `view` are pure functions. Side effects are described as data, as commands, and
carried out by drivers. This is the idea Gyral inherits from Cycle.js.

It's what makes a component testable without a browser, renderable on a server, and observable
in [devtools](/docs/devtools/): every change is a message, every effect a value.

## Parse at boundaries

Data is checked once, where it enters. Events become typed messages in the intent layer. Network
responses are decoded by the driver with a schema. Forms are validated by the same schema in the
browser and on the server. After the boundary, the model only ever sees valid data, so reducers
don't defend against impossible states.

## Thin layer, no walled garden

Every Gyral component works anywhere a custom element does: in a plain page, in another
framework, next to raw `LitElement` classes. There's no Gyral-only component model to buy into,
and nothing stops you from dropping down to Lit or to the DOM when you need to.

## No paradigm required

You don't need streams, a functional-effects library or decorators to use Gyral. The API is
plain TypeScript: functions, objects, unions and promises. Implementation choices stay
implementation details: Gyral 0.1 ran commands on Effect, 0.2 runs them on a small built-in
runtime, and no public type changed.

## Semantic HTML and accessibility are correctness

A component that works with a mouse but not a keyboard is broken. Gyral's examples are judged on
element choice and on the accessibility tree, not only on behaviour, and its helpers exist to
keep accessible markup right on the server and in the browser: `invalid()`, `labelledBy()`,
`liveBoolean()`, `focus()`.

## Test in a real browser

Pure functions are tested with no DOM at all. Everything else is tested in a real browser, not a
simulated DOM: Gyral's own suite runs in Chromium with Vitest browser mode, including the
hydration of real server output against production builds.

## Enforce invariants, not intentions

Rules that matter become checks with error messages that explain the fix. In Gyral's own repo,
`@gyral/core` is checked to have no runtime dependency besides Lit, views can't attach closures, and every
decision record is indexed. This site follows the same rule: every code sample on it compiles
against the real packages, and every page passes accessibility checks in light and dark mode.

## Measure, then budget

Performance claims come from measurements. Bundle size is tracked per example with production
builds, and changes such as the devtools hook are measured before and after. Budgets follow
measurements, not the other way round.
