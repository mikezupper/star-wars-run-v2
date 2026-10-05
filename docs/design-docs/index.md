# Design docs

Decisions and why they were made. One file per decision. When a decision changes, edit its
file and update its status line, or add a new ADR that supersedes it.

| Doc                                  | Decision                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------- |
| [0001-stack.md](0001-stack.md)       | TypeScript, Vite, Vitest, Gyral; prerendered; `pnpm check`; 80% coverage  |
| [0002-data.md](0002-data.md)         | swapi.info ingested to a committed snapshot; slugs; parse at the boundary |
| [0003-hosting.md](0003-hosting.md)   | Docker image on a VPS behind Cloudflare; cache headers; offline PWA       |
| [0004-design.md](0004-design.md)     | Semantic HTML, modern CSS, no framework, accessible light and dark        |
| [0005-writing.md](0005-writing.md)   | The writing skill and a brief for each kind of text; playful site voice   |
| [0006-workflow.md](0006-workflow.md) | Beads for work, `docs/` for knowledge, commit rules, local-only CI        |
