---
title: Devtools
description: Watch every message, state change and command in your app with an in-page panel that costs nothing in production builds.
section: Guides
order: 16
---

# Devtools

Gyral's loop is data from end to end: an event becomes a message, a reducer turns it into state
and commands, a driver answers with another message. So a timeline of exactly what happened is
cheap to record. `@gyral/devtools` shows it in a panel inside your page.

```sh
npm install -D @gyral/devtools
```

## Opening the panel

Load it in development only, behind a URL parameter, so production builds never include it:

```ts
// src/devtools.ts
// Add ?devtools to the URL to open the panel. `vite build` replaces import.meta.env.DEV with
// false, so the import below disappears from production bundles.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('devtools')) {
  void import('@gyral/devtools').then(({ mountDevtools }) => {
    mountDevtools({ open: true });
  });
}

export {};
```

Import that module from your client entry. Every Gyral example works this way: add `?devtools`
to an example's URL to open it.

`mountDevtools(options)` returns `{ panel, unmount }`. The options are `open` (start open),
`parent` (where to put the panel; default `document.body`) and `shortcutCode` (the key used with
Alt+Shift to toggle it; default `KeyD`).

## What it shows

- **Timeline.** Every event, newest first: components connecting, disconnecting and
  hydrating; each message with the state before and after; each command as it's issued,
  dropped (`exhaust`), interrupted (`switch`, disconnect), settled with the driver's output, or
  failed with its error; and store messages. Filter by text or by kind. The last 500 events are
  kept.
- **Components.** The live instances, with a preview of each one's current state. Components that
  connected before the panel loaded are listed too.
- **Command lanes.** Each lane's owner, policy, last phase and how many commands are in flight,
  which makes a stuck request or an unexpected `switch` easy to spot.

Toggle the panel with its button or **Alt+Shift+D**. It is itself a Gyral component: a labelled
region with a real heading and keyboard-operable controls, in light and dark.

## Free in production

The instrumentation lives in `@gyral/core`, behind a package-internal import with a
`development` condition. Vite resolves that condition in the dev server and in Vitest, and the
production one in `vite build`, where every call site is guarded by a constant `false`. The
bundler drops the call sites and the module: a production build contains neither the hook nor
its event code. Measured across Gyral's examples, the largest size change was 0.1 KiB.

With other bundlers, set the `development` resolve condition in development builds to get events.
Without it you get the safe default: no events.

## Building your own tools

The panel listens through a small hook. A development build of `@gyral/core` emits each event to
`globalThis.__GYRAL_DEVTOOLS__.emit(event)` when that object exists (`DEVTOOLS_GLOBAL` names
the property, and the `DevEvent` type describes the events). Without a listener, Gyral returns
before building an event. Event payloads hold live references to elements and state: read them,
never change them.
