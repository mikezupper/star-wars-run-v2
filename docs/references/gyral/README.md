# Gyral docs (vendored)

Gyral is new (0.2.0, October 2026), so no model has seen it in training. Read these pages
before writing or changing Gyral code. Don't guess the API from Lit or Cycle.js.

**Source:** `content/docs/` in the gyral.dev repo (`../../gyral.dev` next to this checkout),
commit `3b8fa22` (the 0.2.0 docs), copied 2026-10-06. **Don't edit these files.** To refresh them, copy the
directory again and update the commit here.

Links inside the pages are gyral.dev site paths (`/docs/views/`), not repo paths. The page
with the same name is in this directory (`views.md`).

**API reference:** gyral.dev generates it at build time, so it isn't copied here. Read the
type declarations instead: `node_modules/@gyral/<package>/dist/*.d.ts`.

| Need                                                                | Page                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| First component, project layout                                     | [getting-started.md](getting-started.md)                                                               |
| The model: intent → update → view                                   | [principles.md](principles.md)                                                                         |
| `define()`, props, children                                         | [components.md](components.md)                                                                         |
| Templates, `data-intent`                                            | [views.md](views.md), [intent.md](intent.md)                                                           |
| Pure updates, commands, effects                                     | [update.md](update.md), [effects.md](effects.md)                                                       |
| Shared state                                                        | [stores.md](stores.md)                                                                                 |
| `serverHtml`, `page()`, `prerender()`, hydration                    | [server-rendering.md](server-rendering.md)                                                             |
| Prerendering, static output, which mode when                        | [static-sites.md](static-sites.md), [rendering-modes.md](rendering-modes.md)                           |
| Production builds and hosting                                       | [deploying.md](deploying.md)                                                                           |
| Loading an island only when needed                                  | [code-splitting.md](code-splitting.md)                                                                 |
| Gyral inside other frameworks, or other web components inside Gyral | [other-frameworks.md](other-frameworks.md), [third-party-components.md](third-party-components.md)     |
| Styling components                                                  | [styling.md](styling.md)                                                                               |
| Testing without a DOM (`@gyral/testing`)                            | [testing.md](testing.md)                                                                               |
| Routing, forms, devtools, package list                              | [routing.md](routing.md), [forms.md](forms.md), [devtools.md](devtools.md), [packages.md](packages.md) |
| Mapping from this repo's old Cycle.js code                          | [coming-from-cyclejs.md](coming-from-cyclejs.md)                                                       |
