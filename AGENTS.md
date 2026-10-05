# AGENTS.md — starwars.run

A Star Wars content site: a page for every film, character, planet, species, vehicle and
starship, linked to each other, with search, and usable offline. Built with Gyral and
prerendered to static files; served from a Docker image behind Cloudflare.

This file is a **map**. The linked docs are the system of record. If this file and a doc
disagree, the doc wins; fix this file.

## Start every session

1. `bd prime`, then `bd ready`. Beads is the only task tracker: no TODO files, no plan
   files, no checklists in chat.
2. Claim before coding: `bd update <id> --claim`. File work you discover with
   `--deps discovered-from:<id>`. Close with `bd close <id> --reason "…"`.
3. Read the design doc and product spec for the area you touch (tables below).

## Commands

| Command           | What it does                                                               |
| ----------------- | -------------------------------------------------------------------------- |
| `pnpm install`    | Install. `@gyral/*` comes from npm                                         |
| `pnpm check`      | **The gate.** typecheck · lint · format · invariants · tests (80%) · build |
| `pnpm invariants` | Docs links resolve, indexes list every doc, AGENTS.md stays short          |
| `pnpm dev`        | Dev server on http://localhost:5500, rendering each request                |
| `pnpm build`      | `vite build`, then prerender every page to `dist/`                         |
| `pnpm preview`    | Serve `dist/` with production URL rules on http://localhost:5501           |
| `pnpm test`       | Vitest with coverage; fails below 80% on any metric                        |
| `pnpm format`     | Prettier, in place                                                         |
| `pnpm ingest`     | Fetch swapi.info, parse, check, rewrite `data/`. The only network step     |

Coming with their beads: `pnpm smoke` (`swr-3mo.11`), `pnpm ci:local` (`swr-3mo.12`). Don't call them before they exist.

## Where things are

| Path                                                      | Contents                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| [ARCHITECTURE.md](ARCHITECTURE.md)                        | Layers, what each may import, data flow, output              |
| [docs/design-docs/](docs/design-docs/index.md)            | Decisions (ADRs) and why they were made                      |
| [docs/product-specs/](docs/product-specs/index.md)        | What each feature must do, with acceptance criteria          |
| [docs/references/gyral/](docs/references/gyral/README.md) | Gyral's docs, copied in. **Read before writing Gyral code**  |
| [docs/lessons-learned.md](docs/lessons-learned.md)        | Real bugs: symptom, cause, fix, guard                        |
| `src/site.ts`                                             | Site-wide constants: origin, name, description               |
| `src/domain/`                                             | Record types, slugs, URL paths, catalog (lookup, relations)  |
| `src/ingest/`                                             | swapi.info parser (`swapi.ts`), value parsers, fetch, write  |
| `src/data/`                                               | Loads the snapshot for the build                             |
| `data/`                                                   | The committed snapshot. Written only by `pnpm ingest`        |
| `src/render/`                                             | Route table (`site.ts`), layout, home/list/record templates  |
| `src/render/labels.ts`                                    | **Every user-facing string.** Change copy here, nowhere else |
| `src/styles/site.css`                                     | The one stylesheet                                           |
| `scripts/`                                                | Dev server, build, preview. Thin: logic goes in `src/`       |
| `test/`                                                   | Vitest tests                                                 |
| `public/`                                                 | Copied into `dist/` as is (icons)                            |

## Read before changing…

| Area                                      | Read                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Anything                                  | [0001-stack.md](docs/design-docs/0001-stack.md), [ARCHITECTURE.md](ARCHITECTURE.md) |
| Ingest, data shapes, slugs, links         | [0002-data.md](docs/design-docs/0002-data.md)                                       |
| Docker, headers, caching, service worker  | [0003-hosting.md](docs/design-docs/0003-hosting.md)                                 |
| Markup, CSS, accessibility                | [0004-design.md](docs/design-docs/0004-design.md)                                   |
| Any text: docs, beads, commits, site copy | [0005-writing.md](docs/design-docs/0005-writing.md)                                 |
| Beads, git, CI                            | [0006-workflow.md](docs/design-docs/0006-workflow.md)                               |

## Skills to load

- `beads` for work tracking.
- `sense-of-style-writing` for any substantive text, with the briefs in
  [0005-writing.md](docs/design-docs/0005-writing.md).
- `semantic-html` for templates, `modern-css` for `src/styles`.

## Rules

- **Done means `pnpm check` passes.** There is no CI on push, so nothing else catches it.
- **Respect the layers** in [ARCHITECTURE.md](ARCHITECTURE.md). Browser code never imports
  Node code; the build never touches the network.
- **Parse at the boundary.** Only `src/ingest/` sees raw source JSON.
- **Gyral is new.** Check [docs/references/gyral/](docs/references/gyral/README.md) and the
  `.d.ts` files in `node_modules/@gyral/`. Don't guess from Lit or Cycle.js.
- **URLs end with a slash** and are built from slugs, never source IDs.
- **Commits and pushes are allowed.** No `Co-Authored-By`, `Executed-By` or "Generated with"
  lines. Push code with `git push` and beads with `bd dolt push`.
- **Never add `push`, `pull_request` or `schedule` triggers** to a GitHub workflow. CI runs
  locally, on request.
- **When you fix a real bug**, add an entry to
  [docs/lessons-learned.md](docs/lessons-learned.md).
- **When a rule keeps getting broken**, turn it into a lint rule or a check script, not more
  text here.
