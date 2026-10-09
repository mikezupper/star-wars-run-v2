# Gyral feedback from starwars.run

For the Gyral team. Written 2026-10-09, after moving this site from 0.3.1-next.1 to
0.3.1-next.6 (`swr-6sg`); tracked as `swr-nz9`.

starwars.run has a page for every Wookieepedia article, about 227,000 of them. Pages are
rendered with Gyral's `html` and `page()` on the server, on request from SQLite (ADR 0011).
They ship no framework JavaScript, except `/explore/`, which hydrates one island
(`src/islands/explore.ts`). That island asks questions in plain words and runs SQL, streaming
the server's steps over server-sent events. We have used Gyral since 0.1, through 0.2 (on
Lit), 0.3.0 (its own view layer), 0.3.1-next.1 and now next.6.

So this is one team's view: a large multi-page site with one island. We don't use
`@gyral/router`, stores, forms or `@gyral/http`, and say nothing about them here.

## The short version

Gyral has been a good fit, and it keeps getting better. The release notes are the best we've
had from any framework, and `tsc` found every API change. What we'd change, most valuable
first:

1. **Publish prereleases to npm under a `next` dist-tag.** Vendoring, overrides and a
   promised history rewrite cost more than any API change has.
2. **Let the page shell put an inline script before the stylesheets**, and let `HeadMeta`
   carry extra attributes such as `media`. Write head markers only when something can call
   `setHead`.
3. **Fix the template-locations plugin's effect on coverage.** It still costs us 4.4 points of
   branch coverage on next.6, which fails our gate.
4. **Add test helpers for parsers and views**, so tests don't need `as unknown as` casts.
5. **Compute CSP hashes at build time** instead of from whatever modules happen to be imported.

## What worked well

**Speed and size.** 0.3.0's own view layer was a large step. Measured on the full archive
(ADR 0001):

| Measure                           | 0.2.0      | 0.3.0                       |
| --------------------------------- | ---------- | --------------------------- |
| `entry-client.js` (islands), gzip | 61.9 KB    | 18.7 KB, plus 2.8 KB lazily |
| Full build (227,657 pages)        | 7 min 22 s | 2 min 55 s                  |
| Prerendering alone                | 297 s      | 58 s                        |

The synchronous server render, with no DOM shim, is what made rendering on request from
SQLite viable. Moving from prerendered files to rendering per request (`4bde807`) needed no
template or island changes.

**Islands without a meta-framework.** The client entry is one import
(`src/entry-client.ts`). Each server-rendered component hydrates in place and fetches its
hydration code lazily, so pages without islands load none of it. Astro gets the same result
with a compiler and `client:*` directives. In Gyral it is plain modules, and lazy hydration
(`idle`, `visible`) is there when we want it.

**One template language on both sides.** The page shell, article templates and the island all
use `html`. Server-only templates never hydrate, so we don't have to mark which parts are
static, as React Server Components and Solid's islands make you do.

**A strict Content Security Policy.** Since 0.3 the policy has no `'unsafe-inline'` in
`style-src`: island styles are allowed by hash through `styleHashes()`, and a test fails when
they drift (ADR 0003). Trusted Types and CSSOM style writes landed in the 0.3.1 prereleases.
Few frameworks make this easy. React, Svelte and Solid apps usually reach for nonces, which
rule out caching HTML at the edge.

**Tests without a DOM.** `step`, `resolve` and `inputsFor` test the island's update logic
in Node, the way Elm and Redux test reducers. Commands are data, so "a newer query cancels the
old one" is an assertion on a value, not a race in a browser.

**Drivers.** `concurrency: 'switch'` gave us cancellation of stale questions and queries for
free (`src/islands/api.ts`). The `emit` option let Ask stream its steps from server-sent
events. Elsewhere this takes RxJS's `switchMap` or TanStack Query's abort signals.

**Template rules enforced twice.** `@gyral/core/eslint` catches template mistakes in the
editor, and the Vite preset fails the build on them. 0.3 rejecting our two `.value=` bindings
(`398870a`) found real problems.

**Upgrades.** 0.1 to 0.2 needed no code changes. 0.2 to 0.3 was small. next.1 to next.6
touched four files (below). The release notes give, for each change, the reason, the fix and
the size cost, and the step list "run `tsc`, fix what it reports" was accurate. We'd like more
projects to write notes like these.

**Error handling (next.6).** We haven't exercised it yet, but the design is good: one
channel, parent boundaries through a cancelable event, a component fallback, and on the server
a failing component no longer truncates the page. That is parity with React's error
boundaries, Solid's `<ErrorBoundary>` and Svelte 5's `<svelte:boundary>`, and better than most
of them on the server. `renderPage({ onError: 'throw' })` is exactly the switch a route needs.

## Rough edges

Each item says what happened, how other frameworks handle it, and what we suggest.

### 1. Prereleases aren't on npm

**What happened.** Gyral isn't on npm yet, so we vendor tarballs in `vendor/`, commit them,
copy them in the Dockerfile before `pnpm install`, and add a `pnpm.overrides` entry for every
package, because the packages depend on each other at an exact prerelease version (`1cecd1b`,
`swr-7f1.11.1`). Each upgrade adds about 550 KB of binaries to git. We have a deferred
task (`swr-7f1.11.7`) to rewrite history and force-push to remove them. The packaged
`CHANGELOG.md` for next.1 stopped at 0.3.0, so we read changes from the release README.

**Elsewhere.** Svelte, Solid, Astro, Vite and React publish prereleases to npm under a `next`
or `beta` dist-tag (`pnpm add svelte@next`), usually with Changesets' pre mode, which also
keeps every package's changelog current.

**Suggestion.** Publish `0.3.1-next.N` to npm under `next`. One install line replaces the
vendor folder, the overrides, the Dockerfile lines and the history rewrite. If publishing
isn't possible yet, the README's install section could also show pnpm's
`overrides: { "@gyral/core": "$@gyral/core" }`, if that works as it does for npm, to save
writing seven overrides.

### 2. Many breaking prereleases in a short time

**What happened.** Seven prereleases, next.0 to next.6, were packed within 42 hours
(2026-10-07 17:00 to 2026-10-09 11:15 UTC), five of them in the last 14. They included a
deliberate API break in next.4 (two-call `define`, the head model, retries and CSRF moved to drivers) and
trimmed exports in next.6. The copied docs changed by about 2,500 lines in this one upgrade.
The break was announced and well documented. For us it cost little because we have one
island. For an app with fifty components, the mechanical part (`define<…>(` to `define<…>()(`)
is a search-and-replace that teams will each write themselves.

**Elsewhere.** Svelte ships `npx sv migrate svelte-5`, Next.js ships `@next/codemod`, and React
publishes codemods for each major version. Angular runs migrations on `ng update`.

**Suggestion.** Ship a codemod with breaking prereleases, even a small `jscodeshift` or
ast-grep script for the two-call `define` and `intents<Msg>()` to `intentsOf<typeof X>()`. And
batch breaks: one breaking prerelease per week is easier to follow than several in a day.

### 3. The page shell controls head order, and the head model can't express everything

**What happened.** Moving `page({ head })` to `page({ extraHead })` failed our test that the
theme script runs before the stylesheet, which prevents a flash of the wrong theme.
`page()` writes `stylesheets` before `extraHead`, and offers no place before it. We kept the
stylesheet link in `extraHead`, after the script (`src/render/layout.ts`).

We then tried moving our head into the `Head` fields, as the migration guide suggests, and
found two more problems:

- `HeadMeta` takes only `name` or `property` plus `content`. Our two
  `<meta name="theme-color" media="(prefers-color-scheme: dark)">` tags need `media`.
  `HeadLink` already allows any attribute, so the two types differ for no reason we can see.
- Every managed element gets a `data-gyral-head` marker. Our pages never change their head in
  the browser: there is no client router, and navigation is a full page load with view
  transitions. On a site with 227,000 pages, 14 markers per page is dead weight.

So only the title and description go through `Head`; everything else stays in `extraHead`.

**Elsewhere.**

- **Astro, SvelteKit (`app.html`), Qwik (`root.tsx`) and SolidStart (`entry-server.tsx`)** let
  you write the document yourself, so order is yours. Astro's `<script is:inline>` stays
  exactly where you put it.
- **Next.js** models theme colors per scheme directly:
  `viewport.themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#060a13' }]`.
- **React 19** hoists `<title>`, `<meta>` and `<link>` from any component, with any attributes,
  and orders stylesheets by `precedence`.
- **Head libraries that hydrate the head** mark elements too (`@solidjs/meta` writes
  `data-sm`, react-helmet wrote `data-react-helmet`), so the marker itself is normal. What's
  missing is a way to turn it off when nothing will ever read it.

**Suggestion.**

- Give `HeadMeta` the same `[attribute: string]: string` index signature as `HeadLink`.
- Add a place before the stylesheets, for example `page({ headStart })`, or an inline script
  option that Gyral also hashes for the CSP, since it already hashes styles.
- Write `data-gyral-head` only when it can matter: an option such as
  `page({ managedHead: false })`, or omit markers when the client bundle has no `setHead`.
  The build already knows which spec features are used.

### 4. The template-locations plugin still breaks coverage

**What happened.** On next.1, `gyral:template-locations` rewrote each template tag as
`html.at?.("file:line:col") ?? html`. V8 counts the unused fallback as an uncovered branch in
our code, so branch coverage fell to 77.42% with every test passing
(`docs/lessons-learned.md`, `swr-72v`). We remove the plugin from the preset in
`vitest.config.ts`. On next.6 it is unchanged. With the full preset, branch coverage is 76.09%;
without the plugin it is 80.51%. Our gate is 80%.

**Elsewhere.** Instrumenting plugins either keep generated code out of the source map, or mark
it: Vitest's V8 provider honors `/* v8 ignore next */`, and Istanbul honors
`/* istanbul ignore next */`.

**Suggestion.** Emit `/* v8 ignore next */` (and the Istanbul form) before the fallback, or map
the generated expression to no original position, or emit `html.at(…)` without the optional
call when the plugin knows the development runtime is present. Failing that, skip the plugin
when Vitest runs with coverage, and say so in the testing docs.

### 5. Testing parsers and views needs casts

**What happened.** We test the island's parsers directly, for example "Ctrl+Enter runs the
query, Enter alone doesn't". `spec.intent` isn't typed for direct calls, so the test casts it,
and since next.6 it also builds the context by hand
(`test/islands/explore.test.ts`):

```ts
const ctx = { props: {}, state: live(), read: readerOf([]) };
const parsers = spec.intent as unknown as Record<string, (i: unknown, c: typeof ctx) => unknown>;
const parse = (input: unknown) => parsers['Run']?.(input, ctx);
```

Rendering a view in Node takes casts too: `spec.view(state, names as never, { props: {} } as never)`.
Server-rendered markup in tests includes development markers (`<!--gyral:ID-->`), which we
strip with a regex in `test/site.test.ts`. `RenderOptions.dev` exists, but our pages render
through the site's own `fetch`, so a test helper would be easier to reach for.

**Elsewhere.** Elm's `Test.Html.Query` queries a view's output without a DOM. Testing Library
(React, Solid, Svelte, Preact) drives the real DOM, with `user-event` building realistic
events. Redux tests call reducers and action creators directly, fully typed.

**Suggestion.** In `@gyral/testing`:

- `parse(Component, 'Run', input, { state, props })`, typed by the component's intent names and
  messages, with a default context.
- Input builders such as `keydown('Enter', { ctrlKey: true })` and `submit()` that produce a
  valid `IntentInput`.
- `renderView(Component, state)` that returns markup without development markers, or a
  `stripMarkers(html)` export.

### 6. Intents: boilerplate and loose event types

**What happened.** Three of the island's eight parsers only forward a message with no payload:
`Ask: () => ({ _tag: 'Ask' })`, `StartOver: () => ({ _tag: 'StartOver' })` and `EditSql`. The
others mostly turn `value` into a field (`Number(value)`, `value ?? ''`). The
keyboard parser has to cast: `(event as KeyboardEvent).ctrlKey`, because `IntentInput.event` is
an `Event`, though the element says `data-intent-on="keydown"`.

**Elsewhere.** Elm writes `onClick Ask`. React and Solid type each handler by its event
(`onKeyDown` receives a `KeyboardEvent`). Svelte types `onkeydown` the same way.

**Suggestion.** A shorthand for payload-free messages, for example `intent: { Ask: true }` or a
`same('Ask', 'StartOver')` helper. And a typed parser, for example
`Run: on('keydown', ({ event }) => …)`, where `event` is a `KeyboardEvent`. ESLint could check
that the template's `data-intent-on` agrees.

### 7. CSP hashes depend on what has been imported

**What happened.** `styleHashes()` from `@gyral/core/server` knows only the components that
have registered. `scripts/caddyfile.ts` imports each island for its side effect before asking,
and a new island that someone forgets to import there gets no hash. Its styles would then be
blocked in production. A test catches drift for the islands we list, not for one we forget.

**Elsewhere.** SvelteKit's `kit.csp` with `mode: 'hash'` computes hashes for everything it
writes. Astro's CSP support also computes hashes at build time.

**Suggestion.** Have the Vite preset write the style hashes of every component in the client
build to a manifest. Then a server can read the manifest instead of depending on import order.

### 8. Size creeps up with features we don't use

**What happened.** The island's entry chunk grew from 17.52 KB to 18.45 KB gzip between next.1
and next.6 (+0.93 KB); the hydration chunk went from 2.84 to 2.88 KB. The release notes put
error handling at about +0.65–0.8 KB per app. We use neither `error` nor `Errored`.

**Elsewhere.** Svelte 5 and Solid compile away what a component doesn't use. Gyral already
does this for view transitions, frames and custom states.

**Suggestion.** The pay-for-what-you-use pass for `spec.error` and `Errored` that the notes
mention. We'd take it over new features.

### 9. Smaller things

- **Exporting drivers only for tests.** `src/islands/api.ts` exports a `drivers` object only
  so tests can call `inputsFor(commands, drivers.query)`. Matching by driver name
  (`inputsFor(commands, 'query')`) would remove the export.
- **The `Hydrated` message.** Before next.6 a test needed
  `{ _tag: 'Hydrated' } as unknown as Msg`. next.6 types it, with a required `serverRendered`
  field. An `@gyral/testing` constant such as `hydrated` (the name is taken by the SSR helper)
  would make the common case shorter.

## How the pieces compare

| Concern                     | Gyral (next.6)                                       | Closest elsewhere                                                       |
| --------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| Islands                     | Import the component; hydration chunk loads lazily   | Astro `client:*`, Fresh islands; Qwik resumes instead                   |
| Server render               | Synchronous, streamed in chunks; load data first     | React and Solid stream async with Suspense; Astro awaits in frontmatter |
| Head                        | `Head` model with markers, plus `extraHead`          | Astro and SvelteKit: write it; Next.js Metadata; React 19 hoisting      |
| Effects                     | Commands as data, drivers with concurrency policies  | Elm commands; RxJS operators; TanStack Query                            |
| Unit tests of logic         | `step`, `resolve`, `inputsFor` in Node               | Elm and Redux reducer tests                                             |
| Component and view tests    | `renderOnServer`, `mountSsr`; casts for direct calls | Testing Library; Elm `Test.Html.Query`                                  |
| Errors                      | One channel, boundaries, server isolation            | React error boundaries, Solid `<ErrorBoundary>`, `<svelte:boundary>`    |
| Strict CSP                  | Style hashes, Trusted Types, CSSOM style writes      | SvelteKit `kit.csp` hashes; most others use nonces                      |
| Template checks             | ESLint rule plus build-time compiler                 | Svelte compiler warnings; Angular strict templates                      |
| Prerelease distribution     | Tarballs, vendored                                   | npm `next` dist-tag everywhere                                          |
| Migrations between versions | Excellent notes; `tsc` finds every change            | Codemods (Svelte, Next.js, React), `ng update`                          |

## What next.1 to next.6 took

For scale, the whole migration on this site:

- `src/islands/explore.ts`: `define<State, Msg>('swr-explore', …)` became
  `define<State, Msg>()('swr-explore', …)`.
- `src/render/layout.ts`: `head` became `extraHead`, with the stylesheet kept in it (item 3).
- `test/islands/explore.test.ts`: parsers called with a context; the `Hydrated` cast replaced by
  the typed message.
- `test/site.test.ts`: the description regex allows the new `data-gyral-head` attribute.

`pnpm check` passed afterwards: 263 tests, and the browser smoke test over 393 pages in both
themes, search, offline, Explore and the dev server.
