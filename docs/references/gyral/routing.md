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

- `app.match('/users/7/')` returns `{ name: 'user', params: { id: '7' }, path: '/users/7' }`, or
  `undefined`. The result is a union discriminated by `name`, and `params` is typed from the
  pattern. `path` is the route's canonical path, `href(name, params)`: see
  [One URL per page](#one-url-per-page).
- `app.href('user', { id: 'a b' })` builds `/users/a%20b`.
- Patterns are literal segments and `:params`, nothing more, so matching behaves the same with
  the browser's URLPattern and with Gyral's own matcher. One trailing slash is ignored, an empty
  segment (`/users//7`) never matches, params are decoded, and the first match in table order
  wins.
- Matching never touches `window`, so it's safe on a server.

## Listening to navigation

```ts
// src/shell.ts
import { define, focus, html, type Head } from '@gyral/core';
import { listen, makeRouter, setHead, type RouteLocation, type RouteMatch } from '@gyral/router';
import { app } from './routes.js';

const ORIGIN = 'https://example.com';

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

/** The page's head, used by the server's page() and by setHead() after a navigation. */
export const pageHead = (route: Route): Head => ({
  title: `${pageTitle(route)} · Example`,
  description: 'Users and settings.',
  ...(route === undefined
    ? { robots: 'noindex' }
    : { canonical: new URL(route.path, ORIGIN).href }),
});

export const Shell = define<State, Msg>()('my-shell', {
  // The page itself, so its content is light DOM and it captures same-origin link clicks.
  shadow: false,
  drivers: { router: makeRouter({ captureLinks: true }) },
  init: () => [{ route: undefined }, [listen((location): Msg => ({ _tag: 'Routed', location }))]],
  intent: {},
  update: {
    Routed: (_s, m) => {
      const route = app.match(m.location.href);
      const head = setHead(pageHead(route));
      // After a navigation (not on the page load), move focus to the new page's heading.
      return [{ route }, m.location.seq === 0 ? [head] : [head, focus('main h1')]];
    },
  },
  view: (s) => html`
    <nav aria-label="Main">
      <a href=${app.href('home', {})}>Home</a>
      <a href=${app.href('user', { id: '7' })}>User 7</a>
      <a href=${app.href('settings', {})}>Settings</a>
    </nav>
    <main><h1 tabindex="-1">${pageTitle(s.route)}</h1></main>
  `,
});
```

`listen(toMsg)` is one long-running command. It delivers the current location at once, then
every change (link clicks, `navigate()`, back and forward), until the component disconnects.
Each location carries a `seq`, which counts the URL changes the router has seen: `0` is the URL
the page loaded with. The view is a pure function of the route in state.

## Navigating

Navigation is a command, returned from a reducer like any other:

| Command                        | Does                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `navigate(url, options?)`      | Push a history entry (`replace: true` replaces it; `scroll`, `focusReset`: [see below](#scroll-and-focus)) |
| `back()`, `forward()`, `go(n)` | Move through history                                                                                       |
| `setHead(head)`                | Make the document's head match a `Head` ([see below](#the-head))                                           |

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
both behave the same. Browsers with the Navigation API never download the History API code.

## Scroll and focus

After a navigation, the router does what the browser does for a page load, once the new page
has rendered:

- **Scroll**: to the `#fragment` target, or to the top, after a push or a replace. Back and
  forward restore the position the page was left at.
- **Focus**: to the first `[autofocus]` element, or back to the start of the page, so the next
  Tab starts at the top of the new page instead of on a link that's gone.

Both happen with or without the Navigation API. The browser looks for a fragment's target in
the document only, so render targets in light DOM: page-level components with `shadow: false`,
like the shell above.

Focus at the start of the page tells a screen reader user little about where they landed. Move it to
the new page's heading instead, as the shell does: `focus('main h1')` from the `Routed` reducer,
with `tabindex="-1"` on the heading so it can take focus. Skip it for the first location
(`location.seq === 0`), which is the page load, not a navigation. Focus that your app moves during a
navigation wins: the router doesn't reset it. If the heading appears only after data loads, focus it
from the message that brings the data.

To manage scroll or focus yourself, turn either off for one navigation, with
`navigate(url, { scroll: false, focusReset: false })`, or for every navigation the router
starts, link clicks and back and forward included, with
`makeRouter({ scroll: false, focusReset: false })`. Memory history ignores both.

## Updating the query

A search box or a set of filters often keeps its state in the query string, so the URL can be
shared and survives a reload. Update the query with `navigate` too, not with
`history.replaceState`, which the router never sees: its location, and every `listen()`, would
be one step behind. Replace the entry, so each keystroke doesn't add one, and leave scroll and
focus where they are:

```ts
// src/product-filters.ts
import { define, html } from '@gyral/core';
import { listen, navigate, type RouteLocation } from '@gyral/router';

export interface State {
  readonly query: string;
}

export type Msg =
  | { readonly _tag: 'Routed'; readonly location: RouteLocation }
  | { readonly _tag: 'Typed'; readonly query: string };

export const ProductFilters = define<State, Msg>()('my-product-filters', {
  init: () => [{ query: '' }, [listen((location): Msg => ({ _tag: 'Routed', location }))]],
  intent: { Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }) },
  update: {
    // The URL is the source of truth: a shared link or back and forward set the box.
    Routed: (_s, m) => ({ query: new URLSearchParams(m.location.search).get('q') ?? '' }),
    Typed: (_s, m) => [
      { query: m.query },
      [
        navigate(`?q=${encodeURIComponent(m.query)}`, {
          replace: true,
          scroll: false,
          focusReset: false,
        }),
      ],
    ],
  },
  view: (s, i) => html`
    <search>
      <label for="q">Filter products</label>
      <input id="q" type="search" value=${s.query} data-intent=${i.Typed} />
    </search>
  `,
});
```

The page stays where it is and focus stays in the box while the user types. A relative URL such
as `?q=…` keeps the current path.

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

## The head

A page's head is one value, a `Head` from `@gyral/core`: `title`, `description`, `canonical`,
`robots`, `meta` (Open Graph and other name/property tags), `links` (alternates, icons),
`jsonLd`, `lang` and `dir`. Compute it with a pure function, `pageHead` above, and use it twice:

- **On the server**, spread it into `page()` / `renderPage()`, which writes each entry once,
  right after `<title>`, marked `data-gyral-head`.
- **In the browser**, return `setHead(pageHead(route))` from the `Routed` reducer. It changes
  only the elements it manages: entries the new head drops are removed, and head markup you
  wrote yourself is left alone. The first `Routed` after hydration finds the server's head and
  changes nothing.

So a client navigation leaves exactly the head a page load would, and the two can't disagree.
Titles that depend on data, such as a product's name, come from state the same way. The page
owns its head: components don't add to it, because the server writes the head before any
component renders.

- **`canonical` is absolute**: build it from `match().path` and your origin
  ([One URL per page](#one-url-per-page)).
- **Stylesheets, preloads and the charset aren't head entries.** They belong to `page()`'s own
  options (`stylesheets`, `modulepreload`) or `extraHead`, because changing them on navigation
  would unstyle the page or refetch modules. Development builds reject them in a `Head`.
- **JSON-LD** is data, not script, so `script-src` doesn't apply to it. Under an enforced
  Trusted Types policy, `setHead` leaves JSON-LD as the server wrote it and warns once.

## Server-side routes

On the server, match the request with the same table, choose the status, and render:

```ts
// server/app.ts
import { Hono } from 'hono';
import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import { app as routes } from '../src/routes.js';
import { pageHead } from '../src/shell.js';

export const server = new Hono();

server.get('*', (c) => {
  const url = new URL(c.req.url);
  const route = routes.match(url);
  // One URL per page: /users/7/ redirects to /users/7.
  if (route && route.path !== url.pathname) {
    return Response.redirect(new URL(route.path + url.search, url), 301);
  }
  return renderPage(
    {
      ...pageHead(route),
      body: html`<my-shell></my-shell>`,
      scripts: ['/src/entry-client.ts'],
    },
    { status: route === undefined ? 404 : 200 },
  );
});
```

### One URL per page

The router ignores a trailing slash, so `/users/7` and `/users/7/` match the same route. A page
that answers at two URLs splits its links and its search ranking, and caches store it twice.
`match()` returns the route's canonical `path` (also the canonical spelling of
percent-escapes), so the server redirects every other spelling to it, as above, and keeps the
query string. `path` is a fixed point: matching it gives the same route and the same `path`.

### The first render

The server doesn't run `listen()` (commands never run on the server), so the shell above is
server-rendered with no route and gets one only after hydration, when `listen()` delivers the
URL. Pass the request path as a prop and start from it in `init` if the first render must show
the route, as Gyral's [isomorphic example](/examples/#isomorphic) does: then `listen()` delivers
the same URL and nothing changes.

## Memory history

`makeRouter({ history: 'memory', initial: '/settings' })` keeps history in memory: push, replace,
back and forward work, and the real URL and title are never touched. Use it in tests, and on
servers. `driver.snapshot()` returns the router's `{ href, title, length }` for assertions.
