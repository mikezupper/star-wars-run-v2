# Design docs

Decisions and why they were made. One file per decision. When a decision changes, edit its
file and update its status line, or add a new ADR that supersedes it.

| Doc                                                        | Decision                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [0001-stack.md](0001-stack.md)                             | TypeScript, Vite, Vitest, Gyral; prerendered; `pnpm check`; 80% coverage                                    |
| [0002-data.md](0002-data.md)                               | swapi.info ingested to a committed snapshot; slugs; parse at the boundary                                   |
| [0003-hosting.md](0003-hosting.md)                         | Docker image on a VPS behind Cloudflare; cache headers; offline PWA                                         |
| [0004-design.md](0004-design.md)                           | Semantic HTML, modern CSS, no framework, accessible light and dark                                          |
| [0005-writing.md](0005-writing.md)                         | The writing skill and a brief for each kind of text; playful site voice                                     |
| [0006-workflow.md](0006-workflow.md)                       | Beads for work, `docs/` for knowledge, commit rules, local-only CI                                          |
| [0007-wookieepedia.md](0007-wookieepedia.md)               | Wookieepedia via the XML dump: all ~227k articles, prose, DuckDB Explore, Gyral 0.2.0                       |
| [0008-wookieepedia-only.md](0008-wookieepedia-only.md)     | Wookieepedia replaces swapi.info; sections and URLs; pages on 0.2.0; sample builds in the gate              |
| [0009-ask.md](0009-ask.md)                                 | Ask the archive: an AI model writes SQL; the browser runs it; the key stays on the server                   |
| [0010-one-api.md](0010-one-api.md)                         | Static content, one API: Ask, SQL and the question log on the server, DuckDB as the one engine              |
| [0011-rendered-on-request.md](0011-rendered-on-request.md) | Proposed: pages rendered on request and cached by Cloudflare; SQLite for pages and search; view transitions |
