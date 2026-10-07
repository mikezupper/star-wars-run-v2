---
title: Routing
description: Typed route tables that work on the server and in the browser, navigation as commands, and the current URL streamed into your model.
section: Guides
order: 10
---

# Routing

`@gyral/router` keeps routing inside the loop. The route is model state, derived from the URL;
navigating is a command; and every URL change arrives as a message. The route table is pure, so
the server matches requests with the same table.

```sh
npm install @gyral/router
```

## Route tables

```ts
// src/routes.ts
import { routes } from '@gyral/router';

export const app = routes({
  home: '/',
  user: '/users/:id',
  settings: '/settings',
});
```

- `app.match('/users/7')` returns `{ name: 'user', params: { id: '7' } }`, or `undefined`. The
  result is a union discriminated by `name`, and `params` is typed from the pattern.
- `app.href('user', { id: 'a b' })` builds `/users/a%20b`.
- Patterns are literal segments and `:params`, nothing more, so matching behaves the same with
  the browser's URLPattern and with Gyral's own matcher. Trailing slashes are ignored, params are
  decoded, and the first match in table order wins.
- Matching never touches `window`, so it's safe on a server.

## Listening to navigation

```ts
// src/shell.ts
import { define, html } from '@gyral/core';
import { listen, makeRouter, setTitle, type RouteLocation, type RouteMatch } from '@gyral/router';
import { app } from './routes.js';

type Route = RouteMatch<typeof app.table> | undefined;

export interface State {
  readonly route: Route;
}

export type Msg = { readonly _tag: 'Routed'; readonly location: RouteLocation };

/** One pure function names every page, so the server can render the same <title>. */
export const pageTitle = (route: Route): string =>
  route === undefined
    ? 'Not found'
    : route.name === 'user'
      ? `User ${route.params.id}`
      : route.name;

export const Shell = define<State, Msg>('my-shell', {
  // This component owns the page, so it captures same-origin link clicks.
  drivers: { router: makeRouter({ captureLinks: true }) },
  init: () => [{ route: undefined }, [listen((location): Msg => ({ _tag: 'Routed', location }))]],
  intent: {},
  update: {
    Routed: (_s, m) => {
      const route = app.match(m.location.href);
      return [{ route }, [setTitle(pageTitle(route))]];
    },
  },
  view: (s) => html`
    <nav aria-label="Main">
      <a href=${app.href('home', {})}>Home</a>
      <a href=${app.href('user', { id: '7' })}>User 7</a>
      <a href=${app.href('settings', {})}>Settings</a>
    </nav>
    <main><h1>${pageTitle(s.route)}</h1></main>
  `,
});
```

`listen(toMsg)` is one long-running command. It delivers the current location at once, then
every change (link clicks, `navigate()`, back and forward), until the component disconnects.
The view is a pure function of the route in state.

## Navigating

Navigation is a command, returned from a reducer like any other:

| Command                        | Does                                                |
| ------------------------------ | --------------------------------------------------- |
| `navigate(url)`                | Push a history entry (`{ replace: true }` replaces) |
| `back()`, `forward()`, `go(n)` | Move through history                                |
| `setTitle(title)`              | Set `document.title`                                |

```ts
// src/save.ts
import type { Command } from '@gyral/core';
import { navigate } from '@gyral/router';
import { app } from './routes.js';

/** After saving, go to the user's page without adding a history entry. */
export const afterSave = (id: string): Command<never> =>
  navigate(app.href('user', { id }), { replace: true });
```

The router uses the Navigation API where the browser has it and the History API elsewhere, so
both behave the same.

## Links

Links stay plain `<a href>` elements. They work before JavaScript loads, open in new tabs, and
are what crawlers follow.

Link capture is **opt-in**: `makeRouter({ captureLinks: true })` turns same-origin clicks into
in-app navigations, and only while some component is listening. That's right for an app that
owns the whole page. In a multi-page, server-rendered site where only one component routes, leave
it off, so ordinary links keep loading pages.

Captured clicks skip modified clicks (new tab), `target` other than `_self`, `download`,
`rel="external"`, other origins and same-page `#hash` links. Anchors inside shadow roots work.
`linkRoot: element` limits capture to one part of the page.

## Titles

Titles often depend on data, such as a product's name, not only on the route. So they're
computed by a pure function of state, `pageTitle` above, and set with `setTitle()` from the
reducer. The server calls the same function for `<title>`, so the two can't disagree.

## Server-side routes

On the server, match the request with the same table, choose the status, and render:

```ts
// server/app.ts
import { Hono } from 'hono';
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { app as routes } from '../src/routes.js';
import { pageTitle } from '../src/shell.js';

export const server = new Hono();

server.get('*', (c) => {
  const route = routes.match(c.req.url);
  return renderPage(
    {
      title: pageTitle(route),
      body: html`<my-shell></my-shell>`,
      scripts: ['/src/entry-client.ts'],
    },
    { status: route === undefined ? 404 : 200 },
  );
});
```

The server doesn't run `listen()` (commands never run on the server), so the shell above is
server-rendered with no route and gets one only after hydration, when `listen()` delivers the
URL. Pass the request path as a prop and start from it in `init` if the first render must show
the route, as Gyral's [isomorphic example](/examples/#isomorphic) does: then `listen()` delivers
the same URL and nothing changes.

## Memory history

`makeRouter({ history: 'memory', initial: '/settings' })` keeps history in memory: push, replace,
back and forward work, and the real URL and title are never touched. Use it in tests, and on
servers. `driver.snapshot()` returns the router's `{ href, title, length }` for assertions.
